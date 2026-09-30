import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

export async function runSeriesTests(sql) {
  const q = (v) => `'${String(v).replaceAll("'", "''")}'`,
    j = (v) => `${q(JSON.stringify(v))}::jsonb`,
    hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const read = (actor, view, input = {}) =>
    sql(
      `select sq_series_read(${actor ? q(actor) : "null"},${q(view)},${j(input)});`,
    ).then(JSON.parse);
  const mutate = (actor, action, input, key = randomUUID()) =>
    sql(
      `select sq_series_mutate(${q(actor)},${q(action)},${j(input)},${q(key)},${q(hash({ action, input }))});`,
    ).then(JSON.parse);
  const rpc = (name, actor, input, key = randomUUID()) =>
    sql(
      `select ${name}(${q(actor)},${j(input)},${q(key)},${q(hash(input))});`,
    ).then(JSON.parse);
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
    return id;
  };
  const [author, participant, other] = await Promise.all([
    user(),
    user(),
    user(),
  ]);
  await sql(
    `insert into creator_profiles(user_id,display_name,avatar_key) values(${q(author)},'Series author','mint');`,
  );
  const templates = await read(author, "templates");
  const first = templates.find((t) => t.id === "date_menu_draft_chill_v1"),
    second = templates.find((t) => t.id === "day_tiny_discovery_chill_v1"),
    third = templates.find((t) => t.id === "night_pocket_radio_bold_v1");
  assert.ok(first && second && third);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  let input = {
    expectedVersion: 0,
    title: "A three-part experiment",
    premise: "Try, notice, and tell a story.",
    cover: "ocean",
    kind: "finite",
    state: "draft",
    parts: [
      {
        id: ids[0],
        title: "First experiment",
        templateId: first.id,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: true,
      },
      {
        id: ids[1],
        title: "Build on the first",
        templateId: second.id,
        prerequisitePartId: ids[0],
        prerequisiteReason: "Use your first experiment as the starting point.",
        published: true,
      },
      {
        id: ids[2],
        title: "An independent detour",
        templateId: third.id,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: true,
      },
    ],
  };
  console.log(
    "Checking private Series drafts, stable parts, prerequisites, progress, follows, and source snapshots…",
  );
  const draft = await mutate(author, "save", input);
  assert.equal(draft.state, "draft");
  assert.equal(draft.parts.length, 3);
  await assert.rejects(
    () => read(null, "detail", { id: draft.id }),
    /series_unavailable/,
  );
  await assert.rejects(
    () => read(participant, "detail", { id: draft.id }),
    /series_unavailable/,
  );
  await assert.rejects(
    () =>
      mutate(other, "save", {
        ...input,
        id: draft.id,
        expectedVersion: draft.version,
      }),
    /creator_profile_required|forbidden/,
  );
  input = {
    ...input,
    id: draft.id,
    expectedVersion: draft.version,
    state: "published",
  };
  const published = await mutate(author, "save", input);
  assert.equal(published.parts[0].templateVersion, first.version);
  assert.equal(published.parts[0].locked, true);
  assert.equal((await read(null, "detail", { id: draft.id })).progress, null);
  const before = await read(participant, "detail", { id: draft.id });
  assert.deepEqual(before.progress.completedPartIds, []);
  assert.equal(before.progress.currentPartId, ids[0]);
  assert.equal(before.parts[1].available, false);
  assert.match(before.parts[1].unavailableReason, /Use your first experiment/);
  assert.equal(before.parts[2].available, true);
  const part = await read(participant, "part", { id: ids[1] });
  assert.equal(part.canStart, false);
  assert.equal((await read(participant, "list"))[0].id, published.id);
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...input,
        expectedVersion: published.version,
        parts: [...input.parts, input.parts[0]],
      }),
    /published_series_immutable|invalid_series/,
  );
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...input,
        expectedVersion: published.version,
        parts: [input.parts[1], input.parts[0], input.parts[2]],
      }),
    /published_part_immutable|invalid_prerequisite/,
  );
  await assert.rejects(
    () =>
      sql(`update quest_series_parts set position=4 where id=${q(ids[0])};`),
    /published_part_immutable/,
  );
  const outing = {
    participants: 2,
    budgetMinor: 2500,
    budgetScope: "total",
    currency: "USD",
    area: "PRIVATE PARTICIPANT AREA",
  };
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", participant, {
        template_id: second.id,
        outing,
        series_part_id: ids[1],
      }),
    /series_prerequisite/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", participant, {
        template_id: second.id,
        outing,
        series_part_id: ids[0],
      }),
    /series_template_mismatch/,
  );
  const acceptInput = { template_id: first.id, outing, series_part_id: ids[0] },
    acceptKey = randomUUID();
  const accepted = await rpc(
    "sq_accept_series_run",
    participant,
    acceptInput,
    acceptKey,
  );
  assert.equal(accepted.run.snapshot.series.id, published.id);
  assert.equal(accepted.run.snapshot.series.partId, ids[0]);
  assert.equal(accepted.run.snapshot.series.position, 1);
  assert.deepEqual(
    await rpc("sq_accept_series_run", participant, acceptInput, acceptKey),
    accepted,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", participant, {
        template_id: third.id,
        outing,
        series_part_id: ids[2],
      }),
    /active_run_exists/,
  );
  assert.equal(
    (await read(participant, "detail", { id: draft.id })).progress.activeRunId,
    accepted.run.id,
  );
  assert.deepEqual(
    (await read(other, "detail", { id: draft.id })).progress.completedPartIds,
    [],
  );
  assert.equal(
    (await read(other, "detail", { id: draft.id })).progress.activeRunId,
    null,
  );
  // Genuine completion goes through existing evidence validation and awards; merely reading never advances it.
  const clips = [];
  for (let slot = 1; slot <= 3; slot++) {
    const asset = await rpc("sq_reserve_upload", participant, {
      run_id: accepted.run.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", participant, {
      asset_id: asset.id,
      object_key: `sealed/${participant}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: 10000,
      sha256: hash(asset.id),
      metadata: { width: 720, height: 1280 },
    });
    clips.push({ asset_id: asset.id, start_ms: 0, end_ms: 8000 });
  }
  const submit = {
      run_id: accepted.run.id,
      clips,
      declaration: { attempted: true, consent: true },
      needs_review: false,
    },
    submitKey = randomUUID();
  const submission = await rpc("sq_submit_run", participant, submit, submitKey);
  await rpc("sq_submit_run", participant, submit, submitKey);
  const completed = await read(participant, "detail", { id: published.id });
  assert.deepEqual(completed.progress.completedPartIds, [ids[0]]);
  assert.equal(completed.parts[1].available, true);
  assert.equal(completed.progress.currentPartId, ids[1]);
  assert.equal(completed.progress.complete, false);
  assert.equal(
    await sql(
      `select count(*) from reward_ledger where run_id=${q(accepted.run.id)};`,
    ),
    "2",
  );
  assert.equal(
    await sql(
      `select count(*) from community_posts where run_id=${q(accepted.run.id)};`,
    ),
    "0",
  );
  assert.deepEqual(
    (await read(other, "detail", { id: published.id })).progress
      .completedPartIds,
    [],
  );
  const changed = await mutate(author, "save", {
    ...input,
    expectedVersion: published.version,
    title: "A renamed public series",
  });
  assert.equal(changed.title, "A renamed public series");
  assert.equal(
    JSON.parse(
      await sql(
        `select snapshot->'series' from quest_runs where id=${q(accepted.run.id)};`,
      ),
    ).title,
    "A three-part experiment",
  );
  // Authored snapshot remains the reviewed version; stale current templates do not appear startable.
  await sql(
    `alter table quest_templates disable trigger template_immutable; update quest_templates set version=version+1 where id=${q(second.id)}; alter table quest_templates enable trigger template_immutable;`,
    null,
  );
  const stale = await read(participant, "part", { id: ids[1] });
  assert.equal(stale.canStart, false);
  assert.match(stale.reason, /original quest version/);
  assert.equal(stale.part.quest.version, second.version);
  // An unavailable source cannot trap the author in a published state or rewrite its frozen version.
  await sql(
    `update quest_templates set published=false where id=${q(second.id)};`,
    null,
  );
  const withdrawn = await mutate(author, "save", {
    ...input,
    expectedVersion: changed.version,
    title: "A withdrawn story",
    state: "draft",
  });
  assert.equal(withdrawn.state, "draft");
  assert.equal(withdrawn.parts[1].templateVersion, second.version);
  assert.equal(withdrawn.parts[1].quest.version, second.version);
  await assert.rejects(
    read(participant, "detail", { id: published.id }),
    /series_unavailable/,
  );
  await sql(
    `alter table quest_templates disable trigger template_immutable; update quest_templates set version=${second.version},published=true where id=${q(second.id)}; alter table quest_templates enable trigger template_immutable;`,
    null,
  );
  await mutate(author, "save", {
    ...input,
    expectedVersion: withdrawn.version,
  });
  // Ongoing series have no invented final count; only newly published parts notify followers once.
  const ongoingId = randomUUID(),
    a = randomUUID(),
    b = randomUUID();
  const ongoing = {
    id: ongoingId,
    expectedVersion: 0,
    title: "A story that keeps going",
    premise: "One independent experiment at a time.",
    cover: "forest",
    kind: "ongoing",
    state: "published",
    parts: [
      {
        id: a,
        title: "First available part",
        templateId: first.id,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: true,
      },
      {
        id: b,
        title: "A private later part",
        templateId: second.id,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: false,
      },
    ],
  };
  // Explicitly publish the completed first episode, then reject combining its
  // attribution with a different series part that reuses the same quest version.
  const lease = JSON.parse(
    await sql(`select sq_claim_render(${q(submission.render_job.id)});`),
  );
  const ready = JSON.parse(
    await sql(
      `select sq_finish_render(${q(lease.id)},${lease.fence},${j({ object_key: `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`, bytes: 4000, mime: "video/mp4", duration_ms: 24000, sha256: hash(lease.id), metadata: { thumbnail_key: `thumbs/${lease.id}.jpg` } })});`,
    ),
  );
  await sql(
    `insert into creator_profiles(user_id,display_name,avatar_key) values(${q(participant)},'Series participant','coral');`,
  );
  const publicationInput = {
    runId: accepted.run.id,
    assetId: ready.output_asset_id,
    caption: "My own first episode",
    brandOptIn: false,
  };
  const publication = JSON.parse(
    await sql(
      `select sq_community_mutate(${q(participant)},'post_publish',${j(publicationInput)},${q(randomUUID())},${q(hash(publicationInput))});`,
    ),
  );
  assert.equal(publication.series.partId, ids[0]);
  const created = await mutate(author, "save", ongoing);
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", participant, {
        template_id: first.id,
        outing,
        series_part_id: a,
        inspired_by_post: publication.id,
      }),
    /series_inspiration_mismatch/,
  );
  assert.equal((await read(null, "detail", { id: ongoingId })).parts.length, 1);
  assert.equal((await read(null, "detail", { id: ongoingId })).partCount, 1);
  await mutate(participant, "follow", { id: ongoingId, following: true });
  assert.equal(
    (await read(participant, "detail", { id: ongoingId })).following,
    true,
  );
  const nextInput = {
    ...ongoing,
    expectedVersion: created.version,
    parts: ongoing.parts.map((p) => ({ ...p, published: true })),
  };
  const nextKey = randomUUID();
  await mutate(author, "save", nextInput, nextKey);
  await mutate(author, "save", nextInput, nextKey);
  assert.equal(
    await sql(
      `select count(*) from community_activity where owner_id=${q(participant)} and kind='series_part_published' and target_id=${q(b)};`,
    ),
    "1",
  );
  await sql(
    `insert into community_blocks(owner_id,blocked_id) values(${q(participant)},${q(author)});`,
  );
  assert.equal(
    await sql(
      `select count(*) from quest_series_follows where series_id=${q(ongoingId)} and follower_id=${q(participant)};`,
    ),
    "0",
  );
  await assert.rejects(
    () => read(participant, "detail", { id: ongoingId }),
    /series_unavailable/,
  );
  await assert.rejects(
    () => mutate(participant, "follow", { id: ongoingId, following: true }),
    /series_unavailable/,
  );
  await sql(
    `delete from community_blocks where owner_id=${q(participant)} and blocked_id=${q(author)};`,
  );
  assert.equal(
    (await read(participant, "detail", { id: ongoingId })).following,
    false,
  );
  const privateDraft = await mutate(author, "save", {
    ...ongoing,
    id: randomUUID(),
    title: "An author's private unfinished idea",
    premise: "Private notes that must not remain after account deletion.",
    state: "draft",
    parts: [
      {
        ...ongoing.parts[0],
        id: randomUUID(),
        title: "A private planned part",
        published: false,
      },
    ],
  });
  const retainedRun = await sql(
    `select jsonb_build_object('snapshot',snapshot,'snapshotHash',snapshot_hash,'rewardDecision',reward_decision,'finalizedAt',finalized_at) from quest_runs where id=${q(accepted.run.id)};`,
  );
  const retainedLedger = await sql(
    `select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(accepted.run.id)};`,
  );
  await sql(
    `update profiles set account_status='disabled' where id=${q(author)};`,
  );
  assert.equal(
    await sql(`select title from quest_series where id=${q(privateDraft.id)};`),
    privateDraft.title,
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_series_parts set privacy_redacted_at=now() where id=${q(ids[0])};`,
      ),
    /redaction_requires_deletion/,
  );
  await sql(
    `update profiles set account_status='active' where id=${q(author)};`,
  );
  await rpc("sq_delete_account", author, {});
  assert.equal(
    await sql(
      `select count(*) from quest_series where author_id=${q(author)} and (title<>'Deleted series' or premise<>'Deleted series.' or state<>'draft' or privacy_redacted_at is null);`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from quest_series_parts p join quest_series s on s.id=p.series_id where s.author_id=${q(author)} and (p.title<>'Deleted part' or p.quest_snapshot<>'{"redacted":true}'::jsonb or p.published or p.privacy_redacted_at is null or p.prerequisite_reason<>case when p.prerequisite_part_id is null then '' else 'Deleted prerequisite.' end);`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.idempotency_records where operation in ('series_save','series_follow') and (actor_id=${q(author)} or result->>'authorId'=${q(author)});`,
    ),
    "0",
  );
  await assert.rejects(
    () => read(null, "detail", { id: published.id }),
    /series_unavailable/,
  );
  await assert.rejects(
    () => read(other, "detail", { id: privateDraft.id }),
    /series_unavailable/,
  );
  assert.equal(
    await sql(
      `select jsonb_build_object('snapshot',snapshot,'snapshotHash',snapshot_hash,'rewardDecision',reward_decision,'finalizedAt',finalized_at) from quest_runs where id=${q(accepted.run.id)};`,
    ),
    retainedRun,
  );
  assert.equal(
    await sql(
      `select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(accepted.run.id)};`,
    ),
    retainedLedger,
  );
  // Redaction does not become an escape hatch for changing stable source identities.
  await assert.rejects(
    () =>
      sql(
        `update quest_series_parts set template_version=template_version+1 where id=${q(ids[0])};`,
      ),
    /invalid_deletion_redaction/,
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_series_parts set published=true where id=${q(ids[0])};`,
      ),
    /invalid_deletion_redaction/,
  );
  // The participant can independently delete their account; its existing follows are also cleared.
  await sql(
    `insert into creator_profiles(user_id,display_name,avatar_key) values(${q(other)},'Another Series author','mint');`,
  );
  const otherSeries = await mutate(other, "save", {
    ...ongoing,
    id: randomUUID(),
    parts: [{ ...ongoing.parts[0], id: randomUUID() }],
  });
  await mutate(participant, "follow", { id: otherSeries.id, following: true });
  await sql(
    `update profiles set account_status='deleting' where id=${q(participant)};`,
  );
  assert.equal(
    await sql(
      `select count(*) from quest_series_follows where follower_id=${q(participant)};`,
    ),
    "0",
  );
  await assert.rejects(
    () => sql("select * from quest_series;", "anon"),
    /permission denied/,
  );
  await assert.rejects(
    () => sql("select sq_series_read(null,'list','{}');", "authenticated"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      sql(
        `select sq_accept_series_run(${q(other)},'{}','some-long-key','hash');`,
        "authenticated",
      ),
    /permission denied/,
  );
  console.log(
    "PASS: Series drafts, immutable ordered parts/versions, actual private completion, atomic acceptance/prerequisites, independent parts, no bonus/autopublish, public privacy, follows and block cleanup.",
  );
}
