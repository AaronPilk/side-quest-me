-- Preserve the service-only, security-invoker API and existing visibility checks.
-- Existing timestamp-only before inputs remain supported; new output includes ID.
create or replace function public.sq_community_read(p_actor uuid,p_view text,p_input jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; target uuid:=(p_input->>'id')::uuid; page_limit int:=least(50,greatest(1,coalesce((p_input->>'limit')::int,30)));
begin
 if p_actor is not null then perform private.assert_actor(p_actor); end if;
 if p_view not in ('feed','post','creator') and p_actor is null then raise exception 'forbidden'; end if;
 if p_view='feed' then
  -- Read one extra row to distinguish an exact final page from another page.
  -- Timestamp + ID is a stable keyset cursor, including equal timestamps.
  with candidates as materialized (
   select p.id,p.created_at from public.community_posts p join public.creator_profiles c on c.user_id=p.owner_id
   where private.community_available(p.id) and not private.community_blocked(p_actor,p.owner_id)
   and (p_input->>'templateId' is null or p.template_id=p_input->>'templateId')
   and (not coalesce((p_input->>'brandOnly')::boolean,false) or (p.brand_opt_in and c.open_to_brands))
   and (p_input->>'before' is null
     or p.created_at<split_part(p_input->>'before','|',1)::timestamptz
     or (p.created_at=split_part(p_input->>'before','|',1)::timestamptz
       and p.id>nullif(split_part(p_input->>'before','|',2),'')::uuid))
   order by p.created_at desc,p.id limit page_limit+1
  ), page as (
   select * from candidates order by created_at desc,id limit page_limit
  )
  select jsonb_build_object(
   'posts',coalesce((select jsonb_agg(private.community_post(x.id) order by x.created_at desc,x.id) from page x),'[]'::jsonb),
   'nextCursor',case when (select count(*) from candidates)>page_limit then
     (select (to_jsonb(x.created_at)#>>'{}')||'|'||x.id::text from page x order by x.created_at,x.id desc limit 1)
     else null end) into result;
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
