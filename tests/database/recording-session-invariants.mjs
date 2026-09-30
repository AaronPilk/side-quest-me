import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";

export async function runRecordingSessionTests(sql) {
  console.log(
    "Checking single-video sessions, legacy evidence, and owner isolation…",
  );
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const rpc = async (name, actor, input) =>
    JSON.parse(
      await sql(
        `select public.${name}(${q(actor)},${json(input)},${q(randomUUID())},${q(hash(input))});`,
      ),
    );
  const actor = randomUUID(),
    stranger = randomUUID();
  for (const id of [actor, stranger]) {
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
  }
  const template = await sql(
    "select id from quest_templates where published limit 1;",
  );
  const { run } = await rpc("sq_accept_run", actor, {
    template_id: template,
    outing: {
      participants: 2,
      budgetMinor: 5000,
      budgetScope: "total",
      currency: "USD",
      area: "",
    },
  });
  const snapshot = await sql(
    `select snapshot::text from quest_runs where id=${q(run.id)};`,
  );
  const sources = [];
  for (const slot of [1, 2, 3]) {
    const asset = await rpc("sq_reserve_upload", actor, {
      run_id: run.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", actor, {
      asset_id: asset.id,
      object_key: `sealed/${actor}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: slot === 1 ? 60000 : 10000,
      sha256: hash(asset.id),
      metadata: {},
    });
    sources.push(asset);
  }
  const selection = {
    run_id: run.id,
    asset_id: sources[0].id,
    start_ms: 0,
    end_ms: 60000,
    mode: "session",
    fit: "contain",
    crop: 0.5,
    mute: false,
    label: "",
  };
  await assert.rejects(
    () => rpc("sq_update_clip", stranger, selection),
    /not_found/,
  );
  await assert.rejects(
    () => rpc("sq_update_clip", actor, { ...selection, mode: undefined }),
    /invalid_selection/,
  );
  await assert.rejects(
    () => rpc("sq_update_clip", actor, { ...selection, end_ms: 60001 }),
    /invalid_selection/,
  );
  await rpc("sq_update_clip", actor, selection);
  assert.equal(
    await sql(
      `select count(*) from media_assets where run_id=${q(run.id)} and is_current;`,
    ),
    "1",
  );
  assert.equal(
    await sql(
      `select count(*) from media_assets where run_id=${q(run.id)} and state='sealed';`,
    ),
    "3",
    "old source bytes remain intact",
  );
  assert.equal(
    await sql(`select snapshot::text from quest_runs where id=${q(run.id)};`),
    snapshot,
  );
  const completed = await rpc("sq_submit_run", actor, {
    run_id: run.id,
    clips: [selection],
    declaration: { attempted: true, consent: true },
  });
  assert.equal(completed.run.evidence_manifest.clips.length, 1);
  assert.equal(completed.run.evidence_manifest.clips[0].end_ms, 60000);
  const claim = JSON.parse(
    await sql(`select sq_claim_render(${q(completed.render_job.id)});`),
  );
  const output = {
    object_key: `renders/${claim.id}/${claim.fence}/${hash(claim.id)}.mp4`,
    bytes: 3000,
    mime: "video/mp4",
    duration_ms: 60000,
    sha256: hash(claim.id),
  };
  await assert.rejects(
    () =>
      sql(
        `select sq_finish_render(${q(claim.id)},${claim.fence},${json({ ...output, duration_ms: 5000 })});`,
      ),
    /invalid_render_output/,
  );
  const result = JSON.parse(
    await sql(
      `select sq_finish_render(${q(claim.id)},${claim.fence},${json(output)});`,
    ),
  );
  assert.equal(result.status, "ready");
  assert.equal(
    await sql(
      `select jsonb_array_length(evidence_manifest->'clips') from quest_runs where id=${q(run.id)};`,
    ),
    "1",
  );
}
