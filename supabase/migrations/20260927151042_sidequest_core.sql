-- Sidequest: all money and completion transitions are single service-only transactions.
-- Browser tokens cannot execute these RPCs. Worker derives p_actor from verified Auth.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private, public to service_role;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create table public.profiles (
  id uuid primary key, auth_user_id uuid unique references auth.users(id) on delete set null, display_name text not null default '' check (length(display_name)<=80),
  timezone text not null default 'UTC', locale text not null default 'en-US', preferences jsonb not null default '{}' check(jsonb_typeof(preferences)='object' and octet_length(preferences::text)<=32000),
  imported_summary text not null default '' check (length(imported_summary)<=4000), onboarding_complete boolean not null default false,
  account_status text not null default 'active' check (account_status in ('active','disabled','deleting','deleted')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.wallets (
  owner_id uuid primary key references public.profiles(id), xp bigint not null default 0 check(xp>=0),
  points bigint not null default 0 check(points>=0), version bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.quest_templates (
  id text primary key, family_id text not null, version int not null default 1 check(version>0),
  category text not null check(category in ('date_night','daytime','late_night','street_challenges','demon')),
  intensity text not null check(intensity in ('chill','bold','full_send')), title text not null,
  content jsonb not null, published boolean not null default false, created_at timestamptz not null default now(),
  unique(family_id,intensity,version)
);
create table public.sponsors (
  id uuid primary key default gen_random_uuid(), name text not null, approved boolean not null default false,
  area text not null, created_at timestamptz not null default now()
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), sponsor_id uuid not null references public.sponsors,
  version int not null default 1 check(version>0), title text not null check(length(title) between 1 and 120),
  disclosure text not null check(length(disclosure) between 1 and 120), area text not null check(length(area) between 1 and 100),
  categories text[] not null check(cardinality(categories) between 1 and 5 and categories <@ array['date_night','daytime','late_night','street_challenges','demon']::text[] and array_position(categories,null) is null),
  family_ids text[] not null check(cardinality(family_ids) between 1 and 10 and array_position(family_ids,null) is null),
  funded boolean not null default false, state text not null default 'draft' check(state in ('draft','active','paused','ended')),
  starts_at timestamptz not null, ends_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_at>starts_at)
);
create index campaigns_active_area on public.campaigns(area,starts_at,ends_at) where state='active' and funded;
create index campaigns_sponsor on public.campaigns(sponsor_id);
create table private.campaign_operations (
  campaign_id uuid primary key references public.campaigns, funding_reference text not null default '', notes text not null default '' check(length(notes)<=3000)
);
create table private.sponsor_operations (
  sponsor_id uuid primary key references public.sponsors, contact_notes text not null default '', funding_reference text not null default ''
);
create table public.quest_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
  template_id text not null references public.quest_templates, family_id text not null,
  intensity text not null check(intensity in ('chill','bold','full_send')), category text not null,
  snapshot jsonb not null, snapshot_hash text not null, outing jsonb not null,
  participants int not null check(participants between 1 and 12), budget_amount int not null check(budget_amount between 0 and 1000000),
  budget_scope text not null check(budget_scope in ('total','per_person')), currency text not null check(currency ~ '^[A-Z]{3}$'),
  area text not null default '' check(length(area)<=100), selected_role text not null check(selected_role in ('main_character','mastermind','camera_person','rotate')),
  status text not null default 'accepted' check(status in ('accepted','in_progress','review_needed','finalized','abandoned')),
  evidence_manifest jsonb, evidence_hash text, reward_decision jsonb, review_deadline timestamptz,
  requires_review boolean not null default false, review_reason text check(length(review_reason)<=200),
  created_at timestamptz not null default now(), finalized_at timestamptz, privacy_redacted_at timestamptz, updated_at timestamptz not null default now(),
  unique(id,owner_id), check((evidence_manifest is null)=(evidence_hash is null)),
  check((status='finalized')=(reward_decision is not null and finalized_at is not null))
);
create unique index one_active_run on public.quest_runs(owner_id) where status in ('accepted','in_progress');
create index runs_owner_created on public.quest_runs(owner_id,created_at desc,id);
create index runs_award_window on public.quest_runs(owner_id,finalized_at,family_id) where status='finalized';
create table public.media_assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
  run_id uuid not null, kind text not null check(kind in ('source','reel','thumbnail')), slot smallint,
  generation int not null default 1 check(generation>0), staging_key text unique, object_key text unique,
  state text not null default 'pending' check(state in ('pending','sealed','deleted')),
  expected_bytes bigint check(expected_bytes between 1 and 41943040), bytes bigint check(bytes between 1 and 104857600),
  mime text, duration_ms int check(duration_ms between 1 and 60000), sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}', upload_expires_at timestamptz, is_current boolean not null default false,
  created_at timestamptz not null default now(), sealed_at timestamptz, deleted_at timestamptz,
  foreign key(run_id,owner_id) references public.quest_runs(id,owner_id), unique(run_id,slot,generation),
  check(kind<>'source' or bytes<=41943040),
  check((kind='source' and slot between 1 and 3) or (kind<>'source' and slot is null)),
  check(state<>'sealed' or (object_key is not null and bytes is not null and duration_ms is not null and sha256 is not null and sealed_at is not null))
);
create unique index one_current_slot on public.media_assets(run_id,slot) where is_current and kind='source' and state='sealed';
create index media_owner_run on public.media_assets(owner_id,run_id);
create table public.render_jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, run_id uuid not null,
  manifest jsonb not null, manifest_hash text not null, renderer_version text not null default 'ffmpeg-v1',
  status text not null default 'queued' check(status in ('queued','processing','ready','failed','canceled')),
  attempts int not null default 0 check(attempts between 0 and 3), manual_retries int not null default 0 check(manual_retries between 0 and 3), fence bigint not null default 0,
  lease_expires_at timestamptz, output_asset_id uuid references public.media_assets, error_code text, privacy_redacted_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(run_id,owner_id) references public.quest_runs(id,owner_id), unique(run_id,manifest_hash,renderer_version)
);
create table public.render_outbox (
  job_id uuid primary key references public.render_jobs, created_at timestamptz not null default now(), dispatched_at timestamptz,
  dispatch_attempts int not null default 0
);
create index render_pending on public.render_jobs(status,lease_expires_at);
create table public.reward_offers (
  id uuid primary key default gen_random_uuid(), merchant_id uuid not null references public.sponsors, version int not null default 1,
  title text not null, terms text not null, area text not null, currency text not null check(currency ~ '^[A-Z]{3}$'),
  point_cost int not null check(point_cost between 1 and 1000000),
  stock_total int not null check(stock_total>=0), stock_available int not null check(stock_available>=0),
  stock_reserved int not null default 0 check(stock_reserved>=0), stock_consumed int not null default 0 check(stock_consumed>=0),
  funded boolean not null default false, is_demo boolean not null default false, active boolean not null default false,
  starts_at timestamptz not null, ends_at timestamptz not null, per_user_limit int not null default 1 check(per_user_limit between 1 and 100),
  reservation_minutes int not null default 60 check(reservation_minutes between 5 and 1440), created_at timestamptz not null default now(),
  check(ends_at>starts_at), check(stock_total=stock_available+stock_reserved+stock_consumed)
);
create table private.offer_operations (offer_id uuid primary key references public.reward_offers, notes text not null default '', funding_reference text not null);
create table public.redemptions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, offer_id uuid not null references public.reward_offers,
  merchant_id uuid not null references public.sponsors, point_cost int not null check(point_cost>0), terms text not null, offer_version int not null,
  state text not null default 'reserved' check(state in ('reserved','consumed','cancelled','expired')),
  created_at timestamptz not null default now(), expires_at timestamptz not null, consumed_at timestamptz, consumed_by uuid references public.profiles,
  closed_at timestamptz, unique(id,owner_id)
);
create index redemptions_owner on public.redemptions(owner_id,created_at desc);
create index redemptions_offer_owner on public.redemptions(offer_id,owner_id,state);
create table private.redemption_secrets (
  redemption_id uuid primary key references public.redemptions, nonce uuid not null default gen_random_uuid(), token_hash text,
  key_version int not null default 1, revoked_at timestamptz
);
create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
  asset text not null check(asset in ('xp','points')), delta bigint not null check(delta<>0 and abs(delta)<=1000000),
  reason text not null check(reason in ('completion','reservation','refund','adjustment')), event_key text not null unique,
  run_id uuid references public.quest_runs, redemption_id uuid references public.redemptions,
  created_at timestamptz not null default now()
);
create unique index one_completion_asset on public.reward_ledger(run_id,asset) where reason='completion';
create unique index one_refund_redemption on public.reward_ledger(redemption_id) where reason='refund';
create unique index one_debit_redemption on public.reward_ledger(redemption_id) where reason='reservation';
create index ledger_owner on public.reward_ledger(owner_id,created_at desc);
create table public.share_links (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, run_id uuid not null,
  asset_id uuid not null references public.media_assets, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  caption text not null default '' check(length(caption)<=240), created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days', revoked_at timestamptz,
  foreign key(run_id,owner_id) references public.quest_runs(id,owner_id)
);
create table private.role_memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
  role text not null check(role in ('operator','merchant')), merchant_id uuid references public.sponsors, revoked_at timestamptz,
  check((role='operator' and merchant_id is null) or (role='merchant' and merchant_id is not null))
);
create unique index membership_scope on private.role_memberships(user_id,role,coalesce(merchant_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table private.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles, action text not null,
  target_id text, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.idempotency_records (
  actor_id uuid not null references public.profiles, operation text not null, key text not null check(length(key) between 8 and 128),
  request_hash text not null check(length(request_hash) between 1 and 128), result jsonb,
  created_at timestamptz not null default now(), primary key(actor_id,operation,key)
);
create table public.media_cleanup (
  asset_id uuid primary key references public.media_assets, object_key text, staging_key text, created_at timestamptz not null default now(), completed_at timestamptz
);

create function private.content_hash(p_value jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$$;
create function private.assert_actor(p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.profiles where id=p_actor and account_status='active' for share;
 if not found then raise exception 'account_unavailable'; end if;
end $$;
create function private.begin_request(p_actor uuid,p_operation text,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r private.idempotency_records;
begin
 perform private.assert_actor(p_actor);
 insert into private.idempotency_records(actor_id,operation,key,request_hash) values(p_actor,p_operation,p_key,p_hash) on conflict do nothing;
 select * into r from private.idempotency_records where actor_id=p_actor and operation=p_operation and key=p_key for update;
 if r.request_hash<>p_hash then raise exception 'idempotency_conflict'; end if;
 return r.result;
end $$;
create function private.end_request(p_actor uuid,p_operation text,p_key text,p_result jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 update private.idempotency_records set result=p_result where actor_id=p_actor and operation=p_operation and key=p_key;
 return p_result;
end $$;
create function private.is_operator(p_actor uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from private.role_memberships m join public.profiles p on p.id=m.user_id where m.user_id=p_actor and m.role='operator' and m.revoked_at is null and p.account_status='active')
$$;
create function private.guard_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='reward_ledger' then raise exception 'ledger_immutable'; end if;
 if tg_table_name='quest_templates' and (to_jsonb(new)-'published')<>(to_jsonb(old)-'published') then raise exception 'template_version_immutable'; end if;
 if tg_table_name='quest_runs' then
  if new.privacy_redacted_at is not null then
   if not exists(select 1 from public.profiles where id=new.owner_id and account_status in ('deleting','deleted')) then raise exception 'redaction_requires_deletion'; end if;
   if (to_jsonb(new)-array['snapshot','outing','evidence_manifest','participants','budget_amount','area','selected_role','privacy_redacted_at','updated_at']) is distinct from (to_jsonb(old)-array['snapshot','outing','evidence_manifest','participants','budget_amount','area','selected_role','privacy_redacted_at','updated_at']) or new.snapshot->>'redacted' is distinct from 'true' or new.outing<>'{}'::jsonb or new.area<>'' or new.budget_amount<>0 or new.participants<>1 or new.selected_role<>'rotate' or (new.evidence_manifest is not null and new.evidence_manifest<>'{"redacted":true}'::jsonb) then raise exception 'invalid_deletion_redaction'; end if;
   return new;
  end if;
  if (new.snapshot,new.snapshot_hash,new.owner_id,new.template_id,new.family_id,new.intensity,new.category,new.outing,new.participants,new.budget_amount,new.budget_scope,new.currency,new.area,new.selected_role) is distinct from (old.snapshot,old.snapshot_hash,old.owner_id,old.template_id,old.family_id,old.intensity,old.category,old.outing,old.participants,old.budget_amount,old.budget_scope,old.currency,old.area,old.selected_role) then raise exception 'accepted_snapshot_immutable'; end if;
  if old.evidence_manifest is not null and (new.evidence_manifest,new.evidence_hash) is distinct from (old.evidence_manifest,old.evidence_hash) then raise exception 'evidence_immutable'; end if;
  if old.reward_decision is not null and (new.reward_decision,new.finalized_at) is distinct from (old.reward_decision,old.finalized_at) then raise exception 'reward_decision_immutable'; end if;
  if old.status<>new.status and not ((old.status='accepted' and new.status in ('in_progress','review_needed','finalized','abandoned')) or (old.status='in_progress' and new.status in ('review_needed','finalized','abandoned')) or (old.status='review_needed' and new.status='finalized')) then raise exception 'invalid_run_transition'; end if;
 end if;
 if tg_table_name='media_assets' then
 if old.state='sealed' and (new.object_key,new.sha256,new.bytes,new.duration_ms,new.generation,new.owner_id,new.run_id,new.slot,new.kind,new.staging_key,new.mime,new.sealed_at,new.expected_bytes,new.upload_expires_at,new.created_at) is distinct from (old.object_key,old.sha256,old.bytes,old.duration_ms,old.generation,old.owner_id,old.run_id,old.slot,old.kind,old.staging_key,old.mime,old.sealed_at,old.expected_bytes,old.upload_expires_at,old.created_at) then raise exception 'sealed_asset_immutable'; end if;
 end if;
 if tg_table_name='render_jobs' then
  if new.privacy_redacted_at is not null then
   if not exists(select 1 from public.profiles where id=new.owner_id and account_status in ('deleting','deleted')) then raise exception 'redaction_requires_deletion'; end if;
   if (to_jsonb(new)-array['manifest','privacy_redacted_at','updated_at']) is distinct from (to_jsonb(old)-array['manifest','privacy_redacted_at','updated_at']) or new.manifest<>'{"redacted":true}'::jsonb then raise exception 'invalid_deletion_redaction'; end if;
   return new;
  end if;
 if (new.manifest,new.manifest_hash,new.owner_id,new.run_id,new.renderer_version) is distinct from (old.manifest,old.manifest_hash,old.owner_id,old.run_id,old.renderer_version) then raise exception 'render_manifest_immutable'; end if;
 end if;
 if tg_table_name='redemptions' then
  if (new.owner_id,new.offer_id,new.merchant_id,new.point_cost,new.terms,new.offer_version,new.expires_at) is distinct from (old.owner_id,old.offer_id,old.merchant_id,old.point_cost,old.terms,old.offer_version,old.expires_at) then raise exception 'redemption_terms_immutable'; end if;
  if old.state<>new.state and old.state<>'reserved' then raise exception 'redemption_terminal'; end if;
 end if;
 return new;
end $$;
create trigger ledger_no_mutation before update or delete on public.reward_ledger for each row execute function private.guard_immutable();
create trigger template_immutable before update on public.quest_templates for each row execute function private.guard_immutable();
create trigger run_immutable before update on public.quest_runs for each row execute function private.guard_immutable();
create trigger asset_immutable before update on public.media_assets for each row execute function private.guard_immutable();
create trigger render_immutable before update on public.render_jobs for each row execute function private.guard_immutable();
create trigger redemption_immutable before update on public.redemptions for each row execute function private.guard_immutable();

create function public.sq_upsert_profile(p_actor uuid,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.profiles;
begin
 if not exists(select 1 from auth.users where id=p_actor and not coalesce(is_anonymous,false)) then raise exception 'account_unavailable'; end if;
 insert into public.profiles(id,auth_user_id) values(p_actor,p_actor) on conflict do nothing;
 perform private.assert_actor(p_actor);
 update public.profiles set display_name=coalesce(p_input->>'display_name',display_name), timezone=coalesce(p_input->>'timezone',timezone),
 locale=coalesce(p_input->>'locale',locale), preferences=coalesce(p_input->'preferences',preferences), imported_summary=coalesce(p_input->>'imported_summary',imported_summary),
 onboarding_complete=coalesce((p_input->>'onboarding_complete')::boolean,onboarding_complete),updated_at=now() where id=p_actor returning * into r;
 insert into public.wallets(owner_id) values(p_actor) on conflict do nothing;
 return to_jsonb(r);
end $$;
create function public.sq_eligibility(p_actor uuid,p_family text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare reason text:='eligible';
begin
 perform private.assert_actor(p_actor);
 if exists(select 1 from public.quest_runs where owner_id=p_actor and family_id=p_family and (reward_decision->>'xp')::int>0 and finalized_at>now()-interval '30 days') then reason:='family_cooldown';
 elsif (select count(*) from public.quest_runs where owner_id=p_actor and (reward_decision->>'xp')::int>0 and finalized_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=3 then reason:='daily_cap'; end if;
 return jsonb_build_object('eligible',reason='eligible','reason',reason,'reset_at',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC');
end $$;
create function public.sq_accept_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; t public.quest_templates; r public.quest_runs; snap jsonb; result jsonb; campaign public.campaigns; sponsor_name text;
begin
 cached:=private.begin_request(p_actor,'accept_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into t from public.quest_templates where id=p_input->>'template_id' and published for share;
 if not found then raise exception 'template_unavailable'; end if;
 if exists(select 1 from public.quest_runs where owner_id=p_actor and status in ('accepted','in_progress')) then raise exception 'active_run_exists'; end if;
 if jsonb_typeof(p_input->'outing')<>'object' then raise exception 'invalid_outing'; end if;
 snap:=jsonb_build_object('template',t.content,'template_id',t.id,'version',t.version,'family_id',t.family_id,'intensity',t.intensity,'category',t.category,'title',t.title,'role',coalesce(p_input->>'role',p_input->'outing'->>'role',(select preferences->>'role' from public.profiles where id=p_actor),'rotate'),
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
create function public.sq_abandon_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs;
begin
 cached:=private.begin_request(p_actor,'abandon_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.status in ('accepted','in_progress') then update public.quest_runs set status='abandoned',updated_at=now() where id=r.id returning * into r;
 elsif r.status<>'abandoned' then raise exception 'invalid_run_state'; end if;
 return private.end_request(p_actor,'abandon_run',p_key,to_jsonb(r));
end $$;
create function public.sq_reserve_upload(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs; a public.media_assets; gen int; asset_id uuid:=gen_random_uuid();
begin
 cached:=private.begin_request(p_actor,'reserve_upload',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.status not in ('accepted','in_progress') then raise exception 'evidence_frozen'; end if;
 if (select count(*) from public.media_assets where run_id=r.id and kind='source')>=36 then raise exception 'retake_limit'; end if;
 if (select coalesce(sum(coalesce(bytes,expected_bytes,0)),0) from public.media_assets where owner_id=p_actor and state<>'deleted')+coalesce((p_input->>'expected_bytes')::bigint,0)>2147483648 then raise exception 'storage_limit'; end if;
 select coalesce(max(generation),0)+1 into gen from public.media_assets where run_id=r.id and slot=(p_input->>'slot')::int;
 if coalesce(p_input->>'capture_source','gallery') not in ('camera','gallery') then raise exception 'invalid_capture_source'; end if;
 insert into public.media_assets(id,owner_id,run_id,kind,slot,generation,staging_key,expected_bytes,mime,upload_expires_at,metadata)
 values(asset_id,p_actor,r.id,'source',(p_input->>'slot')::int,gen,'staging/'||p_actor||'/'||asset_id,(p_input->>'expected_bytes')::bigint,p_input->>'mime',now()+interval '15 minutes',jsonb_build_object('capture_source',coalesce(p_input->>'capture_source','gallery'))) returning * into a;
 update public.quest_runs set status='in_progress',updated_at=now() where id=r.id;
 return private.end_request(p_actor,'reserve_upload',p_key,to_jsonb(a));
end $$;
create function public.sq_seal_media(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; a public.media_assets; r public.quest_runs;
begin
 cached:=private.begin_request(p_actor,'seal_media',p_key,p_hash); if cached is not null then return cached; end if;
 select * into a from public.media_assets where id=(p_input->>'asset_id')::uuid and owner_id=p_actor;
 if not found then raise exception 'not_found'; end if;
 select * into r from public.quest_runs where id=a.run_id for update;
 select * into a from public.media_assets where id=a.id for update;
 if a.state='sealed' then return private.end_request(p_actor,'seal_media',p_key,to_jsonb(a)); end if;
 if a.state<>'pending' or a.upload_expires_at<=now() or r.status not in ('accepted','in_progress') then raise exception 'upload_expired'; end if;
 if exists(select 1 from public.media_assets where run_id=a.run_id and slot=a.slot and generation>a.generation) then raise exception 'stale_generation'; end if;
 if p_input->>'object_key' !~ ('^sealed/'||p_actor||'/'||a.id||'/[a-f0-9]{64}$') then raise exception 'invalid_sealed_key'; end if;
 if (p_input->>'bytes')::bigint<>a.expected_bytes or (p_input->>'duration_ms')::int<5000 then raise exception 'invalid_media'; end if;
 update public.media_assets set is_current=false where run_id=a.run_id and slot=a.slot and is_current;
 update public.media_assets set state='sealed',object_key=p_input->>'object_key',bytes=(p_input->>'bytes')::bigint,mime=p_input->>'mime',duration_ms=(p_input->>'duration_ms')::int,sha256=p_input->>'sha256',metadata=a.metadata||coalesce(p_input->'metadata','{}'),sealed_at=now(),is_current=true where id=a.id returning * into a;
 return private.end_request(p_actor,'seal_media',p_key,to_jsonb(a));
end $$;
create function public.sq_check_session(p_actor uuid,p_session uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id where u.id=p_actor and s.id=p_session and coalesce(u.is_anonymous,false)=false)
 and not exists(select 1 from public.profiles where id=p_actor and account_status<>'active')
$$;
create function private.build_manifest(p_actor uuid,p_run uuid,p_clips jsonb,p_current boolean,p_title text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare clip jsonb; a public.media_assets; entries jsonb:='[]'; slots int[]:='{}'; start_ms int; end_ms int;
begin
 if jsonb_typeof(p_clips)<>'array' or jsonb_array_length(p_clips)<>3 then raise exception 'three_clips_required'; end if;
 -- Deterministic row lock order prevents retake/submit races and asset-lock deadlocks.
 perform 1 from public.media_assets where id in (select (value->>'asset_id')::uuid from jsonb_array_elements(p_clips)) order by id for share;
 for clip in select value from jsonb_array_elements(p_clips) loop
  select * into a from public.media_assets where id=(clip->>'asset_id')::uuid and owner_id=p_actor and run_id=p_run and kind='source' and state='sealed';
  if not found or (p_current and not a.is_current) then raise exception 'invalid_evidence'; end if;
  start_ms:=(clip->>'start_ms')::int; end_ms:=(clip->>'end_ms')::int;
  if start_ms is null or end_ms is null or start_ms<0 or end_ms>a.duration_ms or end_ms-start_ms not between 5000 and 15000 or a.slot=any(slots) then raise exception 'invalid_selection'; end if;
  if coalesce(clip->>'fit','cover') not in ('cover','contain') or coalesce((clip->>'crop')::numeric,0.5) not between 0 and 1 or length(coalesce(clip->>'label',''))>64 then raise exception 'invalid_render_settings'; end if;
  slots:=array_append(slots,a.slot);
  entries:=entries||jsonb_build_array(jsonb_build_object('asset_id',a.id,'slot',a.slot,'generation',a.generation,'object_key',a.object_key,'sha256',a.sha256,'start_ms',start_ms,'end_ms',end_ms,'mute',coalesce((clip->>'mute')::boolean,false),'fit',coalesce(clip->>'fit','cover'),'crop',coalesce((clip->>'crop')::numeric,0.5),'label',coalesce(clip->>'label','')));
 end loop;
 if cardinality(slots)<>3 or not slots @> array[1,2,3] then raise exception 'three_slots_required'; end if;
 select jsonb_agg(value order by (value->>'slot')::int) into entries from jsonb_array_elements(entries);
 if length(p_title)>96 then raise exception 'invalid_render_settings'; end if;
 return jsonb_build_object('version',1,'title',p_title,'clips',entries)||coalesce((select case when snapshot ? 'sponsorDisclosure' then jsonb_build_object('sponsorDisclosure',snapshot->>'sponsorDisclosure') else '{}'::jsonb end from public.quest_runs where id=p_run and owner_id=p_actor),'{}'::jsonb);
end $$;
create function private.enqueue_render(p_actor uuid,p_run uuid,p_manifest jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.render_jobs;
begin
 insert into public.render_jobs(owner_id,run_id,manifest,manifest_hash) values(p_actor,p_run,p_manifest,private.content_hash(p_manifest)) on conflict(run_id,manifest_hash,renderer_version) do nothing;
 select * into j from public.render_jobs where run_id=p_run and manifest_hash=private.content_hash(p_manifest) and renderer_version='ffmpeg-v1';
 insert into public.render_outbox(job_id) values(j.id) on conflict do nothing;
 return to_jsonb(j);
end $$;
create function private.finalize_run(p_actor uuid,p_run uuid,p_reason text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.quest_runs; decision jsonb; eligible jsonb; award_xp int:=0; award_points int:=0; added bigint; reason text;
begin
 -- Caller already holds wallet -> run locks. This helper cannot be called by browsers.
 select * into r from public.quest_runs where id=p_run and owner_id=p_actor for update;
 if r.status='finalized' then return to_jsonb(r); end if;
 if r.evidence_manifest is null then raise exception 'evidence_required'; end if;
 if p_reason is null then eligible:=public.sq_eligibility(p_actor,r.family_id); else eligible:=jsonb_build_object('reason',p_reason,'reset_at',(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC'); end if;
 reason:=coalesce(p_reason,eligible->>'reason');
 if reason='eligible' then award_xp:=(r.snapshot->'reward_policy'->>'xp')::int; award_points:=(r.snapshot->'reward_policy'->>'points')::int; end if;
 decision:=jsonb_build_object('xp',award_xp,'points',award_points,'reason',reason,'policy_version',1,'evaluated_at',now(),'reset_at',eligible->'reset_at');
 if award_xp>0 then
  insert into public.reward_ledger(owner_id,asset,delta,reason,event_key,run_id) values(p_actor,'xp',award_xp,'completion','completion:'||r.id||':xp',r.id) on conflict do nothing;
  get diagnostics added=row_count;
  if added=1 then update public.wallets set xp=wallets.xp+award_xp,version=version+1,updated_at=now() where owner_id=p_actor; end if;
  insert into public.reward_ledger(owner_id,asset,delta,reason,event_key,run_id) values(p_actor,'points',award_points,'completion','completion:'||r.id||':points',r.id) on conflict do nothing;
  get diagnostics added=row_count;
  if added=1 then update public.wallets set points=wallets.points+award_points,version=version+1,updated_at=now() where owner_id=p_actor; end if;
 end if;
 update public.quest_runs set status='finalized',reward_decision=decision,finalized_at=now(),updated_at=now() where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
create function public.sq_submit_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs; manifest jsonb; job jsonb; result jsonb;
begin
 cached:=private.begin_request(p_actor,'submit_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.status='abandoned' then raise exception 'invalid_run_state'; end if;
 if r.status in ('accepted','in_progress') then
  if p_input->'declaration'->>'attempted' is distinct from 'true' or p_input->'declaration'->>'consent' is distinct from 'true' then raise exception 'declaration_required'; end if;
  manifest:=private.build_manifest(p_actor,r.id,p_input->'clips',true,r.snapshot->>'title');
  manifest:=manifest||jsonb_build_object('declaration',p_input->'declaration','template_id',r.template_id,'snapshot_hash',r.snapshot_hash);
  update public.quest_runs set evidence_manifest=manifest,evidence_hash=private.content_hash(manifest),updated_at=now() where id=r.id returning * into r;
  job:=private.enqueue_render(p_actor,r.id,manifest-'declaration'-'template_id'-'snapshot_hash');
  if r.requires_review or coalesce((p_input->>'needs_review')::boolean,false) then
   update public.quest_runs set status='review_needed',review_deadline=now()+interval '14 days' where id=r.id returning * into r;
  else perform private.finalize_run(p_actor,r.id); select * into r from public.quest_runs where id=r.id; end if;
 else select to_jsonb(j) into job from public.render_jobs j where run_id=r.id order by created_at limit 1;
 end if;
 result:=jsonb_build_object('run',to_jsonb(r),'wallet',(select to_jsonb(w) from public.wallets w where owner_id=p_actor),'render_job',job);
 return private.end_request(p_actor,'submit_run',p_key,result);
end $$;
create function public.sq_review_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs; result jsonb; decision text:=p_input->>'decision';
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'review_run',p_key,p_hash); if cached is not null then return cached; end if;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid;
 if not found then raise exception 'not_found'; end if;
 if r.owner_id=p_actor then raise exception 'self_review_forbidden'; end if;
 perform 1 from public.wallets where owner_id=r.owner_id for update;
 select * into r from public.quest_runs where id=r.id for update;
 if r.status='finalized' then return private.end_request(p_actor,'review_run',p_key,to_jsonb(r)); end if;
 if r.status<>'review_needed' or decision not in ('approve','reject','close') then raise exception 'invalid_review'; end if;
 if decision='approve' then
  if r.review_deadline<=now() then raise exception 'review_expired'; end if;
  perform private.assert_actor(r.owner_id);
  perform private.build_manifest(r.owner_id,r.id,r.evidence_manifest->'clips',false,r.evidence_manifest->>'title');
  result:=private.finalize_run(r.owner_id,r.id);
 else result:=private.finalize_run(r.owner_id,r.id,case decision when 'reject' then 'review_rejected' else 'review_closed' end); end if;
 insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'review_'||decision,r.id::text,jsonb_build_object('evidence_hash',r.evidence_hash));
 return private.end_request(p_actor,'review_run',p_key,result);
end $$;
create function public.sq_request_render(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs; render_manifest jsonb; existing public.render_jobs; result jsonb;
begin
 cached:=private.begin_request(p_actor,'request_render',p_key,p_hash); if cached is not null then return cached; end if;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.status not in ('finalized','review_needed') then raise exception 'submit_before_render'; end if;
 if (select count(*) from public.media_assets where owner_id=p_actor and kind='reel' and state='sealed')>=50 then raise exception 'reel_limit'; end if;
 if (select count(*) from public.render_jobs where owner_id=p_actor and status in ('queued','processing'))>=3 then raise exception 'render_limit'; end if;
 render_manifest:=private.build_manifest(p_actor,r.id,p_input->'clips',false,coalesce(p_input->'settings'->>'title',r.snapshot->>'title'));
 select * into existing from public.render_jobs where run_id=r.id and manifest_hash=private.content_hash(render_manifest) and renderer_version='ffmpeg-v1' for update;
 if found and existing.status='failed' then
  if existing.error_code not in ('network','capacity','interrupted','retry_limit') then raise exception 'replace_render_input'; end if;
  if existing.manual_retries>=3 then raise exception 'manual_retry_limit'; end if;
  if existing.updated_at>now()-interval '1 minute' then raise exception 'retry_cooldown'; end if;
  update public.render_jobs set status='queued',attempts=0,manual_retries=manual_retries+1,fence=fence+1,error_code=null,lease_expires_at=null,updated_at=now() where id=existing.id returning * into existing;
  update public.render_outbox set dispatched_at=null where job_id=existing.id;
  result:=to_jsonb(existing);
 else result:=private.enqueue_render(p_actor,r.id,render_manifest); end if;
 return private.end_request(p_actor,'request_render',p_key,result);
end $$;
create function public.sq_claim_render(p_job uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.render_jobs;
begin
 select * into j from public.render_jobs where id=p_job;
 if found then
  perform 1 from public.profiles where id=j.owner_id for share;
  perform 1 from public.quest_runs where id=j.run_id for update;
 end if;
 select * into j from public.render_jobs where id=p_job for update;
 if not found or j.status in ('ready','canceled','failed') then return null; end if;
 if not exists(select 1 from public.profiles where id=j.owner_id and account_status='active') then update public.render_jobs set status='canceled',updated_at=now() where id=j.id; return null; end if;
 if j.status='processing' and j.lease_expires_at>now() then return null; end if;
 if j.attempts>=3 then update public.render_jobs set status='failed',error_code='retry_limit',updated_at=now() where id=j.id; return null; end if;
 if exists(select 1 from jsonb_array_elements(j.manifest->'clips') c left join public.media_assets a on a.id=(c->>'asset_id')::uuid where a.id is null or a.state<>'sealed' or a.sha256<>c->>'sha256') then update public.render_jobs set status='canceled',error_code='source_removed',updated_at=now() where id=j.id; return null; end if;
 update public.render_jobs set status='processing',fence=fence+1,attempts=attempts+1,lease_expires_at=now()+interval '10 minutes',updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.sq_finish_render(p_job uuid,p_fence bigint,p_output jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 if p_output->>'mime'<>'video/mp4' or (p_output->>'duration_ms')::int not between 15000 and 55000 then raise exception 'invalid_render_output'; end if;
 insert into public.media_assets(owner_id,run_id,kind,object_key,state,bytes,mime,duration_ms,sha256,metadata,sealed_at)
 values(j.owner_id,j.run_id,'reel',p_output->>'object_key','sealed',(p_output->>'bytes')::bigint,'video/mp4',(p_output->>'duration_ms')::int,p_output->>'sha256',coalesce(p_output->'metadata','{}'),now()) returning * into a;
 update public.render_jobs set status='ready',output_asset_id=a.id,lease_expires_at=null,error_code=null,updated_at=now() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.sq_fail_render(p_job uuid,p_fence bigint,p_error text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.render_jobs;
begin
 select * into j from public.render_jobs where id=p_job for update;
 if not found then raise exception 'not_found'; end if;
 if j.status<>'processing' or j.fence<>p_fence then return to_jsonb(j); end if;
 update public.render_jobs set status=case when attempts<3 and p_error in ('network','capacity','interrupted') then 'queued' else 'failed' end,error_code=case when p_error in ('network','capacity','interrupted','invalid_media','invalid_selection','oversized','encode_failed') then p_error else 'encode_failed' end,lease_expires_at=null,updated_at=now() where id=j.id returning * into j;
 if j.status='queued' then update public.render_outbox set dispatched_at=null where job_id=j.id; end if;
 return to_jsonb(j);
end $$;
create function public.sq_reserve_reward(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; offer public.reward_offers; wallet public.wallets; redemption public.redemptions; nonce uuid:=gen_random_uuid(); result jsonb;
begin
 cached:=private.begin_request(p_actor,'reserve_reward',p_key,p_hash); if cached is not null then return cached; end if;
 select * into wallet from public.wallets where owner_id=p_actor for update;
 select * into offer from public.reward_offers where id=(p_input->>'offer_id')::uuid for update;
 if not found then raise exception 'offer_unavailable'; end if;
 if not offer.active or not offer.funded or offer.is_demo or offer.starts_at>now() or offer.ends_at<=now() or offer.stock_available<1 or not exists(select 1 from public.sponsors where id=offer.merchant_id and approved) then raise exception 'offer_unavailable'; end if;
 if offer.version is distinct from (p_input->>'offer_version')::int or offer.area is distinct from p_input->>'area' then raise exception 'offer_changed'; end if;
 if (select count(*) from public.redemptions where owner_id=p_actor and offer_id=offer.id and state in ('reserved','consumed'))>=offer.per_user_limit then raise exception 'offer_user_limit'; end if;
 if wallet.points<offer.point_cost then raise exception 'insufficient_points'; end if;
 insert into public.redemptions(owner_id,offer_id,merchant_id,point_cost,terms,offer_version,expires_at) values(p_actor,offer.id,offer.merchant_id,offer.point_cost,offer.terms,offer.version,least(offer.ends_at,now()+make_interval(mins=>offer.reservation_minutes))) returning * into redemption;
 insert into private.redemption_secrets(redemption_id,nonce) values(redemption.id,nonce);
 update public.reward_offers set stock_available=stock_available-1,stock_reserved=stock_reserved+1 where id=offer.id;
 insert into public.reward_ledger(owner_id,asset,delta,reason,event_key,redemption_id) values(p_actor,'points',-offer.point_cost,'reservation','reserve:'||redemption.id,redemption.id);
 update public.wallets set points=points-offer.point_cost,version=version+1,updated_at=now() where owner_id=p_actor returning * into wallet;
 result:=jsonb_build_object('redemption',to_jsonb(redemption),'wallet',to_jsonb(wallet),'nonce',nonce,'key_version',1);
 return private.end_request(p_actor,'reserve_reward',p_key,result);
end $$;
create function public.sq_redemption_material(p_actor uuid,p_redemption uuid,p_token_hash text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.redemptions; s private.redemption_secrets;
begin
 perform private.assert_actor(p_actor);
 select * into r from public.redemptions where id=p_redemption and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.state<>'reserved' or r.expires_at<=now() then raise exception 'redemption_unavailable'; end if;
 select * into s from private.redemption_secrets where redemption_id=r.id for update;
 if s.revoked_at is not null then raise exception 'redemption_unavailable'; end if;
 if p_token_hash is not null then
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token'; end if;
  if s.token_hash is not null and s.token_hash<>p_token_hash then raise exception 'token_mismatch'; end if;
  update private.redemption_secrets set token_hash=p_token_hash where redemption_id=r.id returning * into s;
 end if;
 return jsonb_build_object('redemption',to_jsonb(r),'nonce',s.nonce,'key_version',s.key_version);
end $$;
create function private.close_redemption(p_owner uuid,p_redemption uuid,p_state text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.redemptions; inserted int;
begin
 -- Caller holds wallet first. Never acquire wallet after redemption/offer.
 select * into r from public.redemptions where id=p_redemption and owner_id=p_owner for update;
 if not found then raise exception 'not_found'; end if;
 if r.state<>'reserved' then return to_jsonb(r); end if;
 if p_state not in ('cancelled','expired') or (p_state='expired' and r.expires_at>now()) then raise exception 'invalid_redemption_transition'; end if;
 perform 1 from public.reward_offers where id=r.offer_id for update;
 update public.redemptions set state=p_state,closed_at=now() where id=r.id returning * into r;
 update private.redemption_secrets set revoked_at=now() where redemption_id=r.id;
 insert into public.reward_ledger(owner_id,asset,delta,reason,event_key,redemption_id) values(p_owner,'points',r.point_cost,'refund','refund:'||r.id,r.id) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=1 then
  update public.wallets set points=points+r.point_cost,version=version+1,updated_at=now() where owner_id=p_owner;
  update public.reward_offers set stock_available=stock_available+1,stock_reserved=stock_reserved-1 where id=r.offer_id;
 end if;
 return to_jsonb(r);
end $$;
create function public.sq_cancel_redemption(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; result jsonb;
begin
 cached:=private.begin_request(p_actor,'cancel_redemption',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 result:=private.close_redemption(p_actor,(p_input->>'redemption_id')::uuid,'cancelled');
 return private.end_request(p_actor,'cancel_redemption',p_key,jsonb_build_object('redemption',result,'wallet',(select to_jsonb(w) from public.wallets w where owner_id=p_actor)));
end $$;
create function public.sq_consume_redemption(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.redemptions; s private.redemption_secrets;
begin
 select * into r from public.redemptions where id=(p_input->>'redemption_id')::uuid;
 if not found then raise exception 'redemption_unavailable'; end if;
 if not exists(select 1 from private.role_memberships where user_id=p_actor and role='merchant' and merchant_id=r.merchant_id and revoked_at is null) then raise exception 'redemption_unavailable'; end if;
 cached:=private.begin_request(p_actor,'consume_redemption',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=r.owner_id for update;
 select * into r from public.redemptions where id=r.id for update;
 select * into s from private.redemption_secrets where redemption_id=r.id;
 if s.token_hash is null or s.token_hash is distinct from p_input->>'token_hash' or s.revoked_at is not null then raise exception 'redemption_unavailable'; end if;
 if r.state='consumed' then return private.end_request(p_actor,'consume_redemption',p_key,jsonb_build_object('id',r.id,'state','consumed','already_consumed',true)); end if;
 if r.state<>'reserved' or r.expires_at<=now() then raise exception 'redemption_unavailable'; end if;
 perform 1 from public.reward_offers where id=r.offer_id for update;
 update public.redemptions set state='consumed',consumed_at=now(),consumed_by=p_actor,closed_at=now() where id=r.id returning * into r;
 update public.reward_offers set stock_reserved=stock_reserved-1,stock_consumed=stock_consumed+1 where id=r.offer_id;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'reward_consumed',r.id::text);
 return private.end_request(p_actor,'consume_redemption',p_key,jsonb_build_object('id',r.id,'state',r.state,'already_consumed',false));
end $$;
create function public.sq_create_share(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs; a public.media_assets; s public.share_links;
begin
 cached:=private.begin_request(p_actor,'create_share',p_key,p_hash); if cached is not null then return cached; end if;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for share;
 if not found or r.status<>'finalized' then raise exception 'not_found'; end if;
 select * into a from public.media_assets where id=(p_input->>'asset_id')::uuid and run_id=r.id and owner_id=p_actor and kind='reel' and state='sealed' for share;
 if not found then raise exception 'render_not_ready'; end if;
 insert into public.share_links(owner_id,run_id,asset_id,token_hash,caption) values(p_actor,r.id,a.id,p_input->>'token_hash',coalesce(p_input->>'caption','')) returning * into s;
 return private.end_request(p_actor,'create_share',p_key,to_jsonb(s)-'token_hash');
end $$;
create function public.sq_revoke_share(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; s public.share_links;
begin
 cached:=private.begin_request(p_actor,'revoke_share',p_key,p_hash); if cached is not null then return cached; end if;
 update public.share_links set revoked_at=coalesce(revoked_at,now()) where id=(p_input->>'share_id')::uuid and owner_id=p_actor returning * into s;
 if not found then raise exception 'not_found'; end if;
 return private.end_request(p_actor,'revoke_share',p_key,to_jsonb(s)-'token_hash');
end $$;
create function public.sq_update_clip(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; a public.media_assets; start_ms int:=(p_input->>'start_ms')::int; end_ms int:=(p_input->>'end_ms')::int; crop numeric:=coalesce((p_input->>'crop')::numeric,0.5);
begin
 cached:=private.begin_request(p_actor,'update_clip',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 select * into a from public.media_assets where id=(p_input->>'asset_id')::uuid and owner_id=p_actor and run_id=(p_input->>'run_id')::uuid and state='sealed' and kind='source' and is_current for update;
 if not found then raise exception 'not_found'; end if;
 if start_ms is null or end_ms is null or start_ms<0 or end_ms>a.duration_ms or end_ms-start_ms not between 5000 and 15000 or crop not between 0 and 1 or coalesce(p_input->>'fit','cover') not in ('cover','contain') or length(coalesce(p_input->>'label',''))>64 then raise exception 'invalid_selection'; end if;
 update public.media_assets set metadata=metadata||jsonb_build_object('selection',jsonb_build_object('start_ms',start_ms,'end_ms',end_ms,'crop',crop,'fit',coalesce(p_input->>'fit','cover'),'mute',coalesce((p_input->>'mute')::boolean,false),'label',coalesce(p_input->>'label',''))) where id=a.id returning * into a;
 return private.end_request(p_actor,'update_clip',p_key,to_jsonb(a));
end $$;
create function public.sq_delete_media(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; a public.media_assets; r public.quest_runs;
begin
 cached:=private.begin_request(p_actor,'delete_media',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into a from public.media_assets where id=(p_input->>'asset_id')::uuid and owner_id=p_actor;
 if not found then raise exception 'not_found'; end if;
 select * into r from public.quest_runs where id=a.run_id for update;
 if r.status='review_needed' and exists(select 1 from jsonb_array_elements(r.evidence_manifest->'clips') c where c->>'asset_id'=a.id::text) then perform private.finalize_run(p_actor,r.id,'evidence_deleted'); end if;
 update public.share_links set revoked_at=coalesce(revoked_at,now()) where asset_id=a.id;
 update public.render_jobs set status='canceled',lease_expires_at=null,updated_at=now() where run_id=r.id and status in ('queued','processing');
 update public.media_assets set state='deleted',is_current=false,deleted_at=coalesce(deleted_at,now()) where id=a.id returning * into a;
 insert into public.media_cleanup(asset_id,object_key,staging_key) values(a.id,a.object_key,a.staging_key) on conflict do nothing;
 return private.end_request(p_actor,'delete_media',p_key,jsonb_build_object('id',a.id,'state','deleted'));
end $$;
create function public.sq_operator_state(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.assert_actor(p_actor);
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 return jsonb_build_object('templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.quest_templates t),
 'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]') from public.quest_runs r where status='review_needed'),
 'offers',(select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc),'[]') from public.reward_offers o),
 'sponsors',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.sponsors s),
 'campaigns',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]') from public.campaigns c),
 'redemptions',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select id,offer_id,state,created_at,consumed_at from public.redemptions order by created_at desc limit 100) d),
 'attention',(select coalesce(jsonb_agg(to_jsonb(j)),'[]') from public.render_jobs j where status='failed'));
end $$;
create function public.sq_memberships(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform private.assert_actor(p_actor);
 return (select coalesce(jsonb_agg(jsonb_build_object('role',role,'merchant_id',merchant_id)),'[]') from private.role_memberships where user_id=p_actor and revoked_at is null);
end $$;
create function public.sq_upsert_sponsor(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; s public.sponsors;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'upsert_sponsor',p_key,p_hash); if cached is not null then return cached; end if;
 if length(coalesce(p_input->>'funding_reference',''))<3 then raise exception 'funding_reference_required'; end if;
 insert into public.sponsors(id,name,approved,area) values(coalesce((p_input->>'id')::uuid,gen_random_uuid()),p_input->>'name',coalesce((p_input->>'approved')::boolean,false),p_input->>'area')
 on conflict(id) do update set name=excluded.name,approved=excluded.approved,area=excluded.area returning * into s;
 insert into private.sponsor_operations(sponsor_id,contact_notes,funding_reference) values(s.id,coalesce(p_input->>'contact_notes',''),p_input->>'funding_reference') on conflict(sponsor_id) do update set contact_notes=excluded.contact_notes,funding_reference=excluded.funding_reference;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'sponsor_updated',s.id::text);
 return private.end_request(p_actor,'upsert_sponsor',p_key,to_jsonb(s));
end $$;
create function public.sq_publish_offer(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; o public.reward_offers; reserved int:=0; consumed int:=0; total int:=(p_input->>'stock_total')::int;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'publish_offer',p_key,p_hash); if cached is not null then return cached; end if;
 if coalesce((p_input->>'funded')::boolean,false) and length(coalesce(p_input->>'funding_reference',''))<3 then raise exception 'funding_reference_required'; end if;
 if p_input->>'id' is not null then
  select * into o from public.reward_offers where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'not_found'; end if;
  reserved:=o.stock_reserved; consumed:=o.stock_consumed;
  if o.merchant_id is distinct from (p_input->>'merchant_id')::uuid then raise exception 'merchant_immutable'; end if;
 end if;
 if total<reserved+consumed then raise exception 'inventory_below_committed'; end if;
 if coalesce((p_input->>'active')::boolean,false) and (not coalesce((p_input->>'funded')::boolean,false) or not exists(select 1 from public.sponsors where id=(p_input->>'merchant_id')::uuid and approved)) then raise exception 'funding_required'; end if;
 insert into public.reward_offers(id,merchant_id,version,title,terms,area,currency,point_cost,stock_total,stock_available,stock_reserved,stock_consumed,funded,active,starts_at,ends_at,per_user_limit,reservation_minutes)
 values(coalesce(o.id,gen_random_uuid()),(p_input->>'merchant_id')::uuid,coalesce(o.version,0)+1,p_input->>'title',p_input->>'terms',p_input->>'area',p_input->>'currency',(p_input->>'point_cost')::int,total,total-reserved-consumed,reserved,consumed,coalesce((p_input->>'funded')::boolean,false),coalesce((p_input->>'active')::boolean,false),(p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz,coalesce((p_input->>'per_user_limit')::int,1),coalesce((p_input->>'reservation_minutes')::int,60))
 on conflict(id) do update set version=excluded.version,title=excluded.title,terms=excluded.terms,area=excluded.area,currency=excluded.currency,point_cost=excluded.point_cost,stock_total=excluded.stock_total,stock_available=excluded.stock_available,funded=excluded.funded,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,per_user_limit=excluded.per_user_limit,reservation_minutes=excluded.reservation_minutes returning * into o;
 insert into private.offer_operations(offer_id,notes,funding_reference) values(o.id,coalesce(p_input->>'notes',''),coalesce(p_input->>'funding_reference','')) on conflict(offer_id) do update set notes=excluded.notes,funding_reference=excluded.funding_reference;
 insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'offer_updated',o.id::text,jsonb_build_object('version',o.version,'active',o.active));
 return private.end_request(p_actor,'publish_offer',p_key,to_jsonb(o));
end $$;
create function public.sq_set_template_publication(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; t public.quest_templates;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'set_template_publication',p_key,p_hash); if cached is not null then return cached; end if;
 update public.quest_templates set published=(p_input->>'published')::boolean where id=p_input->>'template_id' returning * into t;
 if not found then raise exception 'not_found'; end if;
 insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'template_publication',t.id,jsonb_build_object('published',t.published));
 return private.end_request(p_actor,'set_template_publication',p_key,to_jsonb(t));
end $$;
create function public.sq_delete_account(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r record;
begin
 -- A deleted account has no normal authenticated API path. Retried deletion can still return its original result.
 select result into cached from private.idempotency_records where actor_id=p_actor and operation='delete_account' and key=p_key and request_hash=p_hash;
 if cached is not null then return cached; end if;
 cached:=private.begin_request(p_actor,'delete_account',p_key,p_hash);
 perform 1 from public.profiles where id=p_actor for update;
 perform 1 from public.wallets where owner_id=p_actor for update;
 for r in select id,status from public.quest_runs where owner_id=p_actor order by id for update loop
  if r.status='review_needed' then perform private.finalize_run(p_actor,r.id,'account_deleted');
  elsif r.status in ('accepted','in_progress') then update public.quest_runs set status='abandoned',updated_at=now() where id=r.id; end if;
 end loop;
 for r in select id from public.redemptions where owner_id=p_actor and state='reserved' order by id loop perform private.close_redemption(p_actor,r.id,'cancelled'); end loop;
 update public.profiles set account_status='deleting',display_name='',imported_summary='',preferences='{}',onboarding_complete=false,timezone='UTC',locale='en-US',updated_at=now() where id=p_actor;
 update public.share_links set revoked_at=coalesce(revoked_at,now()) where owner_id=p_actor;
 update private.role_memberships set revoked_at=coalesce(revoked_at,now()) where user_id=p_actor;
 update public.render_jobs set status='canceled',lease_expires_at=null,updated_at=now() where owner_id=p_actor and status in ('queued','processing');
 insert into public.media_cleanup(asset_id,object_key,staging_key) select id,object_key,staging_key from public.media_assets where owner_id=p_actor on conflict do nothing;
 update public.media_assets set state='deleted',is_current=false,deleted_at=coalesce(deleted_at,now()) where owner_id=p_actor;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'account_deletion_requested',p_actor::text);
 return private.end_request(p_actor,'delete_account',p_key,jsonb_build_object('status','deleting','cleanup_queued',true));
end $$;
create function public.sq_reconcile(p_limit int default 100) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; expired int:=0; closed int:=0;
begin
 if p_limit not between 1 and 500 then raise exception 'invalid_limit'; end if;
 -- Acquire the whole bounded batch of wallets before any shared offer, avoiding cross-owner cycles.
 perform 1 from public.wallets where owner_id in (select owner_id from public.redemptions where state='reserved' and expires_at<=now() union select owner_id from public.quest_runs where status='review_needed' and review_deadline<=now()) order by owner_id for update;
 for r in select id,owner_id from public.redemptions where state='reserved' and expires_at<=now() order by owner_id,id limit p_limit loop
  perform 1 from public.wallets where owner_id=r.owner_id for update;
  perform private.close_redemption(r.owner_id,r.id,'expired'); expired:=expired+1;
 end loop;
 for r in select id,owner_id from public.quest_runs where status='review_needed' and review_deadline<=now() order by owner_id,id limit p_limit loop
  perform 1 from public.wallets where owner_id=r.owner_id for update;
  perform private.finalize_run(r.owner_id,r.id,'review_expired'); closed:=closed+1;
 end loop;
 update public.render_outbox o set dispatched_at=null from public.render_jobs j where j.id=o.job_id and (j.status='queued' or (j.status='processing' and j.lease_expires_at<=now()));
 return jsonb_build_object('expired_reservations',expired,'closed_reviews',closed);
end $$;
create function public.sq_wallet_audit(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 select coalesce(jsonb_agg(to_jsonb(d)),'[]') into result from (select w.owner_id,w.xp,w.points,coalesce(sum(l.delta) filter(where l.asset='xp'),0) ledger_xp,coalesce(sum(l.delta) filter(where l.asset='points'),0) ledger_points from public.wallets w left join public.reward_ledger l on l.owner_id=w.owner_id group by w.owner_id having w.xp<>coalesce(sum(l.delta) filter(where l.asset='xp'),0) or w.points<>coalesce(sum(l.delta) filter(where l.asset='points'),0)) d;
 insert into private.audit_events(actor_id,action,details) values(p_actor,'wallet_reconciled',jsonb_build_object('mismatches',jsonb_array_length(result)));
 return result;
end $$;

create function public.sq_schedule_retention(p_limit int default 100) returns integer language plpgsql security invoker set search_path='' as $$
declare candidate record; a public.media_assets; r public.quest_runs; count_deleted int:=0;
begin
 if p_limit not between 1 and 500 then raise exception 'invalid_limit'; end if;
 for candidate in select id,owner_id,run_id from public.media_assets where
   (state='pending' and upload_expires_at<now()) or (kind='source' and state='sealed' and created_at<now()-interval '30 days')
   order by owner_id,run_id,id limit p_limit loop
  perform 1 from public.profiles where id=candidate.owner_id for share;
  select * into r from public.quest_runs where id=candidate.run_id for update;
  select * into a from public.media_assets where id=candidate.id for update;
  if a.state='deleted' then continue; end if;
  if a.state='sealed' and (r.status not in ('finalized','abandoned') or exists(select 1 from public.render_jobs where run_id=r.id and status in ('queued','processing','failed')) or (r.status='finalized' and not exists(select 1 from public.render_jobs j join public.media_assets output on output.id=j.output_asset_id where j.run_id=r.id and j.status='ready' and output.state='sealed'))) then continue; end if;
  update public.media_assets set state='deleted',is_current=false,deleted_at=now() where id=a.id;
  insert into public.media_cleanup(asset_id,object_key,staging_key) values(a.id,a.object_key,a.staging_key) on conflict do nothing;
  count_deleted:=count_deleted+1;
 end loop;
 return count_deleted;
end $$;

create function public.sq_pause_offer(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; o public.reward_offers;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'pause_offer',p_key,p_hash); if cached is not null then return cached; end if;
 update public.reward_offers set active=false,version=version+1 where id=(p_input->>'offer_id')::uuid returning * into o;
 if not found then raise exception 'not_found'; end if;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'offer_paused',o.id::text);
 return private.end_request(p_actor,'pause_offer',p_key,to_jsonb(o));
end $$;
create function public.sq_review_evidence(p_actor uuid,p_run uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.quest_runs;
begin
 perform private.assert_actor(p_actor);
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 select * into r from public.quest_runs where id=p_run and status='review_needed';
 if not found then raise exception 'not_found'; end if;
 if r.owner_id=p_actor then raise exception 'self_review_forbidden'; end if;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'review_evidence_opened',p_run::text);
 return jsonb_build_object('run_id',r.id,'snapshot',r.snapshot,'evidence_manifest',r.evidence_manifest,'evidence_hash',r.evidence_hash,'review_deadline',r.review_deadline);
end $$;
create function public.sq_flag_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'flag_run',p_key,p_hash); if cached is not null then return cached; end if;
 update public.quest_runs set requires_review=true,review_reason=coalesce(p_input->>'reason','operator_review'),updated_at=now() where id=(p_input->>'run_id')::uuid and status in ('accepted','in_progress') returning * into r;
 if not found then raise exception 'run_not_active'; end if;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'run_flagged',r.id::text);
 return private.end_request(p_actor,'flag_run',p_key,to_jsonb(r));
end $$;

create function public.sq_delete_run_media(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; r public.quest_runs;
begin
 cached:=private.begin_request(p_actor,'delete_run_media',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into r from public.quest_runs where id=(p_input->>'run_id')::uuid and owner_id=p_actor for update;
 if not found then raise exception 'not_found'; end if;
 if r.status='review_needed' then perform private.finalize_run(p_actor,r.id,'evidence_deleted'); end if;
 update public.render_jobs set status='canceled',lease_expires_at=null,updated_at=now() where run_id=r.id and status in ('queued','processing');
 perform 1 from public.media_assets where run_id=r.id and owner_id=p_actor order by id for update;
 update public.share_links set revoked_at=coalesce(revoked_at,now()) where run_id=r.id and owner_id=p_actor;
 insert into public.media_cleanup(asset_id,object_key,staging_key) select id,object_key,staging_key from public.media_assets where run_id=r.id and owner_id=p_actor on conflict do nothing;
 update public.media_assets set state='deleted',is_current=false,deleted_at=coalesce(deleted_at,now()) where run_id=r.id and owner_id=p_actor;
 return private.end_request(p_actor,'delete_run_media',p_key,jsonb_build_object('deleted',true,'cleanup_queued',true));
end $$;

create function public.sq_finalize_account_deletion(p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare profile public.profiles;
begin
 select * into profile from public.profiles where id=p_actor for update;
 if not found or profile.account_status not in ('deleting','deleted') then raise exception 'deletion_not_requested'; end if;
 if exists(select 1 from public.media_cleanup c join public.media_assets a on a.id=c.asset_id where a.owner_id=p_actor and c.completed_at is null) then raise exception 'media_cleanup_pending'; end if;
 if exists(select 1 from public.media_assets where owner_id=p_actor and state<>'deleted') then raise exception 'media_cleanup_pending'; end if;
 -- Preserve only opaque references, content hashes, and committed economic decisions.
 -- Deletion is the sole exception to content immutability, after access is already revoked.
 update public.quest_runs set snapshot=jsonb_build_object('redacted',true,'template_id',template_id,'family_id',family_id),
  outing='{}',evidence_manifest=case when evidence_manifest is null then null else '{"redacted":true}'::jsonb end,
  participants=1,budget_amount=0,area='',selected_role='rotate',privacy_redacted_at=coalesce(privacy_redacted_at,now()),updated_at=now() where owner_id=p_actor;
 update public.render_jobs set manifest='{"redacted":true}',privacy_redacted_at=coalesce(privacy_redacted_at,now()),updated_at=now() where owner_id=p_actor;
 update public.media_assets set metadata='{}' where owner_id=p_actor;
 delete from public.share_links where owner_id=p_actor;
 delete from private.redemption_secrets where redemption_id in(select id from public.redemptions where owner_id=p_actor);
 delete from private.idempotency_records where actor_id=p_actor or result->>'owner_id'=p_actor::text or result->'run'->>'owner_id'=p_actor::text or result->'redemption'->>'owner_id'=p_actor::text;
 update public.profiles set display_name='',preferences='{}',imported_summary='',timezone='UTC',locale='en-US',onboarding_complete=false,updated_at=now() where id=p_actor;
 if not exists(select 1 from private.audit_events where actor_id=p_actor and action='account_content_redacted') then
  insert into private.audit_events(actor_id,action,target_id) values(p_actor,'account_content_redacted',p_actor::text);
 end if;
 return jsonb_build_object('status',profile.account_status,'redacted',true,'ready_to_delete_auth',true);
end $$;

create function public.sq_upsert_campaign(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; existing public.campaigns; c public.campaigns; sponsor public.sponsors; categories text[]; families text[];
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'upsert_campaign',p_key,p_hash); if cached is not null then return cached; end if;
 if jsonb_typeof(p_input->'categories') is distinct from 'array' or jsonb_typeof(p_input->'family_ids') is distinct from 'array' then raise exception 'invalid_campaign_scope'; end if;
 select array_agg(value) into categories from jsonb_array_elements_text(p_input->'categories');
 select array_agg(value) into families from jsonb_array_elements_text(p_input->'family_ids');
 if categories is null or families is null or exists(select 1 from unnest(families) family where not exists(select 1 from public.quest_templates where family_id=family and category=any(categories) and published)) then raise exception 'invalid_campaign_scope'; end if;
 if coalesce((p_input->>'funded')::boolean,false) and length(coalesce(p_input->>'funding_reference',''))<3 then raise exception 'funding_reference_required'; end if;
 select * into sponsor from public.sponsors where id=(p_input->>'sponsor_id')::uuid for share;
 if not found then raise exception 'sponsor_unavailable'; end if;
 if p_input->>'state'='active' and (not sponsor.approved or not coalesce((p_input->>'funded')::boolean,false)) then raise exception 'funding_required'; end if;
 if p_input->>'id' is not null then
  select * into existing from public.campaigns where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'not_found'; end if;
  if existing.sponsor_id<>sponsor.id then raise exception 'campaign_sponsor_immutable'; end if;
 end if;
 insert into public.campaigns(id,sponsor_id,version,title,disclosure,area,categories,family_ids,funded,state,starts_at,ends_at)
 values(coalesce(existing.id,gen_random_uuid()),sponsor.id,coalesce(existing.version,0)+1,p_input->>'title',p_input->>'disclosure',p_input->>'area',categories,families,coalesce((p_input->>'funded')::boolean,false),coalesce(p_input->>'state','draft'),(p_input->>'starts_at')::timestamptz,(p_input->>'ends_at')::timestamptz)
 on conflict(id) do update set version=excluded.version,title=excluded.title,disclosure=excluded.disclosure,area=excluded.area,categories=excluded.categories,family_ids=excluded.family_ids,funded=excluded.funded,state=excluded.state,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now() returning * into c;
 insert into private.campaign_operations(campaign_id,funding_reference,notes) values(c.id,coalesce(p_input->>'funding_reference',''),coalesce(p_input->>'notes','')) on conflict(campaign_id) do update set funding_reference=excluded.funding_reference,notes=excluded.notes;
 insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'campaign_updated',c.id::text,jsonb_build_object('version',c.version,'state',c.state));
 return private.end_request(p_actor,'upsert_campaign',p_key,to_jsonb(c));
end $$;
create function public.sq_pause_campaign(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; c public.campaigns;
begin
 if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'pause_campaign',p_key,p_hash); if cached is not null then return cached; end if;
 update public.campaigns set state='paused',version=version+1,updated_at=now() where id=(p_input->>'campaign_id')::uuid returning * into c;
 if not found then raise exception 'not_found'; end if;
 insert into private.audit_events(actor_id,action,target_id) values(p_actor,'campaign_paused',c.id::text);
 return private.end_request(p_actor,'pause_campaign',p_key,to_jsonb(c));
end $$;

-- RLS remains a second boundary even though same-origin API sends explicit DTOs.
do $$ declare t record; begin
 for t in select schemaname,tablename from pg_tables where (schemaname='public' and tablename=any(array['profiles','wallets','quest_templates','sponsors','campaigns','quest_runs','media_assets','render_jobs','render_outbox','reward_offers','redemptions','reward_ledger','share_links','media_cleanup'])) or (schemaname='private' and tablename=any(array['sponsor_operations','campaign_operations','offer_operations','redemption_secrets','role_memberships','audit_events','idempotency_records'])) loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on %I.%I from public, anon, authenticated',t.schemaname,t.tablename);
  execute format('grant select, insert, update, delete on %I.%I to service_role',t.schemaname,t.tablename);
 end loop;
end $$;
grant select on public.quest_templates,public.sponsors,public.campaigns,public.reward_offers to anon,authenticated;
create policy public_templates on public.quest_templates for select to anon,authenticated using(published);
create policy public_sponsors on public.sponsors for select to anon,authenticated using(approved);
create policy public_campaigns on public.campaigns for select to anon,authenticated using(state='active' and funded and starts_at<=now() and ends_at>now() and exists(select 1 from public.sponsors where id=sponsor_id and approved));
create policy public_offers on public.reward_offers for select to anon,authenticated using(active and funded and not is_demo and starts_at<=now() and ends_at>now() and exists(select 1 from public.sponsors where id=merchant_id and approved));
grant select on public.profiles,public.wallets,public.quest_runs,public.reward_ledger,public.redemptions,public.render_jobs to authenticated;
grant select(id,owner_id,run_id,kind,slot,generation,state,bytes,mime,duration_ms,metadata,is_current,created_at,sealed_at,deleted_at) on public.media_assets to authenticated;
grant select(id,owner_id,run_id,asset_id,caption,created_at,expires_at,revoked_at) on public.share_links to authenticated;
create policy own_profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) and account_status='active');
create policy own_profile_update on public.profiles for update to authenticated using(id=(select auth.uid()) and account_status='active') with check(id=(select auth.uid()) and account_status='active');
grant update(display_name,timezone,locale,preferences,imported_summary,onboarding_complete) on public.profiles to authenticated;
do $$ declare t text; begin
 foreach t in array array['wallets','quest_runs','reward_ledger','redemptions','render_jobs','media_assets','share_links'] loop
  execute format('create policy own_read on public.%I for select to authenticated using(owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=owner_id and p.account_status=''active''))',t);
 end loop;
end $$;
-- Enumerate exact signatures: no RPC or helper is executable by browser roles or PUBLIC.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'sq_%') or (n.nspname='private' and p.proname=any(array['content_hash','assert_actor','begin_request','end_request','is_operator','guard_immutable','build_manifest','enqueue_render','finalize_run','close_redemption'])) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant select on auth.users,auth.sessions to service_role;
