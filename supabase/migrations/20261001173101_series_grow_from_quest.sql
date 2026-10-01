-- A series grows out of a quest a person already did. The author films the next
-- part of their own series before the series or the part is published, so the
-- acceptance guard and the owner's availability view no longer require public
-- state for the author. Nothing changes for other viewers: unpublished parts and
-- draft series stay unavailable and invisible to them. No rows are rewritten.

-- History lookup is indexed and service-only. Any accepted run, including an
-- abandoned attempt, freezes its part identity for durable attribution.
create index quest_series_run_part on public.quest_runs ((snapshot->'series'->>'partId')) where snapshot ? 'series';
create function private.series_part_has_run(p_part uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.quest_runs r where r.snapshot ? 'series' and r.snapshot->'series'->>'partId'=p_part::text)
$$;
revoke all on function private.series_part_has_run(uuid) from public,anon,authenticated;
grant execute on function private.series_part_has_run(uuid) to service_role;

-- A public video is a separate publication choice from its series. Owner run
-- context stays private-readable, but public DTOs only expose attribution while
-- that exact part and its series are public. Keep the original accepted text.
create or replace function private.series_public_context(p_run uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select case when s.state='published' and p.published and s.privacy_redacted_at is null and p.privacy_redacted_at is null and u.account_status='active'
  then coalesce(r.snapshot->'series',p.source_context) else null end
 from public.quest_runs r
 left join public.quest_series_parts p on p.id=(r.snapshot->'series'->>'partId')::uuid or p.source_run_id=r.id
 left join public.quest_series s on s.id=p.series_id
 left join public.profiles u on u.id=s.author_id
 where r.id=p_run
$$;

create or replace function private.series_stamp_run() returns trigger language plpgsql security invoker set search_path='' as $$
declare context jsonb; p public.quest_series_parts; s public.quest_series;
begin
 context:=nullif(current_setting('sidequest.series_acceptance',true),'')::jsonb;
 if context is null then return new; end if;
 if context->>'actorId'<>new.owner_id::text then raise exception 'forbidden'; end if;
 select * into p from public.quest_series_parts where id=(context->>'partId')::uuid;
 select * into s from public.quest_series where id=p.series_id for share;
 select * into p from public.quest_series_parts where id=(context->>'partId')::uuid for share;
 -- The author may attempt any part of their own series, published or not.
 if p.id is null or (s.author_id<>new.owner_id and (not p.published or s.state<>'published')) or not exists(select 1 from public.profiles where id=s.author_id and account_status='active') or private.community_blocked(new.owner_id,s.author_id) then raise exception 'series_unavailable'; end if;
 if p.privacy_redacted_at is not null then raise exception 'series_unavailable'; end if;
 if p.template_id<>new.template_id or p.template_version<>(new.snapshot->>'version')::int then raise exception 'series_template_mismatch'; end if;
 if new.snapshot->>'inspiredByPostId' is not null and not exists(select 1 from public.community_posts cp join public.quest_runs cr on cr.id=cp.run_id where cp.id=(new.snapshot->>'inspiredByPostId')::uuid and private.series_public_context(cr.id)->>'partId'=p.id::text) then raise exception 'series_inspiration_mismatch'; end if;
 if p.prerequisite_part_id is not null and not exists(select 1 from public.quest_runs r where r.owner_id=new.owner_id and r.status='finalized' and private.series_run_context(r.id)->>'id'=s.id::text and private.series_run_context(r.id)->>'partId'=p.prerequisite_part_id::text) then raise exception 'series_prerequisite'; end if;
 if exists(select 1 from public.quest_authors a where a.template_id=new.template_id and private.community_blocked(new.owner_id,a.author_id)) then raise exception 'series_unavailable'; end if;
 new.snapshot:=new.snapshot||jsonb_build_object('series',jsonb_build_object('id',s.id,'title',s.title,'partId',p.id,'partTitle',p.title,'position',p.position));
 new.snapshot_hash:=private.content_hash(new.snapshot);
 return new;
end $$;

create or replace function public.sq_series_read(p_actor uuid,p_view text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.quest_series; result jsonb; parts jsonb; completed jsonb; current_part uuid; active_run uuid; all_done boolean;
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if p_view='run' then
  if p_actor is null or not exists(select 1 from public.quest_runs r where r.id=(p_input->>'id')::uuid and r.owner_id=p_actor) then raise exception 'series_run_unavailable'; end if;
  return private.series_run_context((p_input->>'id')::uuid);
 elsif p_view='templates' then
  if p_actor is null then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'version',t.version,'category',t.category,'intensity',t.intensity) order by t.title,t.id) from public.quest_templates t left join public.quest_authors a on a.template_id=t.id where t.published and not private.community_blocked(p_actor,a.author_id)),'[]'::jsonb);
 elsif p_view='list' then
  if coalesce((p_input->>'mine')::boolean,false) and p_actor is null then raise exception 'forbidden'; end if;
  return coalesce((select jsonb_agg(private.series_summary(v.id,p_actor) order by v.created_at desc,v.id) from (select ss.* from public.quest_series ss join public.profiles u on u.id=ss.author_id where u.account_status='active' and not private.community_blocked(p_actor,ss.author_id)
   and (case when coalesce((p_input->>'mine')::boolean,false) then ss.author_id=p_actor else ss.state='published' end)
   and (p_input->>'creatorId' is null or ss.author_id=(p_input->>'creatorId')::uuid) order by ss.created_at desc,ss.id limit 100) v),'[]'::jsonb);
 elsif p_view='part' then
  select ss.* into s from public.quest_series ss join public.quest_series_parts p on p.series_id=ss.id where p.id=(p_input->>'id')::uuid;
  if not found then raise exception 'series_unavailable'; end if;
  result:=public.sq_series_read(p_actor,'detail',jsonb_build_object('id',s.id));
  select p into parts from jsonb_array_elements(result->'parts') p where p->>'id'=p_input->>'id';
  if parts is null then raise exception 'series_unavailable'; end if;
  return jsonb_build_object('series',result-'parts'-'progress'-'isOwner'-'formatLocked','part',parts,'canStart',(parts->>'available')::boolean,'reason',parts->'unavailableReason');
 elsif p_view<>'detail' then raise exception 'not_found'; end if;
 select ss.* into s from public.quest_series ss join public.profiles u on u.id=ss.author_id where ss.id=(p_input->>'id')::uuid and u.account_status='active' and (ss.state='published' or ss.author_id=p_actor) and not private.community_blocked(p_actor,ss.author_id);
 if not found then raise exception 'series_unavailable'; end if;
 completed:=coalesce((select jsonb_agg(distinct private.series_run_context(r.id)->>'partId') from public.quest_runs r where r.owner_id=p_actor and r.status='finalized' and private.series_run_context(r.id)->>'id'=s.id::text),'[]'::jsonb);
 -- The author sees and may attempt their own unpublished parts; everyone else needs a published part of a published series.
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'position',p.position,'locked',p.first_published_at is not null or p.source_run_id is not null,'attempted',case when s.author_id=p_actor then private.series_part_has_run(p.id) else false end,'title',p.title,'templateId',p.template_id,'templateVersion',p.template_version,'prerequisitePartId',p.prerequisite_part_id,'prerequisiteReason',p.prerequisite_reason,'published',p.published,'quest',p.quest_snapshot,
  'available',((p.published and s.state='published') or s.author_id=p_actor) and p.privacy_redacted_at is null and t.published and t.version=p.template_version and not private.community_blocked(p_actor,a.author_id) and (p.prerequisite_part_id is null or completed ? p.prerequisite_part_id::text),
  'unavailableReason',case when (not p.published or s.state<>'published') and s.author_id<>p_actor then 'This part is still a draft.' when p.privacy_redacted_at is not null then 'This part is no longer available.' when not t.published or private.community_blocked(p_actor,a.author_id) then 'This quest is no longer available.' when t.version<>p.template_version then 'This part’s original quest version is no longer available.' when p.prerequisite_part_id is not null and not (completed ? p.prerequisite_part_id::text) then 'Complete the required earlier part: '||p.prerequisite_reason else null end) order by p.position),'[]'::jsonb) into parts
 from public.quest_series_parts p join public.quest_templates t on t.id=p.template_id left join public.quest_authors a on a.template_id=t.id where p.series_id=s.id and (p.published or s.author_id=p_actor);
 result:=private.series_summary(s.id,p_actor)||jsonb_build_object('parts',parts,'isOwner',s.author_id=p_actor,'formatLocked',s.first_published_at is not null,'progress',null);
 if p_actor is not null then
  select r.id,(private.series_run_context(r.id)->>'partId')::uuid into active_run,current_part from public.quest_runs r where r.owner_id=p_actor and private.series_run_context(r.id)->>'id'=s.id::text and r.status in ('accepted','in_progress','review_needed') order by r.created_at desc limit 1;
  if current_part is null then select (p->>'id')::uuid into current_part from jsonb_array_elements(parts) p where (p->>'available')::boolean and not (completed ? (p->>'id')) order by (p->>'position')::int limit 1; end if;
  select exists(select 1 from jsonb_array_elements(parts) p where (p->>'published')::boolean) and not exists(select 1 from jsonb_array_elements(parts) p where (p->>'published')::boolean and not (completed ? (p->>'id'))) into all_done;
  result:=result||jsonb_build_object('progress',jsonb_build_object('completedPartIds',completed,'currentPartId',current_part,'activeRunId',active_run,'complete',s.kind='finite' and all_done,'caughtUp',s.kind='ongoing' and all_done));
 end if;
 return result;
end $$;


create or replace function private.series_guard_part() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.privacy_redacted_at is not null then
  if not exists(select 1 from public.quest_series s join public.profiles u on u.id=s.author_id where s.id=old.series_id and u.account_status in ('deleting','deleted')) then raise exception 'redaction_requires_deletion'; end if;
  if (to_jsonb(new)-array['title','quest_snapshot','prerequisite_reason','published','privacy_redacted_at','source_context']) is distinct from (to_jsonb(old)-array['title','quest_snapshot','prerequisite_reason','published','privacy_redacted_at','source_context']) or new.title<>'Deleted part' or new.quest_snapshot<>'{"redacted":true}'::jsonb or new.published or new.source_context is not null or new.prerequisite_reason<>(case when old.prerequisite_part_id is null then '' else 'Deleted prerequisite.' end) then raise exception 'invalid_deletion_redaction'; end if;
  return new;
 end if;
 if old.first_published_at is not null then
  if tg_op='DELETE' then raise exception 'published_part_immutable'; end if;
  if (to_jsonb(new)-'published') is distinct from (to_jsonb(old)-'published') then raise exception 'published_part_immutable'; end if;
 elsif old.source_run_id is not null then
  if tg_op='DELETE' then raise exception 'published_part_immutable'; end if;
  if (to_jsonb(new)-array['published','first_published_at']) is distinct from (to_jsonb(old)-array['published','first_published_at']) then raise exception 'published_part_immutable'; end if;
 elsif private.series_part_has_run(old.id) then
  if tg_op='DELETE' then raise exception 'published_part_immutable'; end if;
  -- Display text and future prerequisites may change while still private; the
  -- accepted run keeps its frozen text. Its quest identity and position cannot.
  if (to_jsonb(new)-array['title','prerequisite_part_id','prerequisite_reason','published','first_published_at']) is distinct from (to_jsonb(old)-array['title','prerequisite_part_id','prerequisite_reason','published','first_published_at']) then raise exception 'published_part_immutable'; end if;
 end if;
 return coalesce(new,old);
end $$;


revoke all on function private.series_run_context(uuid),private.series_public_context(uuid) from public,anon,authenticated;
grant execute on function private.series_run_context(uuid),private.series_public_context(uuid) to service_role;

create or replace function public.sq_series_mutate(p_actor uuid,p_action text,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.quest_runs; context jsonb; cached jsonb; s public.quest_series; old_part public.quest_series_parts; source_part public.quest_series_parts; part_locked boolean; part_attempted boolean; t public.quest_templates; part jsonb; target uuid; part_id uuid; required_id uuid; ordinal int; count_parts int; follower record; newly_published uuid[]:='{}'; result jsonb;
begin
 cached:=private.begin_request(p_actor,'series_'||p_action,p_key,p_hash); if cached is not null then return cached; end if;
 if p_action='start_from_run' then
  -- The ownership/status check and run lock protect both foreign input and
  -- concurrent requests with different keys. No quest_runs UPDATE is needed.
  select * into r from public.quest_runs where id=(p_input->>'runId')::uuid and owner_id=p_actor for update;
  if not found or r.status not in ('accepted','in_progress','review_needed','finalized') or r.privacy_redacted_at is not null then raise exception 'series_run_unavailable'; end if;
  if r.snapshot ? 'series' or exists(select 1 from public.quest_series_parts where source_run_id=r.id) then raise exception 'series_run_linked'; end if;
  if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
  if coalesce(length(p_input->>'title'),0) not between 1 and 100 or coalesce(length(p_input->>'premise'),0) not between 1 and 800 or coalesce(p_input->>'cover','') not in ('sunrise','forest','ocean','night') or coalesce(p_input->>'kind','') not in ('finite','ongoing') then raise exception 'invalid_series'; end if;
  target:=gen_random_uuid(); part_id:=gen_random_uuid();
  insert into public.quest_series(id,author_id,title,premise,cover,kind,state) values(target,p_actor,p_input->>'title',p_input->>'premise',p_input->>'cover',p_input->>'kind','draft');
  context:=jsonb_build_object('id',target,'title',p_input->>'title','partId',part_id,'partTitle',r.snapshot->'template'->>'title','position',1);
  insert into public.quest_series_parts(id,series_id,position,title,template_id,template_version,quest_snapshot,published,source_run_id,source_context)
   values(part_id,target,1,r.snapshot->'template'->>'title',r.template_id,(r.snapshot->>'version')::int,r.snapshot->'template',false,r.id,context);
  result:=public.sq_series_read(p_actor,'detail',jsonb_build_object('id',target));
 elsif p_action='follow' then
  select ss.* into s from public.quest_series ss where ss.id=(p_input->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(least(p_actor::text,s.author_id::text)||greatest(p_actor::text,s.author_id::text),0));
  select ss.* into s from public.quest_series ss join public.profiles u on u.id=ss.author_id where ss.id=(p_input->>'id')::uuid and ss.state='published' and u.account_status='active' and not private.community_blocked(p_actor,ss.author_id) for share of ss;
  if not found then raise exception 'series_unavailable'; end if;
  if coalesce((p_input->>'following')::boolean,false) then insert into public.quest_series_follows(series_id,follower_id) values(s.id,p_actor) on conflict do nothing;
  else delete from public.quest_series_follows where series_id=s.id and follower_id=p_actor; end if;
  result:=public.sq_series_read(p_actor,'detail',jsonb_build_object('id',s.id));
 elsif p_action='save' then
  if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
  if jsonb_typeof(p_input->'parts')<>'array' or jsonb_array_length(p_input->'parts') not between 1 and 40 then raise exception 'invalid_series'; end if;
  target:=coalesce((p_input->>'id')::uuid,gen_random_uuid());
  select * into s from public.quest_series where id=target for update;
  if found then
   if s.author_id<>p_actor then raise exception 'forbidden'; end if;
   if s.version<>(p_input->>'expectedVersion')::int then raise exception 'stale_version'; end if;
   if s.first_published_at is not null and (s.kind<>p_input->>'kind' or (s.kind='finite' and (select count(*) from public.quest_series_parts where series_id=s.id)<>jsonb_array_length(p_input->'parts'))) then raise exception 'published_series_immutable'; end if;
  else
   if coalesce((p_input->>'expectedVersion')::int,0)<>0 then raise exception 'stale_version'; end if;
   insert into public.quest_series(id,author_id,title,premise,cover,kind) values(target,p_actor,p_input->>'title',p_input->>'premise',p_input->>'cover',p_input->>'kind') returning * into s;
  end if;
  select * into source_part from public.quest_series_parts where series_id=target and source_run_id is not null order by position limit 1;
  if exists(select 1 from public.quest_series_parts p where p.series_id=target and (p.first_published_at is not null or p.source_run_id is not null or private.series_part_has_run(p.id)) and not exists(select 1 from jsonb_array_elements(p_input->'parts') i where i->>'id'=p.id::text)) then raise exception 'published_part_immutable'; end if;
  -- Only never-attempted drafts may be removed/reordered. Accepted private
  -- episodes keep the identity and position referenced by frozen run snapshots.
  delete from public.quest_series_parts p where p.series_id=target and (p.first_published_at is null and p.source_run_id is null and not private.series_part_has_run(p.id)) and not exists(select 1 from jsonb_array_elements(p_input->'parts') i where i->>'id'=p.id::text);
  count_parts:=jsonb_array_length(p_input->'parts'); ordinal:=0;
  if (select count(distinct i->>'id') from jsonb_array_elements(p_input->'parts') i)<>count_parts then raise exception 'invalid_series'; end if;
  for part in select value from jsonb_array_elements(p_input->'parts') loop
   ordinal:=ordinal+1; part_id:=(part->>'id')::uuid; required_id:=(part->>'prerequisitePartId')::uuid;
   select * into old_part from public.quest_series_parts where id=part_id;
   if found and old_part.series_id<>target then raise exception 'forbidden'; end if;
   part_locked:=old_part.first_published_at is not null or old_part.source_run_id is not null;
   part_attempted:=private.series_part_has_run(part_id);
   select qt.* into t from public.quest_templates qt left join public.quest_authors a on a.template_id=qt.id where qt.id=part->>'templateId' and (((part_locked or part_attempted) and qt.id=old_part.template_id) or (qt.published and not private.community_blocked(p_actor,a.author_id))) for share of qt;
   if not found then raise exception 'template_unavailable'; end if;
   if part_locked or part_attempted then t.version:=old_part.template_version; t.content:=old_part.quest_snapshot; end if;
   -- Source-linked growth repeats exactly the source identity, reviewed version,
   -- and content. New episodes must still be available at that same version;
   -- historical metadata edits remain possible after withdrawal or revision.
   if source_part.id is not null then
    if t.id<>source_part.template_id then raise exception 'series_template_mismatch'; end if;
    if old_part.id is null and t.version<>source_part.template_version then raise exception 'series_template_mismatch'; end if;
    t.version:=source_part.template_version; t.content:=source_part.quest_snapshot;
   end if;
   if required_id is not null and (coalesce(length(part->>'prerequisiteReason'),0)=0 or not exists(select 1 from jsonb_array_elements(p_input->'parts') with ordinality i(value,n) where i.value->>'id'=required_id::text and i.n<ordinal and (not (part->>'published')::boolean or (i.value->>'published')::boolean))) then raise exception 'invalid_prerequisite'; end if;
   if required_id is null and coalesce(part->>'prerequisiteReason','')<>'' then raise exception 'invalid_prerequisite'; end if;
   if part_locked and (old_part.position,old_part.title,old_part.template_id,old_part.template_version,old_part.prerequisite_part_id,old_part.prerequisite_reason) is distinct from (ordinal,part->>'title',t.id,t.version,required_id,coalesce(part->>'prerequisiteReason','')) then raise exception 'published_part_immutable'; end if;
   if part_attempted and (old_part.position,old_part.template_id,old_part.template_version,old_part.quest_snapshot) is distinct from (ordinal,t.id,t.version,t.content) then raise exception 'published_part_immutable'; end if;
   if (part->>'published')::boolean and old_part.first_published_at is null and p_input->>'state'='published' then newly_published:=array_append(newly_published,part_id); end if;
   insert into public.quest_series_parts(id,series_id,position,title,template_id,template_version,quest_snapshot,prerequisite_part_id,prerequisite_reason,published,first_published_at)
    values(part_id,target,ordinal,part->>'title',t.id,t.version,t.content,required_id,coalesce(part->>'prerequisiteReason',''),(part->>'published')::boolean,case when (part->>'published')::boolean and p_input->>'state'='published' then now() else null end)
    on conflict(id) do update set position=excluded.position,title=excluded.title,template_id=excluded.template_id,template_version=excluded.template_version,quest_snapshot=excluded.quest_snapshot,prerequisite_part_id=excluded.prerequisite_part_id,prerequisite_reason=excluded.prerequisite_reason,published=excluded.published,first_published_at=coalesce(public.quest_series_parts.first_published_at,excluded.first_published_at);
  end loop;
  if p_input->>'state'='published' and (not exists(select 1 from public.quest_series_parts where series_id=target and published) or (p_input->>'kind'='finite' and exists(select 1 from public.quest_series_parts where series_id=target and not published))) then raise exception 'invalid_series'; end if;
  update public.quest_series set title=p_input->>'title',premise=p_input->>'premise',cover=p_input->>'cover',kind=p_input->>'kind',state=p_input->>'state',version=case when p_input->>'id' is null then 1 else version+1 end,first_published_at=case when p_input->>'state'='published' then coalesce(first_published_at,now()) else first_published_at end,updated_at=now() where id=target;
  foreach part_id in array newly_published loop
   for follower in select follower_id from public.quest_series_follows where series_id=target loop
    perform private.community_notify(follower.follower_id,p_actor,'series_part_published',part_id::text,'A new part of '||(p_input->>'title')||' is available.','/series/'||target);
   end loop;
  end loop;
  result:=public.sq_series_read(p_actor,'detail',jsonb_build_object('id',target));
 else raise exception 'not_found'; end if;
 return private.end_request(p_actor,'series_'||p_action,p_key,result);
end $$;
