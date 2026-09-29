-- Community publication is separate from private journals and share links.
-- All reads use curated service-only DTOs; browser roles receive no table grants.
create table public.creator_profiles (
 user_id uuid primary key references public.profiles, display_name text not null check(length(display_name) between 1 and 60),
 avatar_key text not null check(avatar_key in ('coral','mint','violet','sunset')), bio text not null default '' check(length(bio)<=280),
 open_to_brands boolean not null default false, version int not null default 1 check(version>0), updated_at timestamptz not null default now()
);
create table public.community_posts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 run_id uuid not null references public.quest_runs, asset_id uuid not null unique references public.media_assets,
 template_id text not null references public.quest_templates, template_version int not null, caption text not null default '' check(length(caption)<=1000),
 brand_opt_in boolean not null default false, state text not null check(state in ('published','unpublished','removed')),
 version int not null default 1 check(version>0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index community_posts_feed on public.community_posts(state,created_at desc,id);
create index community_posts_owner on public.community_posts(owner_id,created_at desc);
create index community_posts_template on public.community_posts(template_id,created_at desc);
create table public.quest_drafts (
 id uuid primary key default gen_random_uuid(), author_id uuid not null references public.profiles,
 content jsonb not null check(jsonb_typeof(content)='object' and octet_length(content::text)<=24000),
 state text not null default 'draft' check(state in ('draft','submitted','approved','rejected')), version int not null default 1,
 review_notes text not null default '' check(length(review_notes)<=1500), template_id text references public.quest_templates,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index quest_drafts_author on public.quest_drafts(author_id);
create table public.quest_authors (
 template_id text primary key references public.quest_templates, author_id uuid not null references public.profiles,
 draft_id uuid not null unique references public.quest_drafts
);
create table public.business_profiles (
 user_id uuid primary key references public.profiles, name text not null check(length(name) between 2 and 100),
 website text not null check(length(website)<=400 and website like 'https://%'), contact_email text not null check(length(contact_email)<=254),
 state text not null default 'pending' check(state in ('pending','approved','rejected')), version int not null default 1,
 review_notes text not null default '' check(length(review_notes)<=1500), updated_at timestamptz not null default now()
);
create table public.licensing_offers (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.community_posts, asset_id uuid not null references public.media_assets,
 brand_id uuid not null references public.business_profiles(user_id), creator_id uuid not null references public.profiles,
 state text not null default 'proposed' check(state in ('proposed','countered','pending_fulfillment','completed','declined','canceled')),
 suspended boolean not null default false, moderation_reason text check(length(moderation_reason)<=1000),
 version int not null default 1, proposer_id uuid not null references public.profiles, terms jsonb not null,
 accepted_terms jsonb, accepted_at timestamptz, accepted_by uuid references public.profiles, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(brand_id<>creator_id), check((accepted_terms is null)=(accepted_at is null)), check((accepted_terms is null)=(accepted_by is null)), check(accepted_by is null or (accepted_by<>proposer_id and accepted_by in (creator_id,brand_id))),
 check((state in ('pending_fulfillment','completed'))=(accepted_terms is not null))
);
create unique index one_open_licensing_offer on public.licensing_offers(post_id,brand_id) where state in ('proposed','countered','pending_fulfillment');
create index licensing_creator on public.licensing_offers(creator_id,created_at desc);
create index licensing_brand on public.licensing_offers(brand_id,created_at desc);
create table private.licensing_revisions (
 offer_id uuid not null references public.licensing_offers, version int not null, proposer_id uuid not null references public.profiles,
 terms jsonb not null, created_at timestamptz not null default now(), primary key(offer_id,version)
);
create table private.licensing_fulfillments (
 offer_id uuid primary key references public.licensing_offers, operator_id uuid not null references public.profiles,
 payment_reference text not null check(length(payment_reference) between 3 and 300), permission_reference text not null check(length(permission_reference) between 3 and 300),
 usage_starts_at timestamptz not null, usage_ends_at timestamptz not null, completed_at timestamptz not null default now(), check(usage_ends_at>usage_starts_at)
);
create table public.community_activity (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles, actor_id uuid not null references public.profiles,
 kind text not null, target_id text not null, message text not null, href text not null, read_at timestamptz, created_at timestamptz not null default now(),
 unique(owner_id,kind,target_id)
);
create index community_activity_owner on public.community_activity(owner_id,created_at desc);
create table public.community_blocks (
 owner_id uuid not null references public.profiles, blocked_id uuid not null references public.profiles,
 created_at timestamptz not null default now(), primary key(owner_id,blocked_id), check(owner_id<>blocked_id)
);
create table public.community_reports (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles,
 post_id uuid references public.community_posts, offer_id uuid references public.licensing_offers,
 reason text not null check(length(reason) between 3 and 1000), created_at timestamptz not null default now(), check(num_nonnulls(post_id,offer_id)=1)
);
create table public.quest_inspirations (
 run_id uuid primary key references public.quest_runs, post_id uuid not null references public.community_posts,
 template_id text not null references public.quest_templates, template_version int not null, created_at timestamptz not null default now()
);
create index quest_inspirations_post on public.quest_inspirations(post_id);

create function private.community_blocked(a uuid,b uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.community_blocks where (owner_id=a and blocked_id=b) or (owner_id=b and blocked_id=a))
$$;
create function private.community_available(p_id uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.community_posts p join public.profiles u on u.id=p.owner_id join public.media_assets a on a.id=p.asset_id
 where p.id=p_id and p.state='published' and u.account_status='active' and a.kind='reel' and a.state='sealed' and a.deleted_at is null)
$$;
create function private.community_notify(p_owner uuid,p_actor uuid,p_kind text,p_target text,p_message text,p_href text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_owner<>p_actor and not private.community_blocked(p_owner,p_actor) and exists(select 1 from public.profiles where id=p_owner and account_status='active') then
 insert into public.community_activity(owner_id,actor_id,kind,target_id,message,href) values(p_owner,p_actor,p_kind,p_target,p_message,p_href) on conflict do nothing;
 end if;
end $$;
create function private.community_creator(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.user_id,'displayName',c.display_name,'avatarKey',c.avatar_key,'bio',c.bio,'openToBrands',c.open_to_brands,'version',c.version,
 'publishedCount',(select count(*) from public.community_posts p where p.owner_id=c.user_id and private.community_available(p.id)),
 'attemptCount',(select count(*) from public.quest_inspirations i join public.community_posts p on p.id=i.post_id where p.owner_id=c.user_id),
 'authoredCount',(select count(*) from public.quest_authors a join public.quest_templates t on t.id=a.template_id where a.author_id=c.user_id and t.published))
 from public.creator_profiles c join public.profiles u on u.id=c.user_id where c.user_id=p_id and u.account_status='active'
$$;
create function private.community_post(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'creator',private.community_creator(p.owner_id),'quest',r.snapshot->'template','questAuthor',private.community_creator(qa.author_id),
 'caption',p.caption,'brandOptIn',p.brand_opt_in,'state',p.state,'version',p.version,'createdAt',p.created_at,
 'attemptCount',(select count(*) from public.quest_inspirations i where i.post_id=p.id),
 'mediaUrl','/api/community/posts/'||p.id||'/media','thumbnailUrl','/api/community/posts/'||p.id||'/media?thumbnail=1',
 'sponsorDisclosure',r.snapshot->>'sponsorDisclosure','inspiredByPostId',(select i.post_id from public.quest_inspirations i where i.run_id=p.run_id))
 from public.community_posts p join public.quest_runs r on r.id=p.run_id left join public.quest_authors qa on qa.template_id=p.template_id where p.id=p_id
$$;
create function private.community_draft(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',d.id,'authorId',d.author_id,'state',d.state,'version',d.version,'quest',d.content,'reviewNotes',d.review_notes,'templateId',d.template_id,'createdAt',d.created_at) from public.quest_drafts d where d.id=p_id
$$;
create function private.community_brand(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',b.user_id,'name',b.name,'website',b.website,'contactEmail',b.contact_email,'state',b.state,'version',b.version,'reviewNotes',b.review_notes) from public.business_profiles b where b.user_id=p_id
$$;
create function private.community_offer(p_id uuid,p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',o.id,'postId',o.post_id,'assetId',o.asset_id,'brandId',o.brand_id,'creatorId',o.creator_id,'brandName',b.name,
 'creatorName',coalesce(c.display_name,'Former creator'),'postTitle',r.snapshot->'template'->>'title','state',o.state,'version',o.version,'proposerId',o.proposer_id,
 'suspended',o.suspended,'moderationReason',o.moderation_reason,'terms',o.terms,'acceptedTerms',o.accepted_terms,'acceptedAt',o.accepted_at,'createdAt',o.created_at,
 'history',coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'proposerId',h.proposer_id,'terms',h.terms,'createdAt',h.created_at) order by h.version) from private.licensing_revisions h where h.offer_id=o.id),'[]'::jsonb),
 'fulfillment',(select jsonb_build_object('paymentReference',f.payment_reference,'permissionReference',f.permission_reference,'usageStartsAt',f.usage_starts_at,'usageEndsAt',f.usage_ends_at,'completedAt',f.completed_at) from private.licensing_fulfillments f where f.offer_id=o.id),
 'mediaUrl',case when o.state='completed' and not o.suspended and o.brand_id=p_actor and b.state='approved' and exists(select 1 from private.licensing_fulfillments f where f.offer_id=o.id and now()>=f.usage_starts_at and now()<f.usage_ends_at) then '/api/community/offers/'||o.id||'/media' else null end)
 from public.licensing_offers o join public.business_profiles b on b.user_id=o.brand_id join public.community_posts p on p.id=o.post_id join public.quest_runs r on r.id=p.run_id left join public.creator_profiles c on c.user_id=o.creator_id where o.id=p_id
$$;
create function private.community_activity_json(p_actor uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'text',a.message,'href',a.href,'readAt',a.read_at,'createdAt',a.created_at) order by a.created_at desc),'[]'::jsonb)
 from (select * from public.community_activity where owner_id=p_actor and not private.community_blocked(owner_id,actor_id) order by created_at desc limit 100) a
$$;
create function private.community_valid_terms(t jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
begin
 return jsonb_typeof(t)='object' and (t->>'paymentMinor')::bigint between 1 and 100000000 and t->>'currency'='USD'
 and (t->>'platformFeeMinor')::bigint between 0 and (t->>'paymentMinor')::bigint and (t->>'durationDays')::int between 1 and 730
 and t->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$' and (t->>'startDate')::date is not null
 and t->>'editingPermissions' in ('none','crop_captions','agreed_edits') and length(t->>'message')<=1500
 and jsonb_typeof(t->'channels')='array' and jsonb_array_length(t->'channels') between 1 and 5
 and not exists(select 1 from jsonb_array_elements_text(t->'channels') c where c not in ('brand_social','paid_social','website','email','broadcast'));
 exception when others then return false;
end $$;
alter table public.licensing_offers add constraint valid_licensing_terms check(private.community_valid_terms(terms) is true);

create function public.sq_community_read(p_actor uuid,p_view text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; target uuid:=(p_input->>'id')::uuid; page_limit int:=least(50,greatest(1,coalesce((p_input->>'limit')::int,30)));
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if p_view not in ('feed','post','creator') and p_actor is null then raise exception 'forbidden'; end if;
 if p_view='feed' then
  select jsonb_build_object('posts',coalesce(jsonb_agg(private.community_post(x.id) order by x.created_at desc,x.id),'[]'::jsonb),'nextCursor',case when count(*)=page_limit then min(x.created_at) else null end) into result
  from (select p.id,p.created_at from public.community_posts p join public.creator_profiles c on c.user_id=p.owner_id
   where private.community_available(p.id) and not private.community_blocked(p_actor,p.owner_id)
   and (p_input->>'templateId' is null or p.template_id=p_input->>'templateId')
   and (not coalesce((p_input->>'brandOnly')::boolean,false) or (p.brand_opt_in and c.open_to_brands))
   and (p_input->>'before' is null or p.created_at<(p_input->>'before')::timestamptz)
   order by p.created_at desc,p.id limit page_limit) x;
  return result;
 elsif p_view='post' then
  if not exists(select 1 from public.community_posts p where p.id=target and (p.owner_id=p_actor or (private.community_available(p.id) and not private.community_blocked(p_actor,p.owner_id)))) then raise exception 'not_found'; end if;
  return private.community_post(target);
 elsif p_view='creator' then
  result:=private.community_creator(target);
  if result is null or private.community_blocked(p_actor,target) then raise exception 'not_found'; end if;
  return jsonb_build_object('creator',result,'posts',coalesce((select jsonb_agg(private.community_post(p.id) order by p.created_at desc) from public.community_posts p where p.owner_id=target and private.community_available(p.id)),'[]'::jsonb),
  'quests',coalesce((select jsonb_agg(t.content) from public.quest_authors a join public.quest_templates t on t.id=a.template_id where a.author_id=target and t.published),'[]'::jsonb));
 elsif p_view='activity' then
  return jsonb_build_object('items',private.community_activity_json(p_actor),'unreadCount',(select count(*) from public.community_activity where owner_id=p_actor and read_at is null and not private.community_blocked(owner_id,actor_id)));
 elsif p_view='offers' then
  return jsonb_build_object('offers',coalesce((select jsonb_agg(private.community_offer(o.id,p_actor) order by o.created_at desc) from public.licensing_offers o where p_actor in (o.creator_id,o.brand_id)),'[]'::jsonb));
 elsif p_view='offer' then
  if not exists(select 1 from public.licensing_offers where id=target and (p_actor in (creator_id,brand_id) or private.is_operator(p_actor))) then raise exception 'not_found'; end if;
  return private.community_offer(target,p_actor);
 elsif p_view='draft' then
  if not exists(select 1 from public.quest_drafts where id=target and (author_id=p_actor or private.is_operator(p_actor))) then raise exception 'not_found'; end if;
  return private.community_draft(target);
 elsif p_view='brand' then
  return jsonb_build_object('brand',private.community_brand(p_actor),'posts',public.sq_community_read(p_actor,'feed','{"brandOnly":true}'::jsonb)->'posts');
 elsif p_view='me' then
  return jsonb_build_object('userId',p_actor,'roles',case when private.is_operator(p_actor) then '["operator"]'::jsonb else '[]'::jsonb end,
   'publications',coalesce((select jsonb_agg(jsonb_build_object('runId',p.run_id,'postId',p.id)) from public.community_posts p where p.owner_id=p_actor),'[]'::jsonb),
   'creator',private.community_creator(p_actor),'posts',coalesce((select jsonb_agg(private.community_post(p.id) order by p.created_at desc) from public.community_posts p where p.owner_id=p_actor),'[]'::jsonb),
   'drafts',coalesce((select jsonb_agg(private.community_draft(d.id) order by d.created_at desc) from public.quest_drafts d where d.author_id=p_actor),'[]'::jsonb),
   'brand',private.community_brand(p_actor),'offers',public.sq_community_read(p_actor,'offers','{}')->'offers','activity',private.community_activity_json(p_actor),
   'blocks',coalesce((select jsonb_agg(blocked_id) from public.community_blocks where owner_id=p_actor),'[]'::jsonb));
 elsif p_view='operator' then
  if not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
  return jsonb_build_object('drafts',coalesce((select jsonb_agg(private.community_draft(d.id) order by d.created_at) from public.quest_drafts d where d.state='submitted'),'[]'::jsonb),
   'businesses',coalesce((select jsonb_agg(private.community_brand(b.user_id)) from public.business_profiles b),'[]'::jsonb),
   'offers',coalesce((select jsonb_agg(private.community_offer(o.id,p_actor) order by o.created_at desc) from public.licensing_offers o),'[]'::jsonb),
   'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reporterId',r.reporter_id,'postId',r.post_id,'offerId',r.offer_id,'reason',r.reason,'createdAt',r.created_at) order by r.created_at desc) from public.community_reports r),'[]'::jsonb));
 end if;
 raise exception 'not_found';
end $$;

create function public.sq_community_mutate(p_actor uuid,p_action text,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; result jsonb; target uuid:=(p_input->>'id')::uuid; expected int:=(p_input->>'expectedVersion')::int;
 c public.creator_profiles; p public.community_posts; d public.quest_drafts; b public.business_profiles; o public.licensing_offers; r public.quest_runs; a public.media_assets;
 content jsonb; family text; template text; other_party uuid; new_id uuid; f private.licensing_fulfillments;
begin
 if p_action in ('draft_review','brand_review','offer_fulfill','post_moderate','offer_moderate') and not private.is_operator(p_actor) then raise exception 'forbidden'; end if;
 cached:=private.begin_request(p_actor,'community_'||p_action,p_key,p_hash); if cached is not null then return cached; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,7001));
 if p_action='creator_save' then
  select * into c from public.creator_profiles where user_id=p_actor for update;
  if coalesce(c.version,0) is distinct from expected then raise exception 'stale_version'; end if;
  insert into public.creator_profiles(user_id,display_name,avatar_key,bio,open_to_brands,version)
  values(p_actor,p_input->>'displayName',p_input->>'avatarKey',p_input->>'bio',(p_input->>'openToBrands')::boolean,coalesce(c.version,0)+1)
  on conflict(user_id) do update set display_name=excluded.display_name,avatar_key=excluded.avatar_key,bio=excluded.bio,open_to_brands=excluded.open_to_brands,version=excluded.version,updated_at=now();
  result:=private.community_creator(p_actor);
 elsif p_action='post_publish' then
  if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
  select * into r from public.quest_runs where id=(p_input->>'runId')::uuid and owner_id=p_actor for share;
  if not found or r.status<>'finalized' or r.privacy_redacted_at is not null then raise exception 'reel_unavailable'; end if;
  select * into a from public.media_assets where id=(p_input->>'assetId')::uuid and run_id=r.id and owner_id=p_actor and kind='reel' and state='sealed' for share;
  if not found or not exists(select 1 from public.render_jobs where output_asset_id=a.id and status='ready') then raise exception 'reel_unavailable'; end if;
  select * into p from public.community_posts where asset_id=a.id;
  if p.id is not null then
   if p.owner_id<>p_actor then raise exception 'forbidden'; end if;
   result:=private.community_post(p.id);
  else
   insert into public.community_posts(owner_id,run_id,asset_id,template_id,template_version,caption,brand_opt_in,state)
   values(p_actor,r.id,a.id,r.template_id,(r.snapshot->>'version')::int,p_input->>'caption',(p_input->>'brandOptIn')::boolean,'published') returning * into p;
   result:=private.community_post(p.id);
  end if;
 elsif p_action='post_update' then
  select * into p from public.community_posts where id=target and owner_id=p_actor for update;
  if not found then raise exception 'not_found'; end if;
  if p.version is distinct from expected then raise exception 'stale_version'; end if;
  if p.state='removed' then raise exception 'post_removed'; end if;
  if coalesce((p_input->>'published')::boolean,false) and not exists(select 1 from public.media_assets where id=p.asset_id and state='sealed' and kind='reel') then raise exception 'reel_unavailable'; end if;
  update public.community_posts set caption=p_input->>'caption',brand_opt_in=(p_input->>'brandOptIn')::boolean,state=case when (p_input->>'published')::boolean then 'published' else 'unpublished' end,version=version+1,updated_at=now() where id=target;
  result:=private.community_post(target);
 elsif p_action='draft_save' then
  if not exists(select 1 from public.creator_profiles where user_id=p_actor) then raise exception 'creator_profile_required'; end if;
  if target is not null then
   select * into d from public.quest_drafts where id=target for update;
   if d.id is not null and d.author_id<>p_actor then raise exception 'not_found'; end if;
   if d.id is null and expected<>0 then raise exception 'not_found'; end if;
   if d.id is not null and d.state not in ('draft','rejected') then raise exception 'draft_locked'; end if;
  end if;
  if coalesce(d.version,0) is distinct from expected then raise exception 'stale_version'; end if;
  new_id:=coalesce(target,gen_random_uuid()); family:='original_'||translate(replace(new_id::text,'-',''),'0123456789abcdef','abcdefghijklmnop'); template:=family||'_v1';
  content:=((p_input->'quest')-'sponsorDisclosure')||jsonb_build_object('id',template,'familyId',family,'version',1);
  if content->>'intensity' not in ('chill','bold','full_send') or content->>'category' not in ('date_night','daytime','late_night','street_challenges','demon') or length(content->>'title') not between 1 and 100 or jsonb_array_length(content->'beats')<>3 then raise exception 'invalid_quest'; end if;
  content:=content||jsonb_build_object('award',jsonb_build_object('xp',case content->>'intensity' when 'chill' then 100 when 'bold' then 250 else 500 end,'points',case content->>'intensity' when 'chill' then 10 when 'bold' then 25 else 50 end),'cooldownDays',30);
  insert into public.quest_drafts(id,author_id,content,version) values(new_id,p_actor,content,coalesce(d.version,0)+1)
  on conflict(id) do update set content=excluded.content,state='draft',version=excluded.version,review_notes='',updated_at=now();
  result:=private.community_draft(new_id);
 elsif p_action in ('draft_submit','draft_review') then
  select * into d from public.quest_drafts where id=target for update;
  if not found or (p_action='draft_submit' and d.author_id<>p_actor) then raise exception 'not_found'; end if;
  if d.version is distinct from expected then raise exception 'stale_version'; end if;
  if p_action='draft_submit' then
   if d.state not in ('draft','rejected') then raise exception 'draft_locked'; end if;
   update public.quest_drafts set state='submitted',version=version+1,updated_at=now() where id=target;
  else
   if d.author_id=p_actor then raise exception 'self_review_forbidden'; end if;
   if d.state<>'submitted' then raise exception 'draft_locked'; end if;
   if p_input->>'decision'='approve' then
    content:=d.content; template:=content->>'id';
    insert into public.quest_templates(id,family_id,version,category,intensity,title,content,published) values(template,content->>'familyId',1,content->>'category',content->>'intensity',content->>'title',content,true);
    insert into public.quest_authors(template_id,author_id,draft_id) values(template,d.author_id,d.id);
    update public.quest_drafts set state='approved',template_id=template,review_notes=p_input->>'notes',version=version+1,updated_at=now() where id=target;
   elsif p_input->>'decision'='reject' then
    update public.quest_drafts set state='rejected',review_notes=p_input->>'notes',version=version+1,updated_at=now() where id=target;
   else raise exception 'invalid_decision'; end if;
   perform private.community_notify(d.author_id,p_actor,'quest_review',d.id::text||':'||(d.version+1),'Your original quest has a review update.','/originals/'||d.id);
  end if;
  result:=private.community_draft(target);
 elsif p_action='brand_save' then
  select * into b from public.business_profiles where user_id=p_actor for update;
  if coalesce(b.version,0) is distinct from expected then raise exception 'stale_version'; end if;
  insert into public.business_profiles(user_id,name,website,contact_email,state,version) values(p_actor,p_input->>'name',p_input->>'website',p_input->>'contactEmail','pending',coalesce(b.version,0)+1)
  on conflict(user_id) do update set name=excluded.name,website=excluded.website,contact_email=excluded.contact_email,state='pending',version=excluded.version,review_notes='',updated_at=now();
  result:=private.community_brand(p_actor);
 elsif p_action='brand_review' then
  select * into b from public.business_profiles where user_id=target for update;
  if not found then raise exception 'not_found'; end if;
  if b.user_id=p_actor then raise exception 'self_review_forbidden'; end if;
  if b.version is distinct from expected then raise exception 'stale_version'; end if;
  if p_input->>'decision' not in ('approve','reject') then raise exception 'invalid_decision'; end if;
  update public.business_profiles set state=case when p_input->>'decision'='approve' then 'approved' else 'rejected' end,review_notes=p_input->>'notes',version=version+1,updated_at=now() where user_id=target;
  perform private.community_notify(target,p_actor,'brand_review',target::text||':'||(b.version+1),'Your business profile has a verification update.','/studio');
  result:=private.community_brand(target);
 elsif p_action='offer_create' then
  select * into b from public.business_profiles where user_id=p_actor and state='approved' for share;
  if not found then raise exception 'brand_approval_required'; end if;
  select * into p from public.community_posts where id=(p_input->>'postId')::uuid for update;
  if not found or not private.community_available(p.id) or not p.brand_opt_in or not exists(select 1 from public.creator_profiles where user_id=p.owner_id and open_to_brands) then raise exception 'brand_inquiries_unavailable'; end if;
  if p.owner_id=p_actor or private.community_blocked(p.owner_id,p_actor) then raise exception 'forbidden'; end if;
  if private.community_valid_terms(p_input->'terms') is not true then raise exception 'invalid_terms'; end if;
  select * into o from public.licensing_offers where post_id=p.id and brand_id=p_actor and state in ('proposed','countered','pending_fulfillment') for update;
  if o.id is not null then
   if o.state='proposed' and o.terms=p_input->'terms' then result:=private.community_offer(o.id,p_actor);
   else raise exception 'active_offer_exists'; end if;
  else
   insert into public.licensing_offers(post_id,asset_id,brand_id,creator_id,proposer_id,terms) values(p.id,p.asset_id,p_actor,p.owner_id,p_actor,p_input->'terms') returning * into o;
   insert into private.licensing_revisions(offer_id,version,proposer_id,terms) values(o.id,o.version,p_actor,o.terms);
   perform private.community_notify(p.owner_id,p_actor,'licensing_offer',o.id::text,'A verified business requested to use your video.','/offers/'||o.id);
   result:=private.community_offer(o.id,p_actor);
  end if;
 elsif p_action='offer_respond' then
  select * into o from public.licensing_offers where id=target and p_actor in (creator_id,brand_id) for update;
  if not found then raise exception 'not_found'; end if;
  if o.version is distinct from expected then raise exception 'stale_version'; end if;
  if o.suspended then raise exception 'offer_suspended'; end if;
  if o.state not in ('proposed','countered') then raise exception 'offer_closed'; end if;
  other_party:=case when p_actor=o.creator_id then o.brand_id else o.creator_id end;
  if p_input->>'decision' in ('accept','counter') then
   if p_actor=o.proposer_id then raise exception 'other_party_required'; end if;
   if private.community_blocked(o.creator_id,o.brand_id) or not private.community_available(o.post_id) then raise exception 'offer_unavailable'; end if;
   if not exists(select 1 from public.business_profiles where user_id=o.brand_id and state='approved') then raise exception 'brand_approval_required'; end if;
   if p_input->>'decision'='accept' then
    update public.licensing_offers set state='pending_fulfillment',accepted_terms=terms,accepted_at=now(),accepted_by=p_actor,version=version+1,updated_at=now() where id=target;
   else
    if private.community_valid_terms(p_input->'terms') is not true then raise exception 'invalid_terms'; end if;
    update public.licensing_offers set state='countered',terms=p_input->'terms',proposer_id=p_actor,version=version+1,updated_at=now() where id=target;
    insert into private.licensing_revisions(offer_id,version,proposer_id,terms) values(target,o.version+1,p_actor,p_input->'terms');
   end if;
  elsif p_input->>'decision'='decline' then
   if p_actor=o.proposer_id then raise exception 'other_party_required'; end if;
   update public.licensing_offers set state='declined',version=version+1,updated_at=now() where id=target;
  elsif p_input->>'decision'='cancel' then
   if p_actor<>o.proposer_id then raise exception 'proposer_required'; end if;
   update public.licensing_offers set state='canceled',version=version+1,updated_at=now() where id=target;
  else raise exception 'invalid_decision'; end if;
  perform private.community_notify(other_party,p_actor,'licensing_update',target::text||':'||(o.version+1),'Your video licensing offer has an update.','/offers/'||target);
  result:=private.community_offer(target,p_actor);
 elsif p_action='offer_fulfill' then
  select * into o from public.licensing_offers where id=target for update;
  if not found then raise exception 'not_found'; end if;
  if o.version is distinct from expected then raise exception 'stale_version'; end if;
  if p_actor in (o.creator_id,o.brand_id) then raise exception 'self_review_forbidden'; end if;
  if o.suspended then raise exception 'offer_suspended'; end if;
  if o.state<>'pending_fulfillment' then raise exception 'offer_closed'; end if;
  if (p_input->>'paid')::boolean is not true or (p_input->>'permissionsConfirmed')::boolean is not true then raise exception 'fulfillment_evidence_required'; end if;
  if not exists(select 1 from public.business_profiles where user_id=o.brand_id and state='approved') then raise exception 'brand_approval_required'; end if;
  insert into private.licensing_fulfillments(offer_id,operator_id,payment_reference,permission_reference,usage_starts_at,usage_ends_at)
  values(target,p_actor,p_input->>'paymentReference',p_input->>'permissionReference',(o.accepted_terms->>'startDate')::date::timestamp at time zone 'UTC',((o.accepted_terms->>'startDate')::date+(o.accepted_terms->>'durationDays')::int)::timestamp at time zone 'UTC') returning * into f;
  update public.licensing_offers set state='completed',version=version+1,updated_at=now() where id=target;
  perform private.community_notify(o.creator_id,p_actor,'licensing_fulfilled',target::text,'Manual payment and usage permission have been verified.','/offers/'||target);
  perform private.community_notify(o.brand_id,p_actor,'licensing_fulfilled',target::text,'Manual fulfillment is verified. Access follows the agreed usage period.','/offers/'||target);
  result:=private.community_offer(target,p_actor);
 elsif p_action='activity_read' then
  update public.community_activity set read_at=coalesce(read_at,now()) where id=target and owner_id=p_actor;
  if not found then raise exception 'not_found'; end if;
  result:=jsonb_build_object('ok',true);
 elsif p_action='block' then
  target:=(p_input->>'userId')::uuid;
  if target=p_actor or not exists(select 1 from public.profiles where id=target) then raise exception 'not_found'; end if;
  if (p_input->>'blocked')::boolean then insert into public.community_blocks(owner_id,blocked_id) values(p_actor,target) on conflict do nothing;
  else delete from public.community_blocks where owner_id=p_actor and blocked_id=target; end if;
  result:=jsonb_build_object('ok',true);
 elsif p_action='report' then
  if p_input->>'postId' is not null then
   if not private.community_available((p_input->>'postId')::uuid) then raise exception 'not_found'; end if;
  elsif not exists(select 1 from public.licensing_offers where id=(p_input->>'offerId')::uuid and p_actor in (creator_id,brand_id)) then raise exception 'not_found'; end if;
  insert into public.community_reports(reporter_id,post_id,offer_id,reason) values(p_actor,(p_input->>'postId')::uuid,(p_input->>'offerId')::uuid,p_input->>'reason') returning id into new_id;
  result:=jsonb_build_object('id',new_id);
 elsif p_action='offer_moderate' then
  select * into o from public.licensing_offers where id=target for update;
  if not found then raise exception 'not_found'; end if;
  if o.version is distinct from expected then raise exception 'stale_version'; end if;
  update public.licensing_offers set suspended=true,moderation_reason=p_input->>'reason',version=version+1,updated_at=now() where id=target;
  insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'licensing_offer_suspended',target::text,jsonb_build_object('reason',p_input->>'reason'));
  perform private.community_notify(o.creator_id,p_actor,'licensing_moderated',target::text,'An operator suspended this commercial request.','/offers/'||target);
  perform private.community_notify(o.brand_id,p_actor,'licensing_moderated',target::text,'An operator suspended this commercial request.','/offers/'||target);
  result:=private.community_offer(target,p_actor);
 elsif p_action='post_moderate' then
  select * into p from public.community_posts where id=target for update;
  if not found then raise exception 'not_found'; end if;
  if p.version is distinct from expected then raise exception 'stale_version'; end if;
  update public.community_posts set state='removed',brand_opt_in=false,version=version+1,updated_at=now() where id=target;
  insert into private.audit_events(actor_id,action,target_id,details) values(p_actor,'community_post_removed',target::text,jsonb_build_object('reason',p_input->>'reason'));
  perform private.community_notify(p.owner_id,p_actor,'post_moderated',target::text||':'||(p.version+1),'An operator unpublished your post. Your private original remains in your journal.','/profile');
  result:=private.community_post(target);
 else raise exception 'not_found'; end if;
 return private.end_request(p_actor,'community_'||p_action,p_key,result);
end $$;

create function public.sq_community_media(p_actor uuid,p_post uuid,p_offer uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare asset uuid; owner uuid; result jsonb;
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if num_nonnulls(p_post,p_offer)<>1 then raise exception 'not_found'; end if;
 if p_post is not null then
  select p.asset_id,p.owner_id into asset,owner from public.community_posts p where p.id=p_post;
  if not found or (owner is distinct from p_actor and (not private.community_available(p_post) or private.community_blocked(owner,p_actor))) then raise exception 'not_found'; end if;
 else
  select o.asset_id,o.creator_id into asset,owner from public.licensing_offers o
  join public.business_profiles b on b.user_id=o.brand_id join private.licensing_fulfillments f on f.offer_id=o.id
  where o.id=p_offer and o.brand_id=p_actor and b.state='approved' and o.state='completed' and not o.suspended and now()>=f.usage_starts_at and now()<f.usage_ends_at;
  if not found then raise exception 'commercial_access_unavailable'; end if;
 end if;
 select jsonb_build_object('object_key',a.object_key,'mime',a.mime,'bytes',a.bytes,'thumbnail_key',a.metadata->>'thumbnail_key') into result
 from public.media_assets a join public.profiles u on u.id=a.owner_id where a.id=asset and a.owner_id=owner and a.kind='reel' and a.state='sealed' and a.deleted_at is null and u.account_status='active';
 if result is null then raise exception 'not_found'; end if;
 return result;
end $$;

create function private.community_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name in ('licensing_revisions','licensing_fulfillments','quest_inspirations') then raise exception 'commercial_history_immutable'; end if;
 if tg_table_name='licensing_offers' then
  if (new.id,new.post_id,new.asset_id,new.brand_id,new.creator_id,new.created_at) is distinct from (old.id,old.post_id,old.asset_id,old.brand_id,old.creator_id,old.created_at) then raise exception 'offer_identity_immutable'; end if;
  if old.accepted_terms is not null and (new.accepted_terms,new.accepted_at,new.accepted_by,new.terms,new.proposer_id) is distinct from (old.accepted_terms,old.accepted_at,old.accepted_by,old.terms,old.proposer_id) then raise exception 'accepted_terms_immutable'; end if;
 end if;
 if tg_table_name='community_posts' then
  if (new.id,new.owner_id,new.run_id,new.asset_id,new.template_id,new.template_version,new.created_at) is distinct from (old.id,old.owner_id,old.run_id,old.asset_id,old.template_id,old.template_version,old.created_at) then raise exception 'post_asset_immutable'; end if;
 end if;
 return new;
end $$;
create trigger licensing_revision_immutable before update or delete on private.licensing_revisions for each row execute function private.community_immutable();
create trigger licensing_fulfillment_immutable before update or delete on private.licensing_fulfillments for each row execute function private.community_immutable();
create trigger licensing_offer_immutable before update on public.licensing_offers for each row execute function private.community_immutable();
create trigger post_asset_immutable before update on public.community_posts for each row execute function private.community_immutable();
create trigger inspiration_immutable before update or delete on public.quest_inspirations for each row execute function private.community_immutable();

-- Account deletion removes creator content and public discoverability immediately.
-- Licensing agreement/fulfillment facts remain scoped to their parties/operators.
create function private.community_account_cleanup() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.account_status in ('deleting','deleted') and old.account_status not in ('deleting','deleted') then
  update public.creator_profiles set display_name='Former creator',bio='',open_to_brands=false,version=version+1 where user_id=new.id;
  update public.community_posts set state='removed',caption='',brand_opt_in=false,version=version+1 where owner_id=new.id;
  update public.quest_templates set published=false where id in(select template_id from public.quest_authors where author_id=new.id);
  update public.quest_drafts set content='{}',review_notes='' where author_id=new.id;
  update public.business_profiles set state='rejected',contact_email='',review_notes='',version=version+1 where user_id=new.id;
  update public.licensing_offers set suspended=true,moderation_reason='An account is unavailable.',version=version+1 where creator_id=new.id or brand_id=new.id;
  delete from public.community_activity where owner_id=new.id or actor_id=new.id;
  delete from public.community_blocks where owner_id=new.id or blocked_id=new.id;
  delete from public.community_reports where reporter_id=new.id;
 end if;
 return new;
end $$;
create trigger community_account_cleanup after update of account_status on public.profiles for each row execute function private.community_account_cleanup();

-- Preserve service-only permissions and RLS on every new table/helper.
do $$ declare t record; f record; begin
 for t in select schemaname,tablename from pg_tables where (schemaname='public' and tablename=any(array['creator_profiles','community_posts','quest_drafts','quest_authors','business_profiles','licensing_offers','community_activity','community_blocks','community_reports','quest_inspirations'])) or (schemaname='private' and tablename=any(array['licensing_revisions','licensing_fulfillments'])) loop
  execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
  execute format('revoke all on %I.%I from public,anon,authenticated',t.schemaname,t.tablename);
  execute format('grant select,insert,update,delete on %I.%I to service_role',t.schemaname,t.tablename);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname like 'sq_community_%') or (n.nspname='private' and p.proname like 'community_%') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Inspiration is an explicit link, never inherited outing settings or evidence.
create or replace function public.sq_accept_run(p_actor uuid,p_input jsonb,p_key text,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cached jsonb; t public.quest_templates; r public.quest_runs; snap jsonb; result jsonb; campaign public.campaigns; sponsor_name text; inspiration public.community_posts;
begin
 cached:=private.begin_request(p_actor,'accept_run',p_key,p_hash); if cached is not null then return cached; end if;
 perform 1 from public.wallets where owner_id=p_actor for update;
 select * into t from public.quest_templates where id=p_input->>'template_id' and published for share;
 if not found then raise exception 'template_unavailable'; end if;
 if p_input->>'inspired_by_post' is not null then
  select * into inspiration from public.community_posts where id=(p_input->>'inspired_by_post')::uuid for share;
  if not found or not private.community_available(inspiration.id) or private.community_blocked(p_actor,inspiration.owner_id) then raise exception 'inspiration_unavailable'; end if;
  if inspiration.template_id<>t.id or inspiration.template_version<>t.version then raise exception 'inspiration_quest_mismatch'; end if;
 end if;
 if exists(select 1 from public.quest_runs where owner_id=p_actor and status in ('accepted','in_progress')) then raise exception 'active_run_exists'; end if;
 if jsonb_typeof(p_input->'outing')<>'object' then raise exception 'invalid_outing'; end if;
 snap:=jsonb_build_object('template',t.content,'template_id',t.id,'version',t.version,'family_id',t.family_id,'intensity',t.intensity,'category',t.category,'title',t.title,'role',case when p_input->'outing' ? 'role' then p_input->'outing'->>'role' else p_input->>'role' end,
 'reward_policy',jsonb_build_object('version',1,'xp',case t.intensity when 'chill' then 100 when 'bold' then 250 else 500 end,'points',case t.intensity when 'chill' then 10 when 'bold' then 25 else 50 end,'daily_cap',3,'family_cooldown_days',30));
 if inspiration.id is not null then snap:=snap||jsonb_build_object('inspiredByPostId',inspiration.id); end if;
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
 if inspiration.id is not null then
  insert into public.quest_inspirations(run_id,post_id,template_id,template_version) values(r.id,inspiration.id,t.id,t.version);
  perform private.community_notify(inspiration.owner_id,p_actor,'inspired_attempt',r.id::text,'Someone started their own version of your quest.','/posts/'||inspiration.id);
 end if;
 result:=jsonb_build_object('run',to_jsonb(r),'eligibility',public.sq_eligibility(p_actor,t.family_id));
 return private.end_request(p_actor,'accept_run',p_key,result);
end $$;
