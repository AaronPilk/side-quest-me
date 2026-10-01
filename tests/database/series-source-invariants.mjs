import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
export async function runSeriesSourceTests(sql) {
  const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const j = (v) => `${q(JSON.stringify(v))}::jsonb`;
  const hash = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const rpc = (name, actor, input, key = randomUUID()) =>
    sql(
      `select ${name}(${q(actor)},${j(input)},${q(key)},${q(hash(input))});`,
    ).then(JSON.parse);
  const mutate = (actor, action, input, key = randomUUID()) =>
    sql(
      `select sq_series_mutate(${q(actor)},${q(action)},${j(input)},${q(key)},${q(hash({ action, input }))});`,
    ).then(JSON.parse);
  const read = (actor, view, input) =>
    sql(
      `select sq_series_read(${actor ? q(actor) : "null"},${q(view)},${j(input)});`,
    ).then(JSON.parse);
  const owner = randomUUID(),
    completedOwner = randomUUID(),
    foreign = randomUUID();
  for (const actor of [owner, completedOwner, foreign]) {
    await sql(`insert into auth.users(id) values(${q(actor)});`, null);
    await sql(`select sq_upsert_profile(${q(actor)},'{}');`);
    await sql(
      `insert into creator_profiles(user_id,display_name,avatar_key) values(${q(actor)},'Source series author','mint');`,
    );
  }
  const outing = {
    participants: 2,
    budgetMinor: 5000,
    budgetScope: "total",
    currency: "USD",
    area: "Private area",
  };
  const accept = async (actor) =>
    (
      await rpc("sq_accept_run", actor, {
        template_id: "date_menu_draft_chill_v1",
        outing,
      })
    ).run;
  const values = (run) => ({
    runId: run.id,
    title: "Our next chapters",
    premise: "A story discovered after its first adventure.",
    cover: "night",
    kind: "finite",
  });
  const beforeRun = (id) =>
    sql(`select to_jsonb(r) from quest_runs r where id=${q(id)};`);
  const active = await accept(owner),
    original = await beforeRun(active.id),
    input = values(active),
    key = randomUUID();
  await assert.rejects(
    () => mutate(foreign, "start_from_run", input),
    /series_run_unavailable/,
  );
  const promoted = await mutate(owner, "start_from_run", input, key);
  assert.equal(promoted.state, "draft");
  assert.equal(promoted.formatLocked, false);
  assert.equal(promoted.parts[0].locked, true);
  assert.equal(promoted.parts[0].templateVersion, active.snapshot.version);
  assert.deepEqual(promoted.parts[0].quest, active.snapshot.template);
  assert.equal(promoted.progress.activeRunId, active.id);
  assert.deepEqual(promoted.progress.completedPartIds, []);
  assert.equal(
    await beforeRun(active.id),
    original,
    "late decision must not update a single accepted run field",
  );
  assert.deepEqual(await mutate(owner, "start_from_run", input, key), promoted);
  await assert.rejects(
    () =>
      mutate(
        owner,
        "start_from_run",
        { ...input, title: "Another title" },
        key,
      ),
    /idempotency_conflict/,
  );
  await assert.rejects(
    () => mutate(owner, "start_from_run", input),
    /series_run_linked/,
  );
  assert.equal(
    await sql(
      `select count(*) from quest_series_parts where source_run_id=${q(active.id)};`,
    ),
    "1",
  );
  const context = await read(owner, "run", { id: active.id });
  assert.equal(context.id, promoted.id);
  await assert.rejects(
    () => read(foreign, "run", { id: active.id }),
    /series_run_unavailable/,
  );
  await assert.rejects(
    () => read(null, "detail", { id: promoted.id }),
    /series_unavailable/,
  );
  const save = {
    id: promoted.id,
    expectedVersion: promoted.version,
    title: promoted.title,
    premise: promoted.premise,
    cover: promoted.cover,
    kind: promoted.kind,
    state: "draft",
    parts: promoted.parts.map(
      ({ id, title, templateId, prerequisitePartId, prerequisiteReason }) => ({
        id,
        title,
        templateId,
        prerequisitePartId,
        prerequisiteReason,
        published: false,
      }),
    ),
  };
  await assert.rejects(
    () =>
      mutate(owner, "save", {
        ...save,
        parts: [{ ...save.parts[0], title: "Rewrite past objective" }],
      }),
    /published_part_immutable/,
  );
  const appended = await mutate(owner, "save", {
    ...save,
    parts: [
      ...save.parts,
      {
        id: randomUUID(),
        title: "The next adventure",
        templateId: active.template_id,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: false,
      },
    ],
  });
  assert.equal(appended.parts.length, 2);
  assert.equal(appended.formatLocked, false);
  // A completed/public standalone reel must keep its byte-identical run,
  // asset, post state/caption, evidence, reward decision and wallet balance.
  const complete = await accept(completedOwner),
    clips = [];
  for (let slot = 1; slot <= 3; slot++) {
    const asset = await rpc("sq_reserve_upload", completedOwner, {
      run_id: complete.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", completedOwner, {
      asset_id: asset.id,
      object_key: `sealed/${completedOwner}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: 10000,
      sha256: hash(asset.id),
      metadata: { width: 720, height: 1280 },
    });
    clips.push({ asset_id: asset.id, start_ms: 0, end_ms: 8000 });
  }
  const submitted = await rpc("sq_submit_run", completedOwner, {
    run_id: complete.id,
    clips,
    declaration: { attempted: true, consent: true },
    needs_review: false,
  });
  const lease = JSON.parse(
    await sql(`select sq_claim_render(${q(submitted.render_job.id)});`),
  );
  const ready = JSON.parse(
    await sql(
      `select sq_finish_render(${q(lease.id)},${lease.fence},${j({ object_key: `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`, bytes: 4000, mime: "video/mp4", duration_ms: 24000, sha256: hash(lease.id), metadata: {} })});`,
    ),
  );
  const post = JSON.parse(
    await sql(
      `select sq_community_mutate(${q(completedOwner)},'post_publish',${j({ runId: complete.id, assetId: ready.output_asset_id, caption: "My first real adventure", brandOptIn: false })},${q(randomUUID())},'hash');`,
    ),
  );
  const retained = await beforeRun(complete.id);
  const economics = await sql(
    `select jsonb_build_object('wallet',(select to_jsonb(w) from wallets w where owner_id=${q(completedOwner)}),'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(complete.id)}),'post',(select to_jsonb(p) from community_posts p where id=${q(post.id)}),'assets',(select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(complete.id)}));`,
  );
  const converted = await mutate(completedOwner, "start_from_run", {
    ...values(complete),
    kind: "ongoing",
  });
  assert.equal(await beforeRun(complete.id), retained);
  assert.equal(
    await sql(
      `select jsonb_build_object('wallet',(select to_jsonb(w) from wallets w where owner_id=${q(completedOwner)}),'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where run_id=${q(complete.id)}),'post',(select to_jsonb(p) from community_posts p where id=${q(post.id)}),'assets',(select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(complete.id)}));`,
    ),
    economics,
  );
  assert.deepEqual(converted.progress.completedPartIds, [
    converted.parts[0].id,
  ]);
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series,
    null,
    "public standalone post must not expose private draft metadata",
  );
  const published = await mutate(completedOwner, "save", {
    id: converted.id,
    expectedVersion: converted.version,
    title: converted.title,
    premise: converted.premise,
    cover: converted.cover,
    kind: converted.kind,
    state: "published",
    parts: converted.parts.map(
      ({ id, title, templateId, prerequisitePartId, prerequisiteReason }) => ({
        id,
        title,
        templateId,
        prerequisitePartId,
        prerequisiteReason,
        published: true,
      }),
    ),
  });
  assert.equal(published.formatLocked, true);
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series.id,
    converted.id,
  );
  assert.deepEqual(
    (await read(foreign, "detail", { id: converted.id })).progress
      .completedPartIds,
    [],
  );
  const abandoned = await accept(foreign);
  await rpc("sq_abandon_run", foreign, { run_id: abandoned.id });
  await assert.rejects(
    () => mutate(foreign, "start_from_run", values(abandoned)),
    /series_run_unavailable/,
  );
  // Concurrent different keys cannot attach one attempt to two private series.
  const raceActor = randomUUID();
  await sql(`insert into auth.users(id) values(${q(raceActor)});`, null);
  await sql(
    `select sq_upsert_profile(${q(raceActor)},'{}'); insert into creator_profiles(user_id,display_name,avatar_key) values(${q(raceActor)},'Concurrent author','mint');`,
  );
  const race = await accept(raceActor);
  const results = await Promise.allSettled([
    mutate(raceActor, "start_from_run", values(race)),
    mutate(raceActor, "start_from_run", values(race)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await sql(
      `select count(*) from quest_series_parts where source_run_id=${q(race.id)};`,
    ),
    "1",
  );
  await rpc("sq_delete_account", owner, {});
  assert.equal(
    await sql(
      `select count(*) from quest_series_parts where source_run_id=${q(active.id)} and source_context is not null;`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.idempotency_records where actor_id=${q(owner)} and operation='series_start_from_run';`,
    ),
    "0",
  );
  await assert.rejects(
    () =>
      sql(
        `select private.series_run_context(${q(active.id)});`,
        "authenticated",
      ),
    /permission denied/,
  );
  console.log(
    "PASS: private late Series linkage, frozen source identity, ownership/status/concurrency/idempotency, active/finalized progress, unchanged media/publication/rewards, and no public draft-title leak.",
  );
}
