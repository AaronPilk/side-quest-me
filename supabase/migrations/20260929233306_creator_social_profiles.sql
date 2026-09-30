-- Social identity is public only through narrow service-owned DTOs. No private profile fields are joined into it.
create table public.social_profiles (
 user_id uuid primary key references public.profiles,
 username text unique check(username is null or (username ~ '^[a-z][a-z0-9_]{2,23}$' and username not in ('admin','administrator','sidequest','support','settings','profile','discover','create','rewards','business','operator','api'))),
 photo_key text unique,
 version int not null default 1 check(version>0),
 check(photo_key is null or photo_key like 'avatars/'||user_id||'/%')
);
create table public.creator_follows (
 follower_id uuid not null references public.profiles,
 creator_id uuid not null references public.profiles,
 created_at timestamptz not null default now(),
 primary key(follower_id,creator_id), check(follower_id<>creator_id)
);
create index creator_followers on public.creator_follows(creator_id,follower_id);
create table public.social_photo_cleanup (
 object_key text primary key check(object_key like 'avatars/%'),
 owner_id uuid not null references public.profiles,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create function public.sq_social_read(p_actor uuid,p_target uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare target uuid:=coalesce(p_target,p_actor); result jsonb;
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if target is null or private.community_blocked(p_actor,target) or not exists(select 1 from public.profiles where id=target and account_status='active') or (target is distinct from p_actor and not exists(select 1 from public.creator_profiles where user_id=target)) then raise exception 'not_found'; end if;
 select jsonb_build_object('creatorId',target,'username',s.username,'photoUrl',case when s.photo_key is not null then '/api/social/photo/'||target||'?v='||s.version else null end,
 'followersCount',(select count(*) from public.creator_follows f join public.profiles p on p.id=f.follower_id where f.creator_id=target and p.account_status='active' and not private.community_blocked(f.follower_id,target)),
 'followingCount',(select count(*) from public.creator_follows f join public.profiles p on p.id=f.creator_id where f.follower_id=target and p.account_status='active' and not private.community_blocked(target,f.creator_id)),
 'isFollowing',exists(select 1 from public.creator_follows where follower_id=p_actor and creator_id=target),'isOwn',coalesce(p_actor=target,false)) into result
 from (select 1) seed left join public.social_profiles s on s.user_id=target;
 return result;
end $$;
create function public.sq_social_save(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare handle text:=nullif(lower(trim(p_input->>'username')),''); saved jsonb;
begin
 perform private.assert_actor(p_actor);
 if handle is not null and (handle !~ '^[a-z][a-z0-9_]{2,23}$' or handle in ('admin','administrator','sidequest','support','settings','profile','discover','create','rewards','business','operator','api')) then raise exception 'invalid_username'; end if;
 insert into public.social_profiles(user_id,username) values(p_actor,handle) on conflict(user_id) do update set username=excluded.username,version=social_profiles.version+1;
 saved:=public.sq_community_mutate(p_actor,'creator_save',p_input-'username',gen_random_uuid()::text,private.content_hash(p_input));
 return public.sq_social_read(p_actor,p_actor);
exception when unique_violation then raise exception 'username_taken';
end $$;
create function public.sq_social_follow(p_actor uuid,p_target uuid,p_following boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.assert_actor(p_actor);
 if p_target=p_actor then raise exception 'self_follow'; end if;
 -- Serialize following against the block trigger without upgrading actor row locks.
 perform pg_advisory_xact_lock(hashtextextended(least(p_actor::text,p_target::text)||greatest(p_actor::text,p_target::text),0));
 if p_following then
  perform private.assert_actor(p_target);
  if private.community_blocked(p_actor,p_target) or not exists(select 1 from public.creator_profiles c join public.profiles p on p.id=c.user_id where c.user_id=p_target and p.account_status='active') then raise exception 'not_found'; end if;
  insert into public.creator_follows(follower_id,creator_id) values(p_actor,p_target) on conflict do nothing;
  perform private.community_notify(p_target,p_actor,'creator_follow',p_actor::text,'Someone followed your profile.','/creators/'||p_actor);
 else delete from public.creator_follows where follower_id=p_actor and creator_id=p_target;
 end if;
 return public.sq_social_read(p_actor,p_target);
end $$;
create function public.sq_social_photo(p_actor uuid,p_key text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.assert_actor(p_actor);
 if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
 if p_key is not null and p_key !~ ('^avatars/'||p_actor||'/[a-f0-9-]{36}\.png$') then raise exception 'invalid_photo'; end if;
 insert into public.social_profiles(user_id,photo_key) values(p_actor,p_key) on conflict(user_id) do update set photo_key=excluded.photo_key,version=social_profiles.version+1;
 return public.sq_social_read(p_actor,p_actor);
end $$;
create function public.sq_social_photo_key(p_actor uuid,p_target uuid) returns text language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.sq_social_read(p_actor,p_target);
 return (select photo_key from public.social_profiles where user_id=p_target);
end $$;
create function private.social_photo_retire() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.photo_key is not null and (tg_op='DELETE' or old.photo_key is distinct from new.photo_key) then
  insert into public.social_photo_cleanup(object_key,owner_id) values(old.photo_key,old.user_id) on conflict do nothing;
 end if;
 return coalesce(new,old);
end $$;
create trigger retire_social_photo after update of photo_key or delete on public.social_profiles for each row execute function private.social_photo_retire();
create function private.social_block_cleanup() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(least(new.owner_id::text,new.blocked_id::text)||greatest(new.owner_id::text,new.blocked_id::text),0));
 delete from public.creator_follows where (follower_id=new.owner_id and creator_id=new.blocked_id) or (follower_id=new.blocked_id and creator_id=new.owner_id);
 return new;
end $$;
create trigger remove_blocked_follows after insert on public.community_blocks for each row execute function private.social_block_cleanup();
create function private.social_account_cleanup() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.account_status<>'active' and old.account_status='active' then
  delete from public.creator_follows where follower_id=new.id or creator_id=new.id;
  delete from public.social_profiles where user_id=new.id;
 end if;
 return new;
end $$;
create trigger clear_deleted_social_profile after update of account_status on public.profiles for each row execute function private.social_account_cleanup();
-- The app never exposes table writes or service RPCs directly to browser roles.
do $$ declare row record; begin
 for row in select unnest(array['social_profiles','creator_follows','social_photo_cleanup']) as name loop
  execute format('alter table public.%I enable row level security',row.name);
  execute format('revoke all on public.%I from public,anon,authenticated',row.name);
  execute format('grant select,insert,update,delete on public.%I to service_role',row.name);
 end loop;
 for row in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'sq_social_%') or (n.nspname='private' and p.proname like 'social_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',row.signature);
  execute format('grant execute on function %s to service_role',row.signature);
 end loop;
end $$;

-- Enrich the existing public creator DTO without exposing storage keys or private account answers.
create or replace function private.community_creator(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.user_id,'displayName',c.display_name,'avatarKey',c.avatar_key,'bio',c.bio,'openToBrands',c.open_to_brands,'version',c.version,
 'username',s.username,'photoUrl',case when s.photo_key is not null then '/api/social/photo/'||c.user_id||'?v='||s.version else null end,
 'publishedCount',(select count(*) from public.community_posts p where p.owner_id=c.user_id and private.community_available(p.id)),
 'attemptCount',(select count(*) from public.quest_inspirations i join public.community_posts p on p.id=i.post_id where p.owner_id=c.user_id),
 'authoredCount',(select count(*) from public.quest_authors a join public.quest_templates t on t.id=a.template_id where a.author_id=c.user_id and t.published))
 from public.creator_profiles c join public.profiles u on u.id=c.user_id left join public.social_profiles s on s.user_id=c.user_id where c.user_id=p_id and u.account_status='active'
$$;
