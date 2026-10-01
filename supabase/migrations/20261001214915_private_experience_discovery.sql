-- Owner-bound, unpublished experiences. Only the authenticated Worker can mint
-- or accept them; generated content never authorizes money or public publishing.
create table public.private_quest_proposals (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles,
 template_id text unique not null references public.quest_templates,
 outing jsonb not null check(jsonb_typeof(outing)='object'),
 location jsonb,
 provider text not null check(provider in ('openai','xai','anthropic')),
 model text not null check(length(model) between 1 and 100),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 days'
);
create index private_quest_proposals_owner on public.private_quest_proposals(owner_id,created_at desc);
alter table public.private_quest_proposals enable row level security;
revoke all on public.private_quest_proposals from public,anon,authenticated;
grant select on public.private_quest_proposals to authenticated;
grant all on public.private_quest_proposals to service_role;
create policy private_proposals_owner on public.private_quest_proposals for select to authenticated using(owner_id=(select auth.uid()));

create function private.guard_private_template() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.published and (new.id like 'private\_%' escape '\' or new.content->>'privateGenerated'='true') then
  raise exception 'private_template_cannot_publish';
 end if;
 return new;
end $$;
create trigger private_template_not_public before insert or update on public.quest_templates for each row execute function private.guard_private_template();

create function public.sq_store_private_proposal(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; q jsonb; proposal uuid:=gen_random_uuid(); template text; family text; version_number int; result jsonb; row public.private_quest_proposals;
begin
 cached:=private.begin_request(p_actor,'private_proposal',p_key,p_hash); if cached is not null then return cached; end if;
 q:=p_input->'quest';
 if jsonb_typeof(q)<>'object' or q->>'privateGenerated' is distinct from 'true' or q->'award' is distinct from '{"xp":0,"points":0}'::jsonb or jsonb_typeof(p_input->'outing')<>'object' or coalesce(p_input->>'mechanic','') !~ '^[a-z_]{3,40}$' then raise exception 'invalid_private_proposal'; end if;
 template:='private_'||proposal::text;
 family:='private_'||(q->>'category')||'_'||(p_input->>'mechanic');
 perform pg_advisory_xact_lock(hashtextextended(family,0));
 select coalesce(max(version),0)+1 into version_number from public.quest_templates where family_id=family and intensity=q->>'intensity';
 q:=q||jsonb_build_object('id',template,'familyId',family,'version',version_number,'privateGenerated',true,'award',jsonb_build_object('xp',0,'points',0));
 q:=q-'sponsorDisclosure'-'variantKey';
 insert into public.quest_templates(id,family_id,version,category,intensity,title,content,published) values(template,family,version_number,q->>'category',q->>'intensity',q->>'title',q,false);
 insert into public.private_quest_proposals(id,owner_id,template_id,outing,location,provider,model) values(proposal,p_actor,template,p_input->'outing',case when jsonb_typeof(p_input->'location')='object' then (p_input->'location')-'latitude'-'longitude' else null end,p_input->>'provider',p_input->>'model') returning * into row;
 result:=jsonb_build_object('proposal',to_jsonb(row),'quest',q);
 return private.end_request(p_actor,'private_proposal',p_key,result);
end $$;

create function public.sq_accept_private_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; proposal public.private_quest_proposals; t public.quest_templates; r public.quest_runs; snap jsonb; result jsonb; o jsonb; field text; charge int; total_budget int;
begin
 cached:=private.begin_request(p_actor,'accept_private_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into proposal from public.private_quest_proposals where template_id=p_input->>'template_id' and owner_id=p_actor and (expires_at>now() or (p_input->>'series_part_id' is not null and exists(select 1 from public.quest_runs previous where previous.owner_id=p_actor and previous.template_id=p_input->>'template_id'))) for share;
 if not found then raise exception 'not_found'; end if;
 select * into t from public.quest_templates where id=proposal.template_id and not published for share;
 if not found or t.content->>'privateGenerated' is distinct from 'true' then raise exception 'not_found'; end if;
 if exists(select 1 from public.quest_runs where owner_id=p_actor and status in ('accepted','in_progress')) then raise exception 'active_run_exists'; end if;
 if p_input->>'inspired_by_post' is not null or (p_input->'expected_campaign' is not null and p_input->'expected_campaign'<>'null'::jsonb) then raise exception 'invalid_private_proposal'; end if;
 o:=p_input->'outing';
 if jsonb_typeof(o)<>'object' then raise exception 'invalid_outing'; end if;
 foreach field in array array['category','intensity','group','participants','setting'] loop
  if o->field is distinct from proposal.outing->field then raise exception 'private_plan_changed'; end if;
 end loop;
 if coalesce(o->'applePlaceId','null'::jsonb) is distinct from coalesce(proposal.outing->'applePlaceId','null'::jsonb) then raise exception 'private_plan_changed'; end if;
 -- Critical preflight is repeated in SQL. The Worker additionally checks the
 -- current profile's structured boundaries and the complete canonical schema.
 if (t.content->>'arrangementRequired')::boolean and (o->>'arrangementConfirmed')::boolean is distinct from true then raise exception 'private_requirements_pending'; end if;
 if o->>'setting'='venue' and (t.content->>'venuePermissionRequired')::boolean and (o->>'venuePermission')::boolean is distinct from true then raise exception 'private_requirements_pending'; end if;
 if ((t.content->>'adultOnly')::boolean or (t.content->>'requiresVolunteer')::boolean or (o->>'adultContext')::boolean) and (o->>'adultEligible')::boolean is distinct from true then raise exception 'private_requirements_pending'; end if;
 if o->>'setting'='venue' and (t.content->'cost'->>'venueCostUnknown')::boolean and o->>'confirmedVenueCostMinor' is null then raise exception 'private_requirements_pending'; end if;
 if (o->>'adultContext')::boolean and ((t.content->>'supportsAdultContext')::boolean is distinct from true or o->>'setting'<>'venue' or (o->>'venuePermission')::boolean is distinct from true) then raise exception 'private_requirements_pending'; end if;
 if o->>'durationMinutes' is not null and (t.content->>'durationMinutes')::int+coalesce((o->>'travelMinutes')::int,0)>(o->>'durationMinutes')::int then raise exception 'invalid_outing'; end if;
 total_budget:=(o->>'budgetMinor')::int*case when o->>'budgetScope'='per_person' then (o->>'participants')::int else 1 end;
 charge:=(t.content->'cost'->>'maxMinor')::int*case when t.content->'cost'->>'scope'='per_person' then (o->>'participants')::int else 1 end+coalesce((o->>'travelCostMinor')::int,0)+case when o->>'setting'='venue' then coalesce((o->>'confirmedVenueCostMinor')::int,0) else 0 end;
 if charge>total_budget then raise exception 'invalid_outing'; end if;
 snap:=jsonb_build_object('template',t.content,'template_id',t.id,'version',t.version,'family_id',t.family_id,'intensity',t.intensity,'category',t.category,'title',t.title,'role',o->>'role','privateGenerated',true,'proposalId',proposal.id,'reward_policy',jsonb_build_object('version',1,'xp',0,'points',0,'daily_cap',3,'family_cooldown_days',30));
 if p_input->>'series_part_id' is not null then
  if not exists(select 1 from public.quest_series_parts part join public.quest_series series on series.id=part.series_id where part.id=(p_input->>'series_part_id')::uuid and series.author_id=p_actor and part.template_id=t.id and part.template_version=t.version) then raise exception 'series_unavailable'; end if;
  perform set_config('sidequest.series_acceptance',jsonb_build_object('actorId',p_actor,'partId',p_input->>'series_part_id')::text,true);
 end if;
 insert into public.quest_runs(owner_id,template_id,family_id,intensity,category,snapshot,snapshot_hash,outing,participants,budget_amount,budget_scope,currency,area,selected_role) values(p_actor,t.id,t.family_id,t.intensity,t.category,snap,private.content_hash(snap),o,(o->>'participants')::int,(o->>'budgetMinor')::int,o->>'budgetScope',o->>'currency',coalesce(o->>'area',''),o->>'role') returning * into r;
 perform set_config('sidequest.series_acceptance','',true);
 result:=jsonb_build_object('run',to_jsonb(r),'eligibility',jsonb_build_object('eligible',false,'reason','private_generated'));
 return private.end_request(p_actor,'accept_private_run',p_key,result);
end $$;
revoke all on function public.sq_store_private_proposal(uuid,jsonb,text,text),public.sq_accept_private_run(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.sq_store_private_proposal(uuid,jsonb,text,text),public.sq_accept_private_run(uuid,jsonb,text,text) to service_role;
revoke all on function private.guard_private_template() from public,anon,authenticated;
grant execute on function private.guard_private_template() to service_role;

-- A durable lease precedes paid model work. A retry replays the result; a
-- concurrent request cannot launch another generation under the same key.
create table private.experience_discovery_requests (
 owner_id uuid not null references public.profiles,
 key text not null check(length(key) between 8 and 100),
 request_hash text not null,
 leased_until timestamptz not null default now()+interval '2 minutes',
 response jsonb,
 created_at timestamptz not null default now(),
 primary key(owner_id,key)
);
grant all on private.experience_discovery_requests to service_role;
create function public.sq_reserve_experience_discovery(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare inserted int; r private.experience_discovery_requests;
begin
 perform private.assert_actor(p_actor);
 insert into private.experience_discovery_requests(owner_id,key,request_hash) values(p_actor,p_key,p_hash) on conflict do nothing;
 get diagnostics inserted=row_count;
 select * into r from private.experience_discovery_requests where owner_id=p_actor and key=p_key for update;
 if r.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
 if r.response is not null then return jsonb_build_object('response',r.response); end if;
 if inserted=1 then return jsonb_build_object('acquired',true); end if;
 if r.leased_until>now() then return jsonb_build_object('acquired',false); end if;
 update private.experience_discovery_requests set leased_until=now()+interval '2 minutes' where owner_id=p_actor and key=p_key;
 return jsonb_build_object('acquired',true);
end $$;
create function public.sq_finish_experience_discovery(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.experience_discovery_requests; reply jsonb;
begin
 perform private.assert_actor(p_actor);
 select * into r from private.experience_discovery_requests where owner_id=p_actor and key=p_key for update;
 if not found or r.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
 if r.response is not null then return r.response; end if;
 reply:=(p_input->'response') #- '{proposals,0,location,latitude}' #- '{proposals,0,location,longitude}';
 if jsonb_typeof(reply)<>'object' then raise exception 'invalid_input'; end if;
 update private.experience_discovery_requests set response=reply where owner_id=p_actor and key=p_key;
 return reply;
end $$;
revoke all on function public.sq_reserve_experience_discovery(uuid,jsonb,text,text),public.sq_finish_experience_discovery(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.sq_reserve_experience_discovery(uuid,jsonb,text,text),public.sq_finish_experience_discovery(uuid,jsonb,text,text) to service_role;


-- Saved private episodes remain runnable by their author with fresh preflight.
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
  'available',((p.published and s.state='published') or s.author_id=p_actor) and p.privacy_redacted_at is null and (t.published or (s.author_id=p_actor and exists(select 1 from public.private_quest_proposals own where own.template_id=t.id and own.owner_id=p_actor))) and t.version=p.template_version and not private.community_blocked(p_actor,a.author_id) and (p.prerequisite_part_id is null or completed ? p.prerequisite_part_id::text),
  'unavailableReason',case when (not p.published or s.state<>'published') and s.author_id<>p_actor then 'This part is still a draft.' when p.privacy_redacted_at is not null then 'This part is no longer available.' when not (t.published or (s.author_id=p_actor and exists(select 1 from public.private_quest_proposals own where own.template_id=t.id and own.owner_id=p_actor))) or private.community_blocked(p_actor,a.author_id) then 'This quest is no longer available.' when t.version<>p.template_version then 'This part’s original quest version is no longer available.' when p.prerequisite_part_id is not null and not (completed ? p.prerequisite_part_id::text) then 'Complete the required earlier part: '||p.prerequisite_reason else null end) order by p.position),'[]'::jsonb) into parts
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
