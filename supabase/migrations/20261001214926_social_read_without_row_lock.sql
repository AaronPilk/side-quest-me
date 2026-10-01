-- PostgREST executes STABLE RPCs in read-only transactions. Social reads must
-- validate active accounts without the FOR SHARE lock used by mutations.
-- Existing block, visibility, DTO and service-only permissions are preserved.
create or replace function public.sq_social_read(p_actor uuid,p_target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare target uuid:=coalesce(p_target,p_actor); result jsonb;
begin
 if p_actor is not null and not exists(select 1 from public.profiles where id=p_actor and account_status='active') then raise exception 'account_unavailable'; end if;
 if target is null or private.community_blocked(p_actor,target) or not exists(select 1 from public.profiles where id=target and account_status='active') or (target is distinct from p_actor and not exists(select 1 from public.creator_profiles where user_id=target)) then raise exception 'not_found'; end if;
 select jsonb_build_object('creatorId',target,'username',s.username,'photoUrl',case when s.photo_key is not null then '/api/social/photo/'||target||'?v='||s.version else null end,
 'followersCount',(select count(*) from public.creator_follows f join public.profiles p on p.id=f.follower_id where f.creator_id=target and p.account_status='active' and not private.community_blocked(f.follower_id,target)),
 'followingCount',(select count(*) from public.creator_follows f join public.profiles p on p.id=f.creator_id where f.follower_id=target and p.account_status='active' and not private.community_blocked(target,f.creator_id)),
 'isFollowing',exists(select 1 from public.creator_follows where follower_id=p_actor and creator_id=target),'isOwn',coalesce(p_actor=target,false)) into result
 from (select 1) seed left join public.social_profiles s on s.user_id=target;
 return result;
end $$;
