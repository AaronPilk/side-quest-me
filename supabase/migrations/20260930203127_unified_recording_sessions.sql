-- One complete 5–60 second session, with compatible legacy three-clip manifests.
-- No accepted quest snapshots, settled awards, or existing evidence are rewritten.

create or replace function private.build_manifest(p_actor uuid,p_run uuid,p_clips jsonb,p_current boolean,p_title text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare clip jsonb; a public.media_assets; entries jsonb:='[]'; slots int[]:='{}'; start_ms int; end_ms int;
begin
 if jsonb_typeof(p_clips)<>'array' or jsonb_array_length(p_clips) not in (1,3) then raise exception 'video_required'; end if;
 -- Deterministic row lock order prevents retake/submit races and asset-lock deadlocks.
 perform 1 from public.media_assets where id in (select (value->>'asset_id')::uuid from jsonb_array_elements(p_clips)) order by id for share;
 for clip in select value from jsonb_array_elements(p_clips) loop
  select * into a from public.media_assets where id=(clip->>'asset_id')::uuid and owner_id=p_actor and run_id=p_run and kind='source' and state='sealed';
  if not found or (p_current and not a.is_current) then raise exception 'invalid_evidence'; end if;
  start_ms:=(clip->>'start_ms')::int; end_ms:=(clip->>'end_ms')::int;
  if start_ms is null or end_ms is null or start_ms<0 or end_ms>a.duration_ms or end_ms-start_ms not between 5000 and (case when jsonb_array_length(p_clips)=1 then 60000 else 15000 end) or a.slot=any(slots) then raise exception 'invalid_selection'; end if;
  if coalesce(clip->>'fit','cover') not in ('cover','contain') or coalesce((clip->>'crop')::numeric,0.5) not between 0 and 1 or length(coalesce(clip->>'label',''))>64 then raise exception 'invalid_render_settings'; end if;
  slots:=array_append(slots,a.slot);
  entries:=entries||jsonb_build_array(jsonb_build_object('asset_id',a.id,'slot',a.slot,'generation',a.generation,'object_key',a.object_key,'sha256',a.sha256,'start_ms',start_ms,'end_ms',end_ms,'mute',coalesce((clip->>'mute')::boolean,false),'fit',coalesce(clip->>'fit','cover'),'crop',coalesce((clip->>'crop')::numeric,0.5),'label',coalesce(clip->>'label','')));
 end loop;
 if jsonb_array_length(p_clips)=1 then
  if slots<>array[1] or (p_current and a.metadata->'selection'->>'mode' is distinct from 'session') then raise exception 'invalid_session'; end if;
 elsif cardinality(slots)<>3 or not slots @> array[1,2,3] then raise exception 'three_slots_required'; end if;
 select jsonb_agg(value order by (value->>'slot')::int) into entries from jsonb_array_elements(entries);
 if length(p_title)>96 then raise exception 'invalid_render_settings'; end if;
 return jsonb_build_object('version',1,'title',p_title,'clips',entries)||coalesce((select case when snapshot ? 'sponsorDisclosure' then jsonb_build_object('sponsorDisclosure',snapshot->>'sponsorDisclosure') else '{}'::jsonb end from public.quest_runs where id=p_run and owner_id=p_actor),'{}'::jsonb);
end $$;

create or replace function public.sq_update_clip(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; a public.media_assets; start_ms int:=(p_input->>'start_ms')::int; end_ms int:=(p_input->>'end_ms')::int; crop numeric:=coalesce((p_input->>'crop')::numeric,0.5);
begin
 cached:=private.begin_request(p_actor,'update_clip',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 select * into a from public.media_assets where id=(p_input->>'asset_id')::uuid and owner_id=p_actor and run_id=(p_input->>'run_id')::uuid and state='sealed' and kind='source' and is_current for update;
 if not found then raise exception 'not_found'; end if;
 if start_ms is null or end_ms is null or start_ms<0 or end_ms>a.duration_ms or end_ms-start_ms not between 5000 and (case when p_input->>'mode'='session' then 60000 else 15000 end) or crop not between 0 and 1 or coalesce(p_input->>'fit','cover') not in ('cover','contain') or length(coalesce(p_input->>'label',''))>64 then raise exception 'invalid_selection'; end if;
 if p_input ? 'mode' and p_input->>'mode' is distinct from 'session' then raise exception 'invalid_selection'; end if;
 if p_input->>'mode'='session' then
  if a.slot<>1 then raise exception 'invalid_session'; end if;
  -- Preserve old source bytes and frozen evidence; replace only the active edit.
  update public.media_assets set is_current=false where run_id=a.run_id and kind='source' and id<>a.id and is_current;
 end if;
 update public.media_assets set metadata=metadata||jsonb_build_object('selection',jsonb_build_object('mode',p_input->>'mode','start_ms',start_ms,'end_ms',end_ms,'crop',crop,'fit',coalesce(p_input->>'fit','cover'),'mute',coalesce((p_input->>'mute')::boolean,false),'label',coalesce(p_input->>'label',''))) where id=a.id returning * into a;
 return private.end_request(p_actor,'update_clip',p_key,to_jsonb(a));
end $$;

create or replace function public.sq_finish_render(p_job uuid,p_fence bigint,p_output jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.render_jobs; a public.media_assets;
begin
 select * into j from public.render_jobs where id=p_job;
 if found then
  perform 1 from public.profiles where id=j.owner_id for share;
  perform 1 from public.wallets where owner_id=j.owner_id for update;
  perform 1 from public.quest_runs where id=j.run_id for update;
 end if;
 select * into j from public.render_jobs where id=p_job for update;
 if not found then raise exception 'not_found'; end if;
 if j.status='ready' and j.fence=p_fence then return to_jsonb(j); end if;
 if j.status<>'processing' or j.fence<>p_fence or j.lease_expires_at<=now() then raise exception 'stale_render_lease'; end if;
 if not exists(select 1 from public.profiles where id=j.owner_id and account_status='active') then raise exception 'account_unavailable'; end if;
 if exists(select 1 from jsonb_array_elements(j.manifest->'clips') c join public.media_assets src on src.id=(c->>'asset_id')::uuid where src.state<>'sealed') then raise exception 'source_removed'; end if;
 if p_output->>'object_key' !~ ('^renders/'||j.id||'/'||p_fence||'/[a-f0-9]{64}\.mp4$') then raise exception 'invalid_output_key'; end if;
 if (select count(*) from public.media_assets where owner_id=j.owner_id and kind='reel' and state='sealed')>=50 then raise exception 'reel_limit'; end if;
 if (select coalesce(sum(coalesce(bytes,expected_bytes,0)),0) from public.media_assets where owner_id=j.owner_id and state<>'deleted')+coalesce((p_output->>'bytes')::bigint,0)>2147483648 then raise exception 'storage_limit'; end if;
 if p_output->>'mime'<>'video/mp4' or (p_output->>'duration_ms')::int not between 5000 and 60000 or abs((p_output->>'duration_ms')::int-(select sum((value->>'end_ms')::int-(value->>'start_ms')::int) from jsonb_array_elements(j.manifest->'clips'))) > 300 then raise exception 'invalid_render_output'; end if;
 insert into public.media_assets(owner_id,run_id,kind,object_key,state,bytes,mime,duration_ms,sha256,metadata,sealed_at)
 values(j.owner_id,j.run_id,'reel',p_output->>'object_key','sealed',(p_output->>'bytes')::bigint,'video/mp4',(p_output->>'duration_ms')::int,p_output->>'sha256',coalesce(p_output->'metadata','{}'),now()) returning * into a;
 update public.render_jobs set status='ready',output_asset_id=a.id,lease_expires_at=null,error_code=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
