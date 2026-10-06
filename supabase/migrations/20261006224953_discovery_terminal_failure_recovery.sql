-- Keep existing callers compatible while giving new callers a fenced lease
-- receipt. Only a known terminal failure before persistence may release it.
create or replace function public.sq_reserve_experience_discovery(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare inserted int; r private.experience_discovery_requests;
begin
 perform private.assert_actor(p_actor);
 insert into private.experience_discovery_requests(owner_id,key,request_hash) values(p_actor,p_key,p_hash) on conflict do nothing;
 get diagnostics inserted=row_count;
 select * into r from private.experience_discovery_requests where owner_id=p_actor and key=p_key for update;
 if r.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
 if r.response is not null then return jsonb_build_object('response',r.response); end if;
 if inserted=1 then return jsonb_build_object('acquired',true,'leaseUntil',r.leased_until); end if;
 if r.leased_until>now() then return jsonb_build_object('acquired',false); end if;
 update private.experience_discovery_requests set leased_until=now()+interval '2 minutes' where owner_id=p_actor and key=p_key returning * into r;
 return jsonb_build_object('acquired',true,'leaseUntil',r.leased_until);
end $$;

create function public.sq_release_experience_discovery(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.experience_discovery_requests;
begin
 perform private.assert_actor(p_actor);
 select * into r from private.experience_discovery_requests where owner_id=p_actor and key=p_key for update;
 if not found or r.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
 -- A late failure cannot unlock a newer attempt or erase a completed response.
 if r.response is not null or p_input->>'leaseUntil' is null or r.leased_until<>(p_input->>'leaseUntil')::timestamptz then
  return jsonb_build_object('released',false);
 end if;
 update private.experience_discovery_requests set leased_until=clock_timestamp() where owner_id=p_actor and key=p_key;
 return jsonb_build_object('released',true);
end $$;
revoke all on function public.sq_reserve_experience_discovery(uuid,jsonb,text,text),public.sq_release_experience_discovery(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.sq_reserve_experience_discovery(uuid,jsonb,text,text),public.sq_release_experience_discovery(uuid,jsonb,text,text) to service_role;
