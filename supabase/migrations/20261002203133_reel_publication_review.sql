-- Ordinary reels and caption edits must pass a separate human publication
-- review. A finished private reel or reward review is not publication approval.
alter table public.community_posts drop constraint community_posts_state_check;
alter table public.community_posts add constraint community_posts_state_check
 check (state in ('pending','published','unpublished','rejected','removed'));
alter table public.community_posts
 add column approved_version int check(approved_version>0),
 add column reviewed_at timestamptz,
 add column reviewed_by uuid references public.profiles,
 add column review_notes text not null default '' check(length(review_notes)<=1000);
create index community_posts_pending_review on public.community_posts(created_at,id) where state='pending';

-- No historical public upload is implicitly approved by this migration.
-- Private originals, exact asset identities, and commercial history stay intact.
update public.community_posts set state='pending',version=version+1,updated_at=now() where state='published';

create or replace function private.community_available(p_id uuid) returns boolean
 language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.community_posts p join public.profiles u on u.id=p.owner_id join public.media_assets a on a.id=p.asset_id
 where p.id=p_id and p.state='published' and p.approved_version=p.version and p.reviewed_at is not null
 and u.account_status='active' and a.kind='reel' and a.state='sealed' and a.deleted_at is null)
$$;

-- Preserve the latest compatible DTOs and operations (social identity, account
-- type, series context and licensing) behind service-only private functions.
alter function private.community_post(uuid) rename to community_post_before_reel_review;
create function private.community_post(p_id uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select private.community_post_before_reel_review(p_id)||jsonb_build_object('reviewNotes',case when p.state='rejected' then p.review_notes else '' end)
 from public.community_posts p where p.id=p_id
$$;
alter function private.community_offer(uuid,uuid) rename to community_offer_before_reel_review;
create function private.community_offer(p_id uuid,p_actor uuid) returns jsonb
 language sql stable security invoker set search_path='' as $$
 select private.community_offer_before_reel_review(p_id,p_actor)||
 case when private.community_available(o.post_id) then '{}'::jsonb else '{"mediaUrl":null}'::jsonb end
 from public.licensing_offers o where o.id=p_id
$$;
alter function public.sq_community_read(uuid,text,jsonb) set schema private;
alter function private.sq_community_read(uuid,text,jsonb) rename to community_read_before_reel_review;
create function public.sq_community_read(p_actor uuid,p_view text,p_input jsonb) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=private.community_read_before_reel_review(p_actor,p_view,p_input);
 if p_view='operator' then
  -- The preserved read already checks active identity and the operator role.
  result:=result||jsonb_build_object('reviewPosts',coalesce((select jsonb_agg(
   private.community_post(p.id)||jsonb_build_object('mediaUrl','/api/community/reviews/'||p.id||'/media',
    'thumbnailUrl','/api/community/reviews/'||p.id||'/media?thumbnail=1') order by p.created_at,p.id)
   from public.community_posts p join public.profiles u on u.id=p.owner_id
   where p.state='pending' and u.account_status='active'),'[]'::jsonb));
 end if;
 return result;
end $$;

alter function public.sq_community_mutate(uuid,text,jsonb,text,text) set schema private;
alter function private.sq_community_mutate(uuid,text,jsonb,text,text) rename to community_mutate_before_reel_review;
create function public.sq_community_mutate(p_actor uuid,p_action text,p_input jsonb,p_key text,p_hash text) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare cached jsonb; result jsonb; p public.community_posts; r public.quest_runs; a public.media_assets;
 target uuid:=(p_input->>'id')::uuid; expected int:=(p_input->>'expectedVersion')::int;
begin
 if p_action not in ('post_publish','post_update','post_review') then
  return private.community_mutate_before_reel_review(p_actor,p_action,p_input,p_key,p_hash);
 end if;
 if p_action='post_review' and not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'community_'||p_action,p_key,p_hash); if cached is not null then return cached; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,7001));
 if p_action='post_publish' then
  if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
  select * into r from public.quest_runs where id=(p_input->>'runId')::uuid and owner_id=p_actor for share;
  if not found or r.status<>'finalized' or r.privacy_redacted_at is not null then raise exception 'reel_unavailable'; end if;
  select * into a from public.media_assets where id=(p_input->>'assetId')::uuid and run_id=r.id and owner_id=p_actor and kind='reel' and state='sealed' for share;
  if not found or not exists(select 1 from public.render_jobs where output_asset_id=a.id and status='ready') then raise exception 'reel_unavailable'; end if;
  select * into p from public.community_posts where asset_id=a.id;
  if p.id is not null then
   if p.owner_id<>p_actor then raise exception 'forbidden'; end if;
   if p.state='removed' then raise exception 'post_removed'; end if;
  else
   insert into public.community_posts(owner_id,run_id,asset_id,template_id,template_version,caption,brand_opt_in,state)
   values(p_actor,r.id,a.id,r.template_id,(r.snapshot->>'version')::int,p_input->>'caption',(p_input->>'brandOptIn')::boolean,'pending') returning * into p;
   insert into private.audit_events(actor_id,action,target_id) values(p_actor,'community_post_submitted',p.id::text);
  end if;
 elsif p_action='post_update' then
  select * into p from public.community_posts where id=target and owner_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if p.version is distinct from expected then raise exception 'stale_version'; end if;
  if p.state='removed' then raise exception 'post_removed'; end if;
  if (p_input->>'published')::boolean and not exists(select 1 from public.media_assets where id=p.asset_id and state='sealed' and kind='reel' and deleted_at is null) then raise exception 'reel_unavailable'; end if;
  -- Editing or re-enabling any public upload invalidates its approval. Owners
  -- can withdraw it but can never mark their own pending/rejected post approved.
  update public.community_posts set caption=p_input->>'caption',brand_opt_in=(p_input->>'brandOptIn')::boolean,
   state=case when (p_input->>'published')::boolean then 'pending' else 'unpublished' end,
   approved_version=null,reviewed_at=null,reviewed_by=null,review_notes='',version=version+1,updated_at=now()
   where id=target returning * into p;
 elsif p_action='post_review' then
  select cp.* into p from public.community_posts cp join public.profiles u on u.id=cp.owner_id
   where cp.id=target and u.account_status='active' for update of cp;
  if not found then raise exception 'not_found'; end if;
  if p.owner_id=p_actor then raise exception 'self_review_forbidden'; end if;
  if p.version is distinct from expected then raise exception 'stale_version'; end if;
  if p.state<>'pending' then raise exception 'post_review_unavailable'; end if;
  if coalesce(p_input->>'decision','') not in ('approve','reject') or (p_input->>'reviewedContent')::boolean is distinct from true
   or length(btrim(coalesce(p_input->>'notes',''))) not between 3 and 1000 then raise exception 'publication_review_required'; end if;
  if not exists(select 1 from public.media_assets where id=p.asset_id and owner_id=p.owner_id and kind='reel' and state='sealed' and deleted_at is null)
   then raise exception 'reel_unavailable'; end if;
  update public.community_posts set state=case when p_input->>'decision'='approve' then 'published' else 'rejected' end,
   approved_version=case when p_input->>'decision'='approve' then version+1 else null end,
   reviewed_at=now(),reviewed_by=p_actor,review_notes=btrim(p_input->>'notes'),version=version+1,updated_at=now()
   where id=target returning * into p;
  insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'community_post_reviewed',target::text,
   jsonb_build_object('decision',p_input->>'decision','reviewedVersion',expected,'notes',p_input->>'notes'));
  perform private.community_notify(p.owner_id,p_actor,'post_reviewed',target::text||':'||p.version,
   case when p.state='published' then 'Your video was approved for publication.' else 'Your video needs changes before publication.' end,'/posts/'||target);
 end if;
 result:=private.community_post(p.id);
 return private.end_request(p_actor,'community_'||p_action,p_key,result);
end $$;

-- Operator-only full video preview is separate from the public media route.
-- Each thumbnail/range/retry rechecks the operator role and active accounts.
create function public.sq_community_review_media(p_actor uuid,p_post uuid) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 perform private.assert_actor(p_actor);
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 select jsonb_build_object('object_key',a.object_key,'mime',a.mime,'bytes',a.bytes,'thumbnail_key',a.metadata->>'thumbnail_key') into result
 from public.community_posts p join public.media_assets a on a.id=p.asset_id join public.profiles u on u.id=p.owner_id
 where p.id=p_post and p.state='pending' and u.account_status='active'
 and a.owner_id=p.owner_id and a.kind='reel' and a.state='sealed' and a.deleted_at is null;
 if result is null then raise exception 'not_found'; end if;
 return result;
end $$;
create or replace function public.sq_community_media(p_actor uuid,p_post uuid,p_offer uuid) returns jsonb
 language plpgsql stable security invoker set search_path='' as $$
declare asset uuid; owner uuid; result jsonb;
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if num_nonnulls(p_post,p_offer)<>1 then raise exception 'not_found'; end if;
 if p_post is not null then
  select p.asset_id,p.owner_id into asset,owner from public.community_posts p where p.id=p_post;
  if not found or (owner is distinct from p_actor and (not private.community_available(p_post) or private.community_blocked(owner,p_actor))) then raise exception 'not_found'; end if;
 else
  select o.asset_id,o.creator_id into asset,owner from public.licensing_offers o
  join public.business_profiles b on b.user_id=o.brand_id join private.licensing_fulfillments f on f.offer_id=o.id
  where o.id=p_offer and private.community_available(o.post_id) and o.brand_id=p_actor and b.state='approved'
   and o.state='completed' and not o.suspended and now()>=f.usage_starts_at and now()<f.usage_ends_at;
  if not found then raise exception 'commercial_access_unavailable'; end if;
 end if;
 select jsonb_build_object('object_key',a.object_key,'mime',a.mime,'bytes',a.bytes,'thumbnail_key',a.metadata->>'thumbnail_key') into result
 from public.media_assets a join public.profiles u on u.id=a.owner_id where a.id=asset and a.owner_id=owner and a.kind='reel' and a.state='sealed' and a.deleted_at is null and u.account_status='active';
 if result is null then raise exception 'not_found'; end if;
 return result;
end $$;

revoke all on function private.community_post(uuid),private.community_offer(uuid,uuid),
 private.community_read_before_reel_review(uuid,text,jsonb),private.community_mutate_before_reel_review(uuid,text,jsonb,text,text),
 public.sq_community_read(uuid,text,jsonb),public.sq_community_mutate(uuid,text,jsonb,text,text),public.sq_community_review_media(uuid,uuid)
 from public,anon,authenticated;
grant execute on function private.community_post(uuid),private.community_offer(uuid,uuid),
 private.community_read_before_reel_review(uuid,text,jsonb),private.community_mutate_before_reel_review(uuid,text,jsonb,text,text),
 public.sq_community_read(uuid,text,jsonb),public.sq_community_mutate(uuid,text,jsonb,text,text),public.sq_community_review_media(uuid,uuid)
 to service_role;

-- Owner-only, read-only preflight for the Worker's public Series text review.
-- Successful replay precedes version validation, preserving lost-response
-- retry behavior without re-sending public content to a provider. Canonical
-- snapshots mirror sq_series_mutate; no private run/account DTO is returned.
create function public.sq_series_review_preflight(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare request private.idempotency_records; s public.quest_series; old_part public.quest_series_parts; source_part public.quest_series_parts; t public.quest_templates; part jsonb; target uuid; parts jsonb:='[]'; current_content jsonb; submitted_content jsonb; part_locked boolean; part_attempted boolean;
begin
 perform private.assert_actor(p_actor);
 select * into request from private.idempotency_records where actor_id=p_actor and operation='series_save' and key=p_key;
 if found then
  if request.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
  if request.result is not null then return jsonb_build_object('replay',request.result); end if;
 end if;
 if p_input->>'state'<>'published' then return jsonb_build_object('requiresReview',false); end if;
 if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
 if jsonb_typeof(p_input->'parts')<>'array' or jsonb_array_length(p_input->'parts') not between 1 and 40 then raise exception 'invalid_series'; end if;
 target:=(p_input->>'id')::uuid;
 select * into s from public.quest_series where id=target for share;
 if found then
  if s.author_id<>p_actor then raise exception 'forbidden'; end if;
  if s.version<>(p_input->>'expectedVersion')::int then raise exception 'stale_version'; end if;
  select * into source_part from public.quest_series_parts where series_id=target and source_run_id is not null order by position limit 1;
  if s.state='published' then
   select jsonb_build_object('title',s.title,'premise',s.premise,'parts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'templateId',p.template_id,'prerequisiteReason',p.prerequisite_reason,'quest',p.quest_snapshot) order by p.position),'[]'::jsonb)) into current_content from public.quest_series_parts p where p.series_id=s.id and p.published;
  end if;
 elsif coalesce((p_input->>'expectedVersion')::int,0)<>0 then raise exception 'stale_version'; end if;
 for part in select value from jsonb_array_elements(p_input->'parts') loop
  if not coalesce((part->>'published')::boolean,false) then continue; end if;
  select * into old_part from public.quest_series_parts where id=(part->>'id')::uuid;
  if found and old_part.series_id is distinct from target then raise exception 'forbidden'; end if;
  part_locked:=old_part.first_published_at is not null or old_part.source_run_id is not null;
  part_attempted:=private.series_part_has_run((part->>'id')::uuid);
  select qt.* into t from public.quest_templates qt left join public.quest_authors a on a.template_id=qt.id
   where qt.id=part->>'templateId' and (((part_locked or part_attempted) and qt.id=old_part.template_id) or (qt.published and not private.community_blocked(p_actor,a.author_id))) for share of qt;
  if not found then raise exception 'template_unavailable'; end if;
  if part_locked or part_attempted then t.version:=old_part.template_version; t.content:=old_part.quest_snapshot; end if;
  if source_part.id is not null then
   if t.id<>source_part.template_id or (old_part.id is null and t.version<>source_part.template_version) then raise exception 'series_template_mismatch'; end if;
   t.version:=source_part.template_version; t.content:=source_part.quest_snapshot;
  end if;
  parts:=parts||jsonb_build_array(jsonb_build_object('id',part->>'id','title',part->>'title','templateId',t.id,'prerequisiteReason',coalesce(part->>'prerequisiteReason',''),'quest',t.content));
 end loop;
 if jsonb_array_length(parts)=0 then raise exception 'invalid_series'; end if;
 submitted_content:=jsonb_build_object('title',p_input->>'title','premise',p_input->>'premise','parts',parts);
 if submitted_content=current_content then return jsonb_build_object('requiresReview',false); end if;
 return jsonb_build_object('requiresReview',true,'publicContent',submitted_content);
end $$;
revoke all on function public.sq_series_review_preflight(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.sq_series_review_preflight(uuid,jsonb,text,text) to service_role;
