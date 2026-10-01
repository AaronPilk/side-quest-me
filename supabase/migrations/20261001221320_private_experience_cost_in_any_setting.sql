-- A generated outdoor rental or tour has the same confirmed-cost requirement
-- as indoor admission. Preserve its actual setting and count its total charge
-- exactly once, alongside reserved travel and any separate known activity cost.
create or replace function public.sq_accept_private_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 if (t.content->'cost'->>'venueCostUnknown')::boolean and o->>'confirmedVenueCostMinor' is null then raise exception 'private_requirements_pending'; end if;
 if (o->>'adultContext')::boolean and ((t.content->>'supportsAdultContext')::boolean is distinct from true or o->>'setting'<>'venue' or (o->>'venuePermission')::boolean is distinct from true) then raise exception 'private_requirements_pending'; end if;
 if o->>'durationMinutes' is not null and (t.content->>'durationMinutes')::int+coalesce((o->>'travelMinutes')::int,0)>(o->>'durationMinutes')::int then raise exception 'invalid_outing'; end if;
 total_budget:=(o->>'budgetMinor')::int*case when o->>'budgetScope'='per_person' then (o->>'participants')::int else 1 end;
 charge:=(t.content->'cost'->>'maxMinor')::int*case when t.content->'cost'->>'scope'='per_person' then (o->>'participants')::int else 1 end+coalesce((o->>'travelCostMinor')::int,0)+case when o->>'setting'='venue' or (t.content->'cost'->>'venueCostUnknown')::boolean then coalesce((o->>'confirmedVenueCostMinor')::int,0) else 0 end;
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
