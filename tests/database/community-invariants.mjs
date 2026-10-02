import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

export async function runCommunityTests(sql) {
  const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
  const hash = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const rpc = (name, actor, input = {}, key = randomUUID()) =>
    sql(
      `select public.${name}(${q(actor)},${j(input)},${q(key)},${q(hash(input))});`,
    ).then(JSON.parse);
  const mutate = (actor, action, input, key = randomUUID()) =>
    sql(
      `select sq_community_mutate(${q(actor)},${q(action)},${j(input)},${q(key)},${q(hash({ action, input }))});`,
    ).then(JSON.parse);
  const read = (actor, view, input = {}) =>
    sql(
      `select sq_community_read(${actor ? q(actor) : "null"},${q(view)},${j(input)});`,
    ).then(JSON.parse);
  const media = (actor, post = null, offer = null) =>
    sql(
      `select sq_community_media(${actor ? q(actor) : "null"},${post ? q(post) : "null"},${offer ? q(offer) : "null"});`,
    ).then(JSON.parse);
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
    return id;
  };
  const [creator, viewer, brand, outsider, operator] = await Promise.all(
    Array.from({ length: 5 }, user),
  );
  await sql(
    `insert into private.role_memberships(user_id,role) values(${q(operator)},'operator');`,
  );
  await sql(
    `select sq_upsert_profile(${q(creator)},${j({ imported_summary: "PRIVATE_SUMMARY_NEVER_PUBLIC", preferences: { secret: "PRIVATE_ANSWER_NEVER_PUBLIC" } })});`,
  );
  const template = JSON.parse(
    await sql(
      "select content from quest_templates where family_id='day_secret_expert' and intensity='chill' limit 1;",
    ),
  );
  const baseOuting = {
    role: null,
    participants: 4,
    budgetMinor: 5000,
    budgetScope: "total",
    currency: "USD",
    area: "PRECISE_PRIVATE_LOCATION",
  };
  const { run } = await rpc("sq_accept_run", creator, {
    template_id: template.id,
    outing: baseOuting,
  });
  const clips = [];
  for (let slot = 1; slot <= 3; slot++) {
    const asset = await rpc("sq_reserve_upload", creator, {
      run_id: run.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", creator, {
      asset_id: asset.id,
      object_key: `sealed/${creator}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: 10000,
      sha256: hash(asset.id),
      metadata: { width: 720, height: 1280 },
    });
    clips.push({ asset_id: asset.id, start_ms: 0, end_ms: 8000 });
  }
  const complete = await rpc("sq_submit_run", creator, {
    run_id: run.id,
    clips,
    declaration: { attempted: true, consent: true },
    needs_review: false,
  });
  const lease = JSON.parse(
    await sql(`select sq_claim_render(${q(complete.render_job.id)});`),
  );
  const ready = JSON.parse(
    await sql(
      `select sq_finish_render(${q(lease.id)},${lease.fence},${j({ object_key: `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`, bytes: 4000, mime: "video/mp4", duration_ms: 24000, sha256: hash(lease.id), metadata: { thumbnail_key: `PRIVATE_THUMB/${lease.id}.jpg` } })});`,
    ),
  );
  assert.equal(
    (await read(null, "feed")).posts.length,
    0,
    "A finished private reel is never auto-published",
  );
  console.log(
    "Checking explicit publication, narrow public DTOs, ownership, and inspiration…",
  );
  const publishInput = {
    runId: run.id,
    assetId: ready.output_asset_id,
    caption: "Make your version",
    brandOptIn: true,
  };
  await assert.rejects(
    () => mutate(creator, "post_publish", publishInput),
    /creator_profile_required/,
  );
  const cp = await mutate(creator, "creator_save", {
    displayName: "Creator",
    avatarKey: "coral",
    bio: "A public bio",
    openToBrands: true,
    expectedVersion: 0,
  });
  assert.equal(cp.version, 1);
  await mutate(viewer, "creator_save", {
    displayName: "Viewer",
    avatarKey: "mint",
    bio: "",
    openToBrands: false,
    expectedVersion: 0,
  });
  let [post, duplicatePost] = await Promise.all([
    mutate(creator, "post_publish", publishInput),
    mutate(creator, "post_publish", publishInput),
  ]);
  assert.equal(post.id, duplicatePost.id);
  assert.equal(post.state, "pending");
  const review = (
    actor,
    item,
    decision = "approve",
    extra = {},
    key = randomUUID(),
  ) =>
    mutate(
      actor,
      "post_review",
      {
        id: item.id,
        expectedVersion: item.version,
        decision,
        reviewedContent: true,
        notes: "Entire video, audio, caption and quest instructions reviewed.",
        ...extra,
      },
      key,
    );
  const reviewMedia = (actor) =>
    sql(`select sq_community_review_media(${q(actor)},${q(post.id)});`).then(
      JSON.parse,
    );
  const originalBeforeReview = await sql(
    `select jsonb_build_object('run',(select to_jsonb(r) from quest_runs r where id=${q(run.id)}),'assets',(select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(run.id)}),'wallet',(select to_jsonb(w) from wallets w where owner_id=${q(creator)}),'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(run.id)}));`,
  );
  assert.equal((await read(null, "feed")).posts.length, 0);
  await assert.rejects(
    () => read(viewer, "post", { id: post.id }),
    /not_found/,
  );
  await assert.rejects(() => media(null, post.id), /not_found/);
  await assert.rejects(() => media(viewer, post.id), /not_found/);
  assert.equal((await media(creator, post.id)).mime, "video/mp4");
  assert.equal((await read(creator, "me")).posts[0].state, "pending");
  const queued = (await read(operator, "operator")).reviewPosts;
  assert.equal(queued.length, 1);
  assert.match(queued[0].mediaUrl, /\/api\/community\/reviews\/[^/]+\/media$/);
  assert.equal((await reviewMedia(operator)).mime, "video/mp4");
  await assert.rejects(() => reviewMedia(viewer), /forbidden/);
  await assert.rejects(() => reviewMedia(creator), /forbidden/);
  await assert.rejects(() => review(viewer, post), /forbidden/);
  await sql(
    `insert into private.role_memberships(user_id,role) values(${q(creator)},'operator');`,
  );
  await assert.rejects(() => review(creator, post), /self_review_forbidden/);
  await sql(
    `delete from private.role_memberships where user_id=${q(creator)} and role='operator';`,
  );
  await assert.rejects(
    () =>
      review(operator, post, "approve", { expectedVersion: post.version + 1 }),
    /stale_version/,
  );
  await assert.rejects(
    () => review(operator, post, "approve", { reviewedContent: false }),
    /publication_review_required/,
  );
  await assert.rejects(
    () => review(operator, post, "approve", { notes: "  " }),
    /publication_review_required/,
  );
  post = await review(operator, post, "reject", {
    notes: "Please remove the identifying address from your caption.",
  });
  assert.equal(post.state, "rejected");
  assert.match(
    (await read(creator, "post", { id: post.id })).reviewNotes,
    /identifying address/,
  );
  await assert.rejects(() => media(null, post.id), /not_found/);
  await assert.rejects(() => review(operator, post), /post_review_unavailable/);
  // A fresh publish request cannot override a rejection. Resubmission is an
  // explicit versioned edit that returns to the independent queue.
  assert.equal(
    (await mutate(creator, "post_publish", publishInput)).state,
    "rejected",
  );
  post = await mutate(creator, "post_update", {
    id: post.id,
    expectedVersion: post.version,
    caption: "Make your version",
    brandOptIn: true,
    published: true,
  });
  assert.equal(post.state, "pending");
  const approvalKey = randomUUID();
  const pendingVersion = { ...post };
  post = await review(operator, pendingVersion, "approve", {}, approvalKey);
  assert.equal(post.state, "published");
  assert.deepEqual(
    await review(operator, pendingVersion, "approve", {}, approvalKey),
    post,
  );
  await assert.rejects(() => reviewMedia(operator), /not_found/);
  assert.equal((await read(operator, "operator")).reviewPosts.length, 0);
  assert.equal((await read(null, "feed")).posts.length, 1);
  assert.equal((await read(null, "post", { id: post.id })).reviewNotes, "");
  const approved = post;
  post = await mutate(creator, "post_update", {
    id: post.id,
    expectedVersion: post.version,
    caption: "Make your version: an edited caption also requires review",
    brandOptIn: true,
    published: true,
  });
  assert.equal(post.state, "pending");
  assert.equal((await read(null, "feed")).posts.length, 0);
  await assert.rejects(() => media(null, post.id), /not_found/);
  await assert.rejects(() => review(operator, approved), /stale_version/);
  post = await review(operator, post);
  assert.equal(
    await sql(
      `select jsonb_build_object('run',(select to_jsonb(r) from quest_runs r where id=${q(run.id)}),'assets',(select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(run.id)}),'wallet',(select to_jsonb(w) from wallets w where owner_id=${q(creator)}),'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(run.id)}));`,
    ),
    originalBeforeReview,
    "publication review never changes the private run, media, wallet or reward ledger",
  );
  await assert.rejects(
    () =>
      sql(
        `select sq_community_review_media(${q(operator)},${q(post.id)});`,
        "authenticated",
      ),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      sql(
        `select private.community_mutate_before_reel_review(${q(creator)},'post_publish',${j(publishInput)},${q(randomUUID())},'hash');`,
        "authenticated",
      ),
    /permission denied/,
  );
  await assert.rejects(() => read(null, "me"), /forbidden/);
  const publicPost = await read(null, "post", { id: post.id });
  console.log(
    "Checking real feed cursor round trips, timestamp ties, filters, and exact final pages…",
  );
  const fixtureIds = Array.from(
    { length: 65 },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  // Reuse this isolated finalized run with separate sealed reel assets. These
  // fixtures never enter the seed or production data and are removed below.
  await sql(`
    with assets as (
      insert into public.media_assets(id,owner_id,run_id,kind,state,object_key,bytes,mime,duration_ms,sha256,sealed_at)
      select x::uuid,${q(creator)},${q(run.id)},'reel','sealed','pagination/'||x,4000,'video/mp4',24000,${q(hash("page"))},now()
      from jsonb_array_elements_text(${j(fixtureIds)}) x returning id
    )
    insert into public.community_posts(id,owner_id,run_id,asset_id,template_id,template_version,brand_opt_in,state,approved_version,reviewed_at,reviewed_by,created_at)
    select id,${q(creator)},${q(run.id)},id,${q(template.id)},1,
      (right(id::text,1)::int % 2)=1,'published',1,now(),${q(operator)},'2026-09-29T09:20:30.123456-04:00'::timestamptz from assets;
  `);
  const expected = JSON.parse(
    await sql(
      `select jsonb_agg(id order by created_at desc,id) from community_posts;`,
    ),
  );
  const seen = [];
  let before;
  for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
    // PostgreSQL emits offset-bearing JSON timestamps in the session timezone.
    const page = JSON.parse(
      await sql(
        `set timezone='America/New_York'; select sq_community_read(null,'feed',${j({ limit: 30, ...(before ? { before } : {}) })});`,
      ),
    );
    seen.push(...page.posts.map((item) => item.id));
    if (!page.nextCursor) break;
    assert.match(page.nextCursor, /[+-]\d{2}:\d{2}\|[a-f0-9-]{36}$/);
    assert.notEqual(page.nextCursor, before);
    // Simulate the browser's query-string encoding and Worker decode unchanged.
    before = new URLSearchParams(
      new URLSearchParams({ before: page.nextCursor }).toString(),
    ).get("before");
  }
  assert.deepEqual(seen, expected);
  assert.equal(new Set(seen).size, 66);
  const exactFirst = await read(null, "feed", { limit: 33 });
  const exactFinal = await read(null, "feed", {
    limit: 33,
    before: exactFirst.nextCursor,
  });
  assert.equal(exactFinal.posts.length, 33);
  assert.equal(
    exactFinal.nextCursor,
    null,
    "An exact final page does not promise another page",
  );
  const filters = { templateId: template.id, brandOnly: true, limit: 20 };
  const brandFirst = await read(null, "feed", filters);
  const brandLast = await read(null, "feed", {
    ...filters,
    before: brandFirst.nextCursor,
  });
  assert.equal([...brandFirst.posts, ...brandLast.posts].length, 34);
  assert(
    [...brandFirst.posts, ...brandLast.posts].every((item) => item.brandOptIn),
  );
  assert.equal(brandLast.nextCursor, null);
  assert.deepEqual(
    (
      await read(null, "feed", {
        templateId: "another-quest",
        before: exactFirst.nextCursor,
      })
    ).posts,
    [],
  );
  console.log(
    "Checking Following/search filters before pagination and block enforcement…",
  );
  await assert.rejects(
    () => read(null, "feed", { followingOnly: true }),
    /forbidden/,
  );
  assert.equal(
    (await read(viewer, "feed", { followingOnly: true })).posts.length,
    0,
  );
  await sql(`select sq_social_follow(${q(viewer)},${q(creator)},true);`);
  const followingFirst = await read(viewer, "feed", {
    followingOnly: true,
    query: "CREATOR",
    limit: 33,
  });
  const followingLast = await read(viewer, "feed", {
    followingOnly: true,
    query: "creator",
    limit: 33,
    before: followingFirst.nextCursor,
  });
  assert.equal(followingFirst.posts.length + followingLast.posts.length, 66);
  assert.equal(followingLast.nextCursor, null);
  assert(followingFirst.posts.every((item) => item.viewerFollowing));
  assert.equal(
    (await read(outsider, "feed", { followingOnly: true })).posts.length,
    0,
  );
  assert.equal(
    (await read(null, "feed", { query: "Make your version" })).posts.length,
    1,
  );
  assert.equal(
    (await read(null, "feed", { query: "PRIVATE_SUMMARY_NEVER_PUBLIC" })).posts
      .length,
    0,
  );
  assert.equal(
    (await read(null, "feed", { query: "%" })).posts.length,
    0,
    "Search treats wildcard characters literally",
  );
  await assert.rejects(
    () => read(null, "feed", { query: "x".repeat(81) }),
    /invalid_input/,
  );
  await mutate(viewer, "block", { userId: creator, blocked: true });
  assert.equal(
    (await read(viewer, "feed", { query: "Creator" })).posts.length,
    0,
  );
  assert.equal(
    (await read(viewer, "feed", { followingOnly: true })).posts.length,
    0,
  );
  await mutate(viewer, "block", { userId: creator, blocked: false });
  assert.equal(
    (await read(viewer, "feed", { followingOnly: true })).posts.length,
    0,
    "Unblocking does not silently re-follow",
  );
  const legacy = await read(null, "feed", {
    before: "2026-09-29T09:20:30.123456-04:00",
  });
  assert(legacy.posts.every((item) => !fixtureIds.includes(item.id)));
  await sql(
    `delete from community_posts where id in (select value::uuid from jsonb_array_elements_text(${j(fixtureIds)})); delete from media_assets where id in (select value::uuid from jsonb_array_elements_text(${j(fixtureIds)}));`,
  );
  const serialized = JSON.stringify(publicPost);
  for (const secret of [
    "PRIVATE_SUMMARY",
    "PRIVATE_ANSWER",
    "PRECISE_PRIVATE",
    "PRIVATE_RAW",
    "PRIVATE_REEL",
    "PRIVATE_THUMB",
    "object_key",
    "contactEmail",
    "auth_user_id",
  ])
    assert(!serialized.includes(secret), secret);
  assert.equal(publicPost.quest.id, template.id);
  assert.equal((await read(creator, "me")).publications[0].runId, run.id);
  assert.equal((await read(creator, "me")).publications[0].postId, post.id);
  assert.equal(
    (await media(null, post.id)).object_key,
    `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`,
  );
  await assert.rejects(
    () =>
      mutate(viewer, "post_update", {
        id: post.id,
        expectedVersion: post.version,
        caption: "Hijacked",
        brandOptIn: false,
        published: false,
      }),
    /not_found/,
  );
  await assert.rejects(
    () => sql(`select sq_community_read(null,'feed','{}');`, "anon"),
    /permission denied/,
  );
  await assert.rejects(
    () => sql("select * from community_posts;", "authenticated"),
    /permission denied/,
  );
  await assert.rejects(() => media(viewer, clips[0].asset_id), /not_found/);
  const inspirationInput = {
    template_id: template.id,
    outing: { ...baseOuting, participants: 2, budgetMinor: 0, area: "My area" },
    inspired_by_post: post.id,
  };
  const wrongTemplate = await sql(
    `select id from quest_templates where id<>${q(template.id)} limit 1;`,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_run", viewer, {
        ...inspirationInput,
        template_id: wrongTemplate,
      }),
    /inspiration_quest_mismatch/,
  );
  const attemptKey = randomUUID();
  const [attempt, replayedAttempt] = await Promise.all([
    rpc("sq_accept_run", viewer, inspirationInput, attemptKey),
    rpc("sq_accept_run", viewer, inspirationInput, attemptKey),
  ]);
  assert.equal(attempt.run.id, replayedAttempt.run.id);
  assert.equal(attempt.run.snapshot.inspiredByPostId, post.id);
  assert.equal(attempt.run.budget_amount, 0);
  assert.equal(attempt.run.participants, 2);
  assert.equal(attempt.run.selected_role, null);
  assert.equal(attempt.run.evidence_manifest, null);
  assert.notEqual(attempt.run.id, run.id);
  assert.equal(
    await sql(
      `select count(*) from quest_inspirations where post_id=${q(post.id)};`,
    ),
    "1",
  );
  let activity = await read(creator, "activity");
  assert.equal(
    activity.items.filter((x) => x.kind === "inspired_attempt").length,
    1,
  );
  const notice = activity.items.find((x) => x.kind === "inspired_attempt");
  await mutate(creator, "activity_read", { id: notice.id });
  assert(
    (await read(creator, "activity")).items.find((x) => x.id === notice.id)
      .readAt,
  );

  console.log("Checking reviewed original quests and business approval…");
  const draftId = randomUUID();
  let draft = await mutate(creator, "draft_save", {
    id: draftId,
    expectedVersion: 0,
    quest: template,
  });
  assert.match(draft.quest.id, /^original_[a-p]+_v1$/);
  assert.equal(draft.quest.version, 1);
  assert.equal(
    await sql(
      `select count(*) from quest_templates where id=${q(draft.quest.id)};`,
    ),
    "0",
  );
  await assert.rejects(
    () =>
      mutate(viewer, "draft_save", {
        id: draft.id,
        expectedVersion: draft.version,
        quest: template,
      }),
    /not_found/,
  );
  draft = await mutate(creator, "draft_submit", {
    id: draft.id,
    expectedVersion: draft.version,
  });
  await assert.rejects(
    () =>
      mutate(viewer, "draft_review", {
        id: draft.id,
        expectedVersion: draft.version,
        decision: "approve",
        notes: "",
      }),
    /forbidden/,
  );
  draft = await mutate(operator, "draft_review", {
    id: draft.id,
    expectedVersion: draft.version,
    decision: "approve",
    notes: "Requirements reviewed",
  });
  assert.equal(draft.state, "approved");
  assert.equal(
    await sql(
      `select count(*) from quest_templates where id=${q(draft.templateId)};`,
      "anon",
    ),
    "1",
  );
  const profile = await read(null, "creator", { id: creator });
  assert.equal(profile.quests[0].id, draft.templateId);
  await assert.rejects(
    () =>
      mutate(creator, "draft_save", {
        id: draft.id,
        expectedVersion: draft.version,
        quest: template,
      }),
    /draft_locked/,
  );
  let business = await mutate(brand, "brand_save", {
    name: "Test brand",
    website: "https://brand.example",
    contactEmail: "PRIVATE_EMAIL@example.test",
    expectedVersion: 0,
  });
  const terms = {
    paymentMinor: 20000,
    currency: "USD",
    channels: ["brand_social", "paid_social"],
    startDate: new Date().toISOString().slice(0, 10),
    durationDays: 30,
    editingPermissions: "crop_captions",
    message: "Please license this exact video.",
    platformFeeMinor: 1000,
  };
  await assert.rejects(
    () => mutate(brand, "offer_create", { postId: post.id, terms }),
    /brand_approval_required/,
  );
  await assert.rejects(
    () =>
      mutate(creator, "brand_review", {
        id: brand,
        expectedVersion: business.version,
        decision: "approve",
        notes: "",
      }),
    /forbidden/,
  );
  business = await mutate(operator, "brand_review", {
    id: brand,
    expectedVersion: business.version,
    decision: "approve",
    notes: "Business identity checked manually",
  });
  assert.equal(business.state, "approved");
  assert.equal((await read(brand, "brand")).posts.length, 1);

  console.log(
    "Checking offer concurrency, immutable agreement, manual fulfillment, and commercial access…",
  );
  const walletBefore = await sql(
    `select to_jsonb(w) from wallets w where owner_id=${q(creator)};`,
  );
  await assert.rejects(
    () =>
      mutate(brand, "offer_create", {
        postId: post.id,
        terms: { ...terms, platformFeeMinor: undefined },
      }),
    /invalid_terms/,
  );
  const [offer, duplicateOffer] = await Promise.all([
    mutate(brand, "offer_create", { postId: post.id, terms }),
    mutate(brand, "offer_create", { postId: post.id, terms }),
  ]);
  assert.equal(offer.id, duplicateOffer.id);
  assert.equal(offer.assetId, ready.output_asset_id);
  assert.equal(offer.state, "proposed");
  assert.equal(offer.history.length, 1);
  await assert.rejects(
    () =>
      mutate(brand, "offer_respond", {
        id: offer.id,
        expectedVersion: offer.version,
        decision: "accept",
      }),
    /other_party_required/,
  );
  await assert.rejects(
    () => read(outsider, "offer", { id: offer.id }),
    /not_found/,
  );
  await assert.rejects(
    () =>
      mutate(outsider, "offer_respond", {
        id: offer.id,
        expectedVersion: offer.version,
        decision: "accept",
      }),
    /not_found/,
  );
  const counter = await mutate(creator, "offer_respond", {
    id: offer.id,
    expectedVersion: offer.version,
    decision: "counter",
    terms: { ...terms, paymentMinor: 25000 },
  });
  assert.equal(counter.history.length, 2);
  assert.equal(counter.proposerId, creator);
  await assert.rejects(
    () =>
      mutate(brand, "offer_respond", {
        id: offer.id,
        expectedVersion: offer.version,
        decision: "accept",
      }),
    /stale_version/,
  );
  await assert.rejects(
    () =>
      mutate(creator, "offer_respond", {
        id: offer.id,
        expectedVersion: counter.version,
        decision: "accept",
      }),
    /other_party_required/,
  );
  const accepted = await mutate(brand, "offer_respond", {
    id: offer.id,
    expectedVersion: counter.version,
    decision: "accept",
  });
  assert.equal(accepted.state, "pending_fulfillment");
  assert.equal(accepted.acceptedTerms.paymentMinor, 25000);
  assert.equal(
    await sql(
      `select accepted_by from licensing_offers where id=${q(offer.id)};`,
    ),
    brand,
  );
  assert.equal(accepted.fulfillment, null);
  assert.equal(accepted.mediaUrl, null);
  await assert.rejects(
    () => media(brand, null, offer.id),
    /commercial_access_unavailable/,
  );
  await assert.rejects(
    () =>
      sql(
        `update licensing_offers set accepted_terms=${j(terms)} where id=${q(offer.id)};`,
      ),
    /accepted_terms_immutable/,
  );
  const fulfill = {
    id: offer.id,
    expectedVersion: accepted.version,
    paymentReference: "Bank receipt 123",
    permissionReference: "Signed release 456",
    paid: true,
    permissionsConfirmed: true,
  };
  await assert.rejects(
    () => mutate(brand, "offer_fulfill", fulfill),
    /forbidden/,
  );
  const fulfillKey = randomUUID();
  const [fulfilled, fulfilledAgain] = await Promise.all([
    mutate(operator, "offer_fulfill", fulfill, fulfillKey),
    mutate(operator, "offer_fulfill", fulfill, fulfillKey),
  ]);
  assert.deepEqual(fulfilled, fulfilledAgain);
  await sql(
    `update private.role_memberships set revoked_at=now() where user_id=${q(operator)} and role='operator';`,
  );
  await assert.rejects(
    () => mutate(operator, "offer_fulfill", fulfill, fulfillKey),
    /forbidden/,
  );
  await sql(
    `update private.role_memberships set revoked_at=null where user_id=${q(operator)} and role='operator';`,
  );
  assert.equal(fulfilled.state, "completed");
  assert.equal(
    await sql(
      `select count(*) from private.licensing_fulfillments where offer_id=${q(offer.id)};`,
    ),
    "1",
  );
  await assert.rejects(
    () => mutate(operator, "offer_fulfill", fulfill),
    /stale_version/,
  );
  assert.equal(
    (await media(brand, null, offer.id)).object_key,
    `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`,
  );
  await assert.rejects(
    () => media(creator, null, offer.id),
    /commercial_access_unavailable/,
  );
  assert.equal(
    await sql(
      `select to_jsonb(w) from wallets w where owner_id=${q(creator)};`,
    ),
    walletBefore,
    "Licensing never writes XP/points or reward balances",
  );
  for (const offset of [30, -60]) {
    const periodTerms = {
      ...terms,
      startDate: new Date(Date.now() + offset * 86400000)
        .toISOString()
        .slice(0, 10),
      durationDays: 10,
    };
    const dated = await mutate(brand, "offer_create", {
      postId: post.id,
      terms: periodTerms,
    });
    const agreed = await mutate(creator, "offer_respond", {
      id: dated.id,
      expectedVersion: dated.version,
      decision: "accept",
    });
    await mutate(operator, "offer_fulfill", {
      ...fulfill,
      id: dated.id,
      expectedVersion: agreed.version,
    });
    await assert.rejects(
      () => media(brand, null, dated.id),
      /commercial_access_unavailable/,
      "Completion cannot bypass a future or expired usage window",
    );
  }
  let unpublished = await mutate(creator, "post_update", {
    id: post.id,
    expectedVersion: post.version,
    caption: "Updated caption",
    brandOptIn: true,
    published: false,
  });
  assert.equal((await read(null, "feed")).posts.length, 0);
  await assert.rejects(() => read(null, "post", { id: post.id }), /not_found/);
  await assert.rejects(() => media(null, post.id), /not_found/);
  assert.equal((await media(creator, post.id)).mime, "video/mp4");
  await assert.rejects(
    () => media(brand, null, offer.id),
    /commercial_access_unavailable/,
  );
  assert.equal((await read(brand, "offer", { id: offer.id })).mediaUrl, null);
  assert.deepEqual(
    (await read(brand, "offer", { id: offer.id })).acceptedTerms,
    accepted.acceptedTerms,
    "Unpublishing pauses access without rewriting the agreed terms",
  );
  assert.equal(
    await sql(
      `select state from media_assets where id=${q(ready.output_asset_id)};`,
    ),
    "sealed",
  );
  unpublished = await mutate(creator, "post_update", {
    id: post.id,
    expectedVersion: unpublished.version,
    caption: "Re-published",
    brandOptIn: true,
    published: true,
  });
  assert.equal(unpublished.state, "pending");
  await assert.rejects(
    () => mutate(brand, "offer_create", { postId: post.id, terms }),
    /brand_inquiries_unavailable/,
  );
  await assert.rejects(
    () => media(brand, null, offer.id),
    /commercial_access_unavailable/,
  );
  unpublished = await review(operator, unpublished);
  const another = await mutate(brand, "offer_create", {
    postId: post.id,
    terms: { ...terms, message: "A separate requested period." },
  });
  const declined = await mutate(creator, "offer_respond", {
    id: another.id,
    expectedVersion: another.version,
    decision: "decline",
  });
  assert.equal(declined.state, "declined");
  await mutate(creator, "report", {
    offerId: another.id,
    reason: "Please review this commercial request.",
  });
  await mutate(viewer, "report", {
    postId: post.id,
    reason: "Please review this public post.",
  });
  assert.equal((await read(operator, "operator")).reports.length, 2);
  await mutate(creator, "block", { userId: brand, blocked: true });
  assert.equal((await read(brand, "feed")).posts.length, 0);
  assert.equal(
    (await read(null, "feed")).posts.length,
    1,
    "Blocking does not promise removal of anonymous public access",
  );
  await assert.rejects(
    () => mutate(brand, "offer_create", { postId: post.id, terms }),
    /forbidden/,
  );
  const suspended = await mutate(operator, "offer_moderate", {
    id: offer.id,
    expectedVersion: fulfilled.version,
    reason: "Usage dispute under review.",
  });
  assert.equal(suspended.suspended, true);
  assert.deepEqual(suspended.acceptedTerms, accepted.acceptedTerms);
  assert(suspended.fulfillment);
  await assert.rejects(
    () => media(brand, null, offer.id),
    /commercial_access_unavailable/,
  );
  await mutate(operator, "post_moderate", {
    id: post.id,
    expectedVersion: unpublished.version,
    reason: "Public report reviewed.",
  });
  assert.equal((await read(null, "feed")).posts.length, 0);
  await assert.rejects(
    () =>
      mutate(creator, "post_update", {
        id: post.id,
        expectedVersion: unpublished.version + 1,
        caption: "",
        brandOptIn: false,
        published: true,
      }),
    /post_removed/,
  );
  await assert.rejects(
    () => rpc("sq_accept_run", outsider, inspirationInput),
    /inspiration_unavailable/,
  );
  await rpc("sq_delete_account", creator);
  await assert.rejects(
    () => read(null, "creator", { id: creator }),
    /not_found/,
  );
  assert.equal(
    await sql(
      `select count(*) from quest_templates where id=${q(draft.templateId)};`,
      "anon",
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from community_activity where owner_id=${q(creator)} or actor_id=${q(creator)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.licensing_fulfillments where offer_id=${q(offer.id)};`,
    ),
    "1",
  );
  console.log(
    "PASS: explicit publication/privacy, personal inspiration, reviewed original quests, verified brands, concurrent offers, immutable mutual terms, manual fulfillment, scoped commercial media, reporting/blocking/moderation, and deletion.",
  );
}
