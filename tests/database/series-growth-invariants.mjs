import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";

/** A series grows by doing its own quest again. The author may attempt the
 * next, still-private part of their own series; nobody else may. */
export async function runSeriesGrowthTests(sql) {
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
  const saveInput = (series, patch = {}) => ({
    id: series.id,
    expectedVersion: series.version,
    title: series.title,
    premise: series.premise,
    cover: series.cover,
    kind: series.kind,
    state: series.state,
    parts: series.parts.map((part) => ({
      id: part.id,
      title: part.title,
      templateId: part.templateId,
      prerequisitePartId: part.prerequisitePartId,
      prerequisiteReason: part.prerequisiteReason,
      published: part.published,
    })),
    ...patch,
  });
  const author = randomUUID(),
    viewer = randomUUID();
  for (const actor of [author, viewer]) {
    await sql(`insert into auth.users(id) values(${q(actor)});`, null);
    await sql(`select sq_upsert_profile(${q(actor)},'{}');`);
    await sql(
      `insert into creator_profiles(user_id,display_name,avatar_key) values(${q(actor)},'Growing author','mint');`,
    );
  }
  const outing = {
    participants: 2,
    budgetMinor: 5000,
    budgetScope: "total",
    currency: "USD",
    area: "Private area",
  };
  const template = "date_menu_draft_chill_v1";
  const accept = async (actor, extra = {}) =>
    (
      await rpc("sq_accept_run", actor, {
        template_id: template,
        outing,
        ...extra,
      })
    ).run;
  // Part 1: a finished quest (three sealed clips, submitted without review).
  const first = await accept(author);
  const clips = [];
  for (let slot = 1; slot <= 3; slot++) {
    const asset = await rpc("sq_reserve_upload", author, {
      run_id: first.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", author, {
      asset_id: asset.id,
      object_key: `sealed/${author}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: 10000,
      sha256: hash(asset.id),
      metadata: { width: 720, height: 1280 },
    });
    clips.push({ asset_id: asset.id, start_ms: 0, end_ms: 8000 });
  }
  await rpc("sq_submit_run", author, {
    run_id: first.id,
    clips,
    declaration: { attempted: true, consent: true },
    needs_review: false,
  });
  assert.equal(
    await sql(`select status from quest_runs where id=${q(first.id)};`),
    "finalized",
  );
  const series = await mutate(author, "start_from_run", {
    runId: first.id,
    title: "A private story not yet announced",
    premise: first.snapshot.template.hook,
    cover: "sunrise",
    kind: "ongoing",
  });
  assert.equal(series.state, "draft");
  assert.deepEqual(series.progress.completedPartIds, [series.parts[0].id]);
  // Part 2 is the same quest, added as a private part.
  const partId = randomUUID();
  const grown = await mutate(author, "save", {
    id: series.id,
    expectedVersion: series.version,
    title: series.title,
    premise: series.premise,
    cover: series.cover,
    kind: series.kind,
    state: "draft",
    parts: [
      {
        id: series.parts[0].id,
        title: series.parts[0].title,
        templateId: series.parts[0].templateId,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: false,
      },
      {
        id: partId,
        title: "Part 2",
        templateId: template,
        prerequisitePartId: null,
        prerequisiteReason: "",
        published: false,
      },
    ],
  });
  const second = grown.parts.find((part) => part.id === partId);
  assert.equal(second.position, 2);
  assert.equal(second.published, false);
  assert.equal(
    second.available,
    true,
    "the author may attempt an unpublished part of their own private series",
  );
  assert.equal(second.unavailableReason, null);
  assert.equal(grown.progress.currentPartId, partId);
  const asPart = await read(author, "part", { id: partId });
  assert.equal(asPart.canStart, true);
  // Nobody else can see the private series or its part, let alone start it.
  await assert.rejects(
    () => read(viewer, "detail", { id: series.id }),
    /series_unavailable/,
  );
  await assert.rejects(
    () => read(viewer, "part", { id: partId }),
    /series_unavailable/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", viewer, {
        template_id: template,
        outing,
        series_part_id: partId,
      }),
    /series_unavailable/,
  );
  // The author films Part 2 with their own outing; the run is stamped as
  // position 2 of the private series, and nothing about Part 1 changes.
  const partOneBefore = await sql(
    `select to_jsonb(p) from quest_series_parts p where id=${q(series.parts[0].id)};`,
  );
  const partTwo = await rpc("sq_accept_series_run", author, {
    template_id: template,
    outing,
    series_part_id: partId,
  });
  assert.equal(partTwo.run.snapshot.series.id, series.id);
  assert.equal(partTwo.run.snapshot.series.partId, partId);
  assert.equal(partTwo.run.snapshot.series.position, 2);
  assert.equal(
    partTwo.eligibility.reason,
    "family_cooldown",
    "repeating the same quest inside 30 days earns no second award",
  );
  assert.equal(
    await sql(
      `select to_jsonb(p) from quest_series_parts p where id=${q(series.parts[0].id)};`,
    ),
    partOneBefore,
  );
  let current = await read(author, "detail", { id: series.id });
  const progress = current.progress;
  assert.equal(progress.activeRunId, partTwo.run.id);
  assert.equal(progress.currentPartId, partId);
  assert.equal(current.parts[1].attempted, true);
  const privatePartBefore = await sql(
    `select to_jsonb(p) from quest_series_parts p where id=${q(partId)};`,
  );
  const runBefore = await sql(
    `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
  );
  const originalSave = saveInput(current);
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...originalSave,
        parts: originalSave.parts.filter((part) => part.id !== partId),
      }),
    /published_part_immutable/,
    "a private part cannot disappear after its run is accepted",
  );
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...originalSave,
        parts: originalSave.parts.map((part) =>
          part.id === partId
            ? { ...part, templateId: "day_tiny_discovery_chill_v1" }
            : part,
        ),
      }),
    /published_part_immutable|series_template_mismatch/,
    "an accepted private part keeps its quest identity",
  );
  for (const query of [
    `delete from quest_series_parts where id=${q(partId)};`,
    `update quest_series_parts set position=39 where id=${q(partId)};`,
    `update quest_series_parts set template_id='day_tiny_discovery_chill_v1' where id=${q(partId)};`,
  ]) {
    await assert.rejects(() => sql(query), /published_part_immutable/);
  }
  // Adding another unattempted part remains legal. An accepted episode cannot
  // then trade places with that draft, even before either episode is public.
  const thirdId = randomUUID();
  current = await mutate(
    author,
    "save",
    saveInput(current, {
      title: "An updated private title",
      parts: [
        ...originalSave.parts,
        {
          id: thirdId,
          title: "Part 3",
          templateId: template,
          prerequisitePartId: null,
          prerequisiteReason: "",
          published: false,
        },
      ],
    }),
  );
  const withThird = saveInput(current);
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...withThird,
        parts: [withThird.parts[0], withThird.parts[2], withThird.parts[1]],
      }),
    /published_part_immutable/,
    "a new unattempted draft cannot displace an accepted private episode",
  );
  assert.equal(
    await sql(
      `select to_jsonb(p) from quest_series_parts p where id=${q(partId)};`,
    ),
    privatePartBefore,
  );
  assert.equal(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
    ),
    runBefore,
  );
  // Private text/requirements may evolve for future attempts. The already
  // accepted run keeps the earlier part title and all its sealed inputs.
  const editable = saveInput(current);
  editable.parts[1].title = "The second attempt";
  editable.parts[1].prerequisitePartId = current.parts[0].id;
  editable.parts[1].prerequisiteReason =
    "Build on the first completed attempt.";
  current = await mutate(author, "save", editable);
  assert.equal(current.parts[1].title, "The second attempt");
  assert.equal(current.parts[1].prerequisitePartId, current.parts[0].id);
  assert.equal(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
    ),
    runBefore,
  );
  // A growth series repeats its source quest and version, rather than accepting
  // a different quest or silently adopting a later revision of the same ID.
  const fourth = { ...withThird.parts[2], id: randomUUID(), title: "Part 4" };
  await assert.rejects(
    () =>
      mutate(author, "save", {
        ...saveInput(current),
        parts: [
          ...saveInput(current).parts,
          { ...fourth, templateId: "day_tiny_discovery_chill_v1" },
        ],
      }),
    /series_template_mismatch/,
  );
  await sql(
    `alter table quest_templates disable trigger template_immutable; update quest_templates set version=version+1 where id=${q(template)}; alter table quest_templates enable trigger template_immutable;`,
    null,
  );
  try {
    const staleSource = await read(author, "detail", { id: series.id });
    assert.equal(staleSource.parts[0].available, false);
    await assert.rejects(
      () =>
        mutate(author, "save", {
          ...saveInput(current),
          parts: [...saveInput(current).parts, fourth],
        }),
      /series_template_mismatch/,
      "a next part cannot adopt the current revision of an old source quest",
    );
    // Metadata/private-state edits remain possible for the unavailable frozen
    // episode; saving does not rewrite its original content or run.
    const unchanged = await mutate(
      author,
      "save",
      saveInput(staleSource, {
        premise:
          "Updated premise while the original quest version is unavailable.",
      }),
    );
    assert.equal(unchanged.parts[0].templateVersion, first.snapshot.version);
    assert.equal(
      unchanged.parts[1].templateVersion,
      partTwo.run.snapshot.version,
    );
    assert.deepEqual(unchanged.parts[1].quest, partTwo.run.snapshot.template);
    current = unchanged;
  } finally {
    await sql(
      `alter table quest_templates disable trigger template_immutable; update quest_templates set version=${first.snapshot.version} where id=${q(template)}; alter table quest_templates enable trigger template_immutable;`,
      null,
    );
  }
  // Still nothing public: the series stays a private draft with an in-flight
  // Part 2, and the viewer cannot start the part the author is filming.
  assert.equal(
    (await read(author, "detail", { id: series.id })).state,
    "draft",
  );
  assert.deepEqual(
    (await read(viewer, "list", {})).filter((item) => item.id === series.id),
    [],
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_series_run", viewer, {
        template_id: template,
        outing,
        series_part_id: partId,
      }),
    /series_unavailable/,
  );
  // Finish and publicly share the *video* while the series remains private.
  // A public reel must not automatically announce private series metadata.
  const economyBefore = await sql(
    `select jsonb_build_object('xp',w.xp,'points',w.points,'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where owner_id=${q(author)})) from wallets w where owner_id=${q(author)};`,
  );
  const secondClips = [];
  for (let slot = 1; slot <= 3; slot++) {
    const asset = await rpc("sq_reserve_upload", author, {
      run_id: partTwo.run.id,
      slot,
      expected_bytes: 1000,
      mime: "video/mp4",
    });
    await rpc("sq_seal_media", author, {
      asset_id: asset.id,
      object_key: `sealed/${author}/${asset.id}/${hash(asset.id)}`,
      bytes: 1000,
      mime: "video/mp4",
      duration_ms: 10000,
      sha256: hash(asset.id),
      metadata: { width: 720, height: 1280 },
    });
    secondClips.push({ asset_id: asset.id, start_ms: 0, end_ms: 8000 });
  }
  const secondSubmission = await rpc("sq_submit_run", author, {
    run_id: partTwo.run.id,
    clips: secondClips,
    declaration: { attempted: true, consent: true },
    needs_review: false,
  });
  assert.equal(secondSubmission.run.reward_decision.reason, "family_cooldown");
  assert.equal(
    await sql(
      `select jsonb_build_object('xp',w.xp,'points',w.points,'ledger',(select jsonb_agg(to_jsonb(l) order by id) from reward_ledger l where owner_id=${q(author)})) from wallets w where owner_id=${q(author)};`,
    ),
    economyBefore,
    "finishing the second episode creates no duplicate XP/points or ledger entry",
  );
  const lease = JSON.parse(
    await sql(`select sq_claim_render(${q(secondSubmission.render_job.id)});`),
  );
  const ready = JSON.parse(
    await sql(
      `select sq_finish_render(${q(lease.id)},${lease.fence},${j({ object_key: `renders/${lease.id}/${lease.fence}/${hash(lease.id)}.mp4`, bytes: 4000, mime: "video/mp4", duration_ms: 24000, sha256: hash(lease.id), metadata: {} })});`,
    ),
  );
  const post = JSON.parse(
    await sql(
      `select sq_community_mutate(${q(author)},'post_publish',${j({ runId: partTwo.run.id, assetId: ready.output_asset_id, caption: "My second attempt", brandOptIn: false })},${q(randomUUID())},'hash');`,
    ),
  );
  assert.equal(
    post.series,
    null,
    "a public video must not reveal its private draft series",
  );
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series,
    null,
  );
  assert.equal(
    (await read(author, "run", { id: partTwo.run.id })).partId,
    partId,
  );
  const finishedBefore = await sql(
    `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
  );
  const mediaBefore = await sql(
    `select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(partTwo.run.id)};`,
  );
  const postBefore = await sql(
    `select to_jsonb(p) from community_posts p where id=${q(post.id)};`,
  );
  // Publishing the first completed episode and later the already accepted
  // private episode changes only publication metadata, never quest/media/rewards.
  const publishFirst = saveInput(current, { state: "published" });
  publishFirst.parts[0].published = true;
  current = await mutate(author, "save", publishFirst);
  const publicFirst = await read(viewer, "detail", { id: series.id });
  assert.deepEqual(
    publicFirst.parts.map((part) => part.id),
    [current.parts[0].id],
  );
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series,
    null,
    "publishing Part 1 keeps private Part 2 metadata hidden",
  );
  const publishSecond = saveInput(current);
  publishSecond.parts[1].published = true;
  current = await mutate(author, "save", publishSecond);
  assert.equal(current.parts[1].published, true);
  assert.equal(
    (await read(viewer, "detail", { id: series.id })).parts[1].attempted,
    false,
    "a viewer cannot infer the author's private activity",
  );
  assert.equal(
    (await read(null, "detail", { id: series.id })).parts[1].attempted,
    false,
  );
  const visible = JSON.parse(
    await sql(`select private.community_post(${q(post.id)});`),
  ).series;
  assert.deepEqual(
    visible,
    partTwo.run.snapshot.series,
    "published episode context retains its original accepted attribution",
  );
  assert.equal(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
    ),
    finishedBefore,
  );
  assert.equal(
    await sql(
      `select jsonb_agg(to_jsonb(a) order by id) from media_assets a where run_id=${q(partTwo.run.id)};`,
    ),
    mediaBefore,
  );
  assert.equal(
    await sql(
      `select to_jsonb(p) from community_posts p where id=${q(post.id)};`,
    ),
    postBefore,
  );
  const unpublishPart = saveInput(current);
  unpublishPart.parts[1].published = false;
  current = await mutate(author, "save", unpublishPart);
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series,
    null,
    "unpublishing a part hides its context even when its video stays public",
  );
  const restorePart = saveInput(current);
  restorePart.parts[1].published = true;
  current = await mutate(author, "save", restorePart);
  current = await mutate(
    author,
    "save",
    saveInput(current, { state: "draft" }),
  );
  assert.equal(
    JSON.parse(await sql(`select private.community_post(${q(post.id)});`))
      .series,
    null,
    "unpublishing the series hides all episode context",
  );
  assert.equal(
    (await read(author, "run", { id: partTwo.run.id })).partId,
    partId,
    "public visibility changes preserve owner history",
  );
  assert.equal(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${q(partTwo.run.id)};`,
    ),
    finishedBefore,
  );
  // Even an abandoned private attempt preserves its part identity. Neither
  // progress nor publication needs to expose it for the guard to remember it.
  const thirdRun = await rpc("sq_accept_series_run", author, {
    template_id: template,
    outing,
    series_part_id: thirdId,
  });
  await rpc("sq_abandon_run", author, { run_id: thirdRun.run.id });
  current = await read(author, "detail", { id: series.id });
  assert.equal(
    current.parts[2].attempted,
    true,
    "abandoned history stays protected independently of active progress",
  );
  await assert.rejects(
    () =>
      mutate(
        author,
        "save",
        saveInput(current, {
          parts: saveInput(current).parts.filter((part) => part.id !== thirdId),
        }),
      ),
    /published_part_immutable/,
  );
  const racingId = randomUUID();
  current = await mutate(
    author,
    "save",
    saveInput(current, {
      parts: [...saveInput(current).parts, { ...fourth, id: racingId }],
    }),
  );
  // Save takes the series row exclusively; acceptance shares it through the
  // snapshot stamp. Whichever wins, no accepted run can reference a deleted part.
  const race = await Promise.allSettled([
    rpc("sq_accept_series_run", author, {
      template_id: template,
      outing,
      series_part_id: racingId,
    }),
    mutate(
      author,
      "save",
      saveInput(current, {
        parts: saveInput(current).parts.filter((part) => part.id !== racingId),
      }),
    ),
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1,
  );
  if (race[0].status === "fulfilled") {
    assert.equal(race[1].status, "rejected");
    assert.match(race[1].reason.message, /published_part_immutable/);
    assert.equal(
      await sql(
        `select count(*) from quest_series_parts where id=${q(racingId)};`,
      ),
      "1",
    );
  } else {
    assert.match(race[0].reason.message, /series_unavailable/);
    assert.equal(
      await sql(
        `select count(*) from quest_runs where snapshot->'series'->>'partId'=${q(racingId)};`,
      ),
      "0",
    );
  }
  console.log(
    "PASS: private series growth, frozen accepted/abandoned episode identity/order/content and acceptance/removal race, exact source quest/version, legal metadata/publication edits, public/private Series isolation, unchanged run/media and family reward cooldown.",
  );
}
