-- A still-valid access token must not expose private plans after the account is
-- disabled or deletion begins. Match the active-account rule on other owner data.
drop policy private_proposals_owner on public.private_quest_proposals;
create policy private_proposals_owner on public.private_quest_proposals
 for select to authenticated using (
  owner_id=(select auth.uid()) and exists (
   select 1 from public.profiles p where p.id=owner_id and p.account_status='active'
  )
 );

alter table private.experience_discovery_requests enable row level security;
revoke all on private.experience_discovery_requests from public,anon,authenticated;

-- Accepted runs retain a foreign key to the original template after redaction.
-- Keep that opaque identity, while removing all generated prose. This narrowly
-- scoped deletion exception does not permit editing a live or catalog template.
create function private.guard_template_privacy() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-'published') is not distinct from (to_jsonb(old)-'published') then
  return new;
 end if;
 if old.id like 'private\_%' escape '\'
  and old.content->>'privateGenerated'='true'
  and not new.published
  and new.title='Deleted private experience'
  and new.content='{"redacted":true,"privateGenerated":true}'::jsonb
  and (to_jsonb(new)-array['title','content','published']) is not distinct from
      (to_jsonb(old)-array['title','content','published'])
  and exists (
   select 1 from public.private_quest_proposals q join public.profiles p on p.id=q.owner_id
   where q.template_id=old.id and p.account_status in ('deleting','deleted')
  ) then
  return new;
 end if;
 raise exception 'template_version_immutable';
end $$;
drop trigger template_immutable on public.quest_templates;
create trigger template_immutable before update on public.quest_templates
 for each row execute function private.guard_template_privacy();

create function private.clear_private_experiences(p_actor uuid) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_actor and account_status in ('deleting','deleted') for update;
 if not found then raise exception 'deletion_not_requested'; end if;
 update public.quest_templates set title='Deleted private experience',
  content='{"redacted":true,"privateGenerated":true}',published=false
  where id in (select template_id from public.private_quest_proposals where owner_id=p_actor);
 delete from public.private_quest_proposals where owner_id=p_actor;
 delete from private.experience_discovery_requests where owner_id=p_actor;
 delete from private.idempotency_records where actor_id=p_actor
  and operation in ('private_proposal','accept_private_run');
end $$;

create function private.private_experience_account_cleanup() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if new.account_status in ('deleting','deleted') and old.account_status not in ('deleting','deleted') then
  perform private.clear_private_experiences(new.id);
 end if;
 return new;
end $$;
create trigger private_experience_account_cleanup after update of account_status on public.profiles
 for each row execute function private.private_experience_account_cleanup();

revoke all on function private.guard_template_privacy(),private.clear_private_experiences(uuid),private.private_experience_account_cleanup()
 from public,anon,authenticated;
grant execute on function private.guard_template_privacy(),private.clear_private_experiences(uuid),private.private_experience_account_cleanup()
 to service_role;

-- Also repair any account whose deletion began before this migration arrived.
do $$ declare actor uuid; begin
 for actor in select id from public.profiles where account_status in ('deleting','deleted') loop
  perform private.clear_private_experiences(actor);
 end loop;
end $$;
