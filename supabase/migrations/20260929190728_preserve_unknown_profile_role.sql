-- An unanswered role is unknown, not permission to rotate roles.
-- Existing profiles, accepted snapshots, hashes, and idempotency responses stay unchanged.
-- The Worker supplies a confirmed role or explicit JSON null in outing.role.
-- A legacy service-only caller may still pass a role at the top level when outing omits it.
-- There is deliberately no fallback to historical profile defaults.
alter table public.quest_runs alter column selected_role drop not null;

create or replace function public.sq_accept_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; t public.quest_templates; r public.quest_runs; snap jsonb; result jsonb; campaign public.campaigns; sponsor_name text;
begin
 cached:=private.begin_request(p_actor,'accept_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into t from public.quest_templates where id=p_input->>'template_id' and published for share;
 if not found then raise exception 'template_unavailable'; end if;
 if exists(select 1 from public.quest_runs where owner_id=p_actor and status in ('accepted','in_progress')) then raise exception 'active_run_exists'; end if;
 if jsonb_typeof(p_input->'outing')<>'object' then raise exception 'invalid_outing'; end if;
 snap:=jsonb_build_object('template',t.content,'template_id',t.id,'version',t.version,'family_id',t.family_id,'intensity',t.intensity,'category',t.category,'title',t.title,'role',case when p_input->'outing' ? 'role' then p_input->'outing'->>'role' else p_input->>'role' end,
 'reward_policy',jsonb_build_object('version',1,'xp',case t.intensity when 'chill' then 100 when 'bold' then 250 else 500 end,'points',case t.intensity when 'chill' then 10 when 'bold' then 25 else 50 end,'daily_cap',3,'family_cooldown_days',30));
 -- Sponsorship labels are attached only after the Worker has enforced ordinary hard filters.
 -- They never authorize venue access, change costs, raise awards, or select a different quest.
 select c.* into campaign from public.campaigns c join public.sponsors s on s.id=c.sponsor_id
 where c.state='active' and c.funded and c.starts_at<=now() and c.ends_at>now() and s.approved
 and c.area=p_input->'outing'->>'area' and t.category=any(c.categories) and t.family_id=any(c.family_ids)
 order by c.created_at,c.id limit 1 for share of c,s;
 if p_input ? 'expected_campaign' and (p_input->'expected_campaign') is distinct from
  (case when campaign.id is null then 'null'::jsonb else jsonb_build_object('id',campaign.id,'version',campaign.version) end)
 then raise exception 'campaign_changed'; end if;
 if found then
  select name into sponsor_name from public.sponsors where id=campaign.sponsor_id;
  snap:=snap||jsonb_build_object('sponsor',jsonb_build_object('campaign_id',campaign.id,'campaign_version',campaign.version,'sponsor_id',campaign.sponsor_id,'sponsor_name',sponsor_name,'disclosure',campaign.disclosure),'sponsorDisclosure',campaign.disclosure);
 end if;
 insert into public.quest_runs(owner_id,template_id,family_id,intensity,category,snapshot,snapshot_hash,outing,participants,budget_amount,budget_scope,currency,area,selected_role) values(p_actor,t.id,t.family_id,t.intensity,t.category,snap,private.content_hash(snap),p_input->'outing',(p_input->'outing'->>'participants')::int,(p_input->'outing'->>'budgetMinor')::int,p_input->'outing'->>'budgetScope',p_input->'outing'->>'currency',coalesce(p_input->'outing'->>'area',''),snap->>'role') returning * into r;
 result:=jsonb_build_object('run',to_jsonb(r),'eligibility',public.sq_eligibility(p_actor,t.family_id));
 return private.end_request(p_actor,'accept_run',p_key,result);
end $$;

-- CREATE OR REPLACE retains existing privileges; keep this boundary explicit.
revoke all on function public.sq_accept_run(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.sq_accept_run(uuid,jsonb,text,text) to service_role;
