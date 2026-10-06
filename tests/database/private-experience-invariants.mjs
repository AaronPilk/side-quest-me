import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
export async function runPrivateExperienceTests(sql) {
  console.log(
    "Checking private discovery leases, owner binding, preflight and zero rewards…",
  );
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
  const hash = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const rpc = (
    name,
    actor,
    input,
    key = randomUUID(),
    fingerprint = hash(input),
  ) =>
    sql(
      `select public.${name}(${quote(actor)},${json(input)},${quote(key)},${quote(fingerprint)});`,
    ).then(JSON.parse);
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${quote(id)});`, null);
    await sql(`select sq_upsert_profile(${quote(id)},'{}');`);
    return id;
  };
  const owner = await user(),
    other = await user(),
    key = randomUUID();
  const initialLease = await rpc(
    "sq_reserve_experience_discovery",
    owner,
    {},
    key,
    "one",
  );
  assert.equal(initialLease.acquired, true);
  assert.ok(Number.isFinite(Date.parse(initialLease.leaseUntil)));
  assert.deepEqual(
    await rpc("sq_reserve_experience_discovery", owner, {}, key, "one"),
    { acquired: false },
  );
  await assert.rejects(
    () => rpc("sq_reserve_experience_discovery", owner, {}, key, "changed"),
    /idempotency_conflict/,
  );
  const response = {
    candidates: [],
    proposals: [
      {
        location: {
          id: "I1234",
          latitude: 27,
          longitude: -82,
          name: "Listed venue",
        },
      },
    ],
  };
  await rpc("sq_finish_experience_discovery", owner, { response }, key, "one");
  const replay = await rpc(
    "sq_reserve_experience_discovery",
    owner,
    {},
    key,
    "one",
  );
  assert.equal(replay.response.proposals[0].location.name, "Listed venue");
  assert.equal(replay.response.proposals[0].location.latitude, undefined);
  assert.deepEqual(
    await rpc(
      "sq_release_experience_discovery",
      owner,
      initialLease,
      key,
      "one",
    ),
    { released: false },
    "A late failure never clears a completed response",
  );
  assert.deepEqual(
    await rpc("sq_reserve_experience_discovery", owner, {}, key, "one"),
    replay,
  );
  const retryKey = randomUUID();
  const failedLease = await rpc(
    "sq_reserve_experience_discovery",
    owner,
    {},
    retryKey,
    "retry",
  );
  await assert.rejects(
    () =>
      rpc(
        "sq_release_experience_discovery",
        other,
        failedLease,
        retryKey,
        "retry",
      ),
    /idempotency_conflict/,
  );
  await assert.rejects(
    () =>
      rpc(
        "sq_release_experience_discovery",
        owner,
        failedLease,
        retryKey,
        "changed",
      ),
    /idempotency_conflict/,
  );
  assert.deepEqual(
    await rpc("sq_release_experience_discovery", owner, {}, retryKey, "retry"),
    { released: false },
    "The service must present its exact lease receipt",
  );
  assert.deepEqual(
    await rpc(
      "sq_release_experience_discovery",
      owner,
      failedLease,
      retryKey,
      "retry",
    ),
    { released: true },
  );
  const retriedLease = await rpc(
    "sq_reserve_experience_discovery",
    owner,
    {},
    retryKey,
    "retry",
  );
  assert.equal(
    retriedLease.acquired,
    true,
    "Known failures can retry immediately",
  );
  assert.notEqual(retriedLease.leaseUntil, failedLease.leaseUntil);
  assert.deepEqual(
    await rpc(
      "sq_release_experience_discovery",
      owner,
      failedLease,
      retryKey,
      "retry",
    ),
    { released: false },
    "An old worker cannot unlock the newer attempt",
  );
  assert.deepEqual(
    await rpc("sq_reserve_experience_discovery", owner, {}, retryKey, "retry"),
    { acquired: false },
  );
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(
      () =>
        sql(
          `select public.sq_release_experience_discovery(${quote(owner)},${json(retriedLease)},${quote(retryKey)},'retry');`,
          role,
        ),
      /permission denied/,
    );
  }
  const q = JSON.parse(
    await sql(
      "select content from public.quest_templates where published and intensity='full_send' order by id limit 1;",
    ),
  );
  const quest = {
    ...q,
    privateGenerated: true,
    award: { xp: 0, points: 0 },
    arrangementRequired: true,
    venuePermissionRequired: true,
    adultOnly: false,
    requiresVolunteer: false,
    supportsAdultContext: false,
    durationMinutes: 90,
    cost: {
      minMinor: 0,
      maxMinor: 0,
      scope: "total",
      currency: "USD",
      venueCostUnknown: true,
      note: "Confirm total admission",
    },
  };
  const outing = {
    category: q.category,
    intensity: "full_send",
    group: "friends",
    participants: 5,
    setting: "venue",
    budgetMinor: 30000,
    budgetScope: "total",
    currency: "USD",
    durationMinutes: null,
    travelMinutes: 0,
    travelCostMinor: 0,
    venuePermission: false,
    arrangementConfirmed: false,
    adultEligible: false,
    adultContext: false,
    confirmedVenueCostMinor: null,
    applePlaceId: "I1234",
    area: "",
  };
  const input = {
    quest,
    mechanic: "competition",
    outing,
    location: {
      id: "I1234",
      name: "Listed venue",
      latitude: 27,
      longitude: -82,
    },
    provider: "openai",
    model: "test-model",
  };
  const storeKey = randomUUID(),
    stored = await rpc("sq_store_private_proposal", owner, input, storeKey);
  assert.match(stored.quest.id, /^private_[0-9a-f-]+$/);
  assert.equal(stored.proposal.location.latitude, undefined);
  assert.deepEqual(stored.quest.award, { xp: 0, points: 0 });
  assert.deepEqual(
    await rpc("sq_store_private_proposal", owner, input, storeKey),
    stored,
  );
  assert.equal(
    await sql(
      `select published from quest_templates where id=${quote(stored.quest.id)};`,
    ),
    "f",
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_templates set published=true where id=${quote(stored.quest.id)};`,
      ),
    /private_template_cannot_publish/,
  );
  await assert.rejects(
    () =>
      rpc("sq_store_private_proposal", owner, {
        ...input,
        quest: { ...quest, award: { xp: 100, points: 100 } },
      }),
    /invalid_private_proposal/,
  );
  await assert.rejects(
    () =>
      sql(
        `select public.sq_store_private_proposal(${quote(owner)},${json(input)},'test-key','hash');`,
        "authenticated",
      ),
    /permission denied/,
  );
  const accept = {
    template_id: stored.quest.id,
    outing,
    expected_campaign: null,
  };
  await assert.rejects(
    () => rpc("sq_accept_private_run", other, accept),
    /not_found/,
  );
  await assert.rejects(
    () => rpc("sq_accept_private_run", owner, accept),
    /private_requirements_pending/,
  );
  const confirmed = {
    ...outing,
    venuePermission: true,
    arrangementConfirmed: true,
    confirmedVenueCostMinor: 15000,
  };
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", owner, {
        ...accept,
        outing: { ...confirmed, applePlaceId: "IDIFFERENT" },
      }),
    /private_plan_changed/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", owner, {
        ...accept,
        outing: { ...confirmed, confirmedVenueCostMinor: 40000 },
      }),
    /invalid_outing/,
  );
  const run = await rpc("sq_accept_private_run", owner, {
    ...accept,
    outing: confirmed,
  });
  assert.equal(run.eligibility.reason, "private_generated");
  assert.equal(run.run.snapshot.reward_policy.xp, 0);
  assert.equal(run.run.snapshot.reward_policy.points, 0);
  assert.equal(run.run.snapshot.template.privateGenerated, true);
  assert.equal(run.run.snapshot.template.id, stored.quest.id);
  await sql(
    `update quest_runs set status='in_progress',evidence_manifest='{}',evidence_hash=private.content_hash('{}'::jsonb) where id=${quote(run.run.id)};`,
  );
  await sql(
    `select private.finalize_run(${quote(owner)},${quote(run.run.id)});`,
  );
  assert.equal(
    await sql(
      `select count(*) from reward_ledger where run_id=${quote(run.run.id)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from quest_runs where id=${quote(run.run.id)} and status='finalized';`,
    ),
    "1",
  );
  await sql(
    `insert into creator_profiles(user_id,display_name,avatar_key) values(${quote(owner)},'Private adventurer','mint');`,
  );
  const seriesInput = {
    runId: run.run.id,
    title: "Our private adventures",
    premise: "Continue this experience later.",
    cover: "night",
    kind: "ongoing",
  };
  const series = JSON.parse(
    await sql(
      `select sq_series_mutate(${quote(owner)},'start_from_run',${json(seriesInput)},${quote(randomUUID())},${quote(hash(seriesInput))});`,
    ),
  );
  assert.equal(series.parts[0].available, true);
  assert.equal(series.parts[0].quest.privateGenerated, true);
  // Publishing a generated quest through a Series must review its canonical
  // instructions, not just the author's chapter title. Only its owner can
  // obtain this pending-publication payload; outing/account context is absent.
  const publishInput = {
    id: series.id,
    expectedVersion: series.version,
    title: series.title,
    premise: series.premise,
    cover: series.cover,
    kind: series.kind,
    state: "published",
    parts: series.parts.map((part) => ({
      id: part.id,
      title: part.title,
      templateId: part.templateId,
      prerequisitePartId: part.prerequisitePartId,
      prerequisiteReason: part.prerequisiteReason,
      published: true,
    })),
  };
  const preflight = (actor, input) =>
    sql(
      `select sq_series_review_preflight(${quote(actor)},${json(input)},${quote(randomUUID())},${quote(hash({ action: "save", input }))});`,
    ).then(JSON.parse);
  const pendingReview = await preflight(owner, publishInput);
  assert.equal(pendingReview.requiresReview, true);
  assert.deepEqual(
    pendingReview.publicContent.parts[0].quest,
    series.parts[0].quest,
  );
  assert.equal(JSON.stringify(pendingReview).includes('"outing"'), false);
  await assert.rejects(
    () => preflight(other, publishInput),
    /creator_profile_required|forbidden/,
  );
  await assert.rejects(
    () =>
      preflight(owner, {
        ...publishInput,
        id: undefined,
        expectedVersion: 0,
        parts: [{ ...publishInput.parts[0], id: randomUUID() }],
      }),
    /template_unavailable/,
    "a new catalog-based series cannot select unpublished private templates",
  );
  await sql(
    `update private_quest_proposals set expires_at=now()-interval '1 day' where id=${quote(stored.proposal.id)};`,
  );
  const repeated = await rpc("sq_accept_private_run", owner, {
    ...accept,
    outing: confirmed,
    series_part_id: series.parts[0].id,
  });
  assert.equal(repeated.run.snapshot.series.id, series.id);
  assert.equal(repeated.run.snapshot.reward_policy.points, 0);
  await rpc("sq_abandon_run", owner, { run_id: repeated.run.id });
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", other, {
        ...accept,
        outing: confirmed,
        series_part_id: series.parts[0].id,
      }),
    /not_found/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", owner, {
        ...accept,
        outing: confirmed,
        series_part_id: randomUUID(),
      }),
    /series_unavailable/,
  );
  // Outdoor operator charges must never become a free activity merely because
  // the experience's actual setting is outside rather than at an indoor venue.
  const outdoorOwner = await user();
  const outdoorPlan = {
    ...outing,
    setting: "outside",
    travelCostMinor: 500,
    budgetMinor: 2000,
    budgetScope: "per_person",
    arrangementConfirmed: true,
    applePlaceId: null,
  };
  const outdoor = await rpc("sq_store_private_proposal", outdoorOwner, {
    ...input,
    outing: outdoorPlan,
    location: null,
    quest: { ...quest, settings: ["outside"], venuePermissionRequired: true },
  });
  const outdoorAccept = {
    template_id: outdoor.quest.id,
    outing: outdoorPlan,
    expected_campaign: null,
  };
  await assert.rejects(
    () => rpc("sq_accept_private_run", outdoorOwner, outdoorAccept),
    /private_requirements_pending/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", outdoorOwner, {
        ...outdoorAccept,
        outing: {
          ...outdoorPlan,
          confirmedVenueCostMinor: 9501,
          venuePermission: true,
        },
      }),
    /invalid_outing/,
  );
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", outdoorOwner, {
        ...outdoorAccept,
        outing: {
          ...outdoorPlan,
          confirmedVenueCostMinor: 9500,
          venuePermission: false,
        },
      }),
    /private_requirements_pending/,
  );
  const outdoorRun = await rpc("sq_accept_private_run", outdoorOwner, {
    ...outdoorAccept,
    outing: {
      ...outdoorPlan,
      confirmedVenueCostMinor: 9500,
      venuePermission: true,
    },
  });
  assert.equal(outdoorRun.run.outing.setting, "outside");
  assert.equal(outdoorRun.run.outing.confirmedVenueCostMinor, 9500);
  assert.equal(outdoorRun.run.snapshot.reward_policy.points, 0);
  await rpc("sq_abandon_run", outdoorOwner, { run_id: outdoorRun.run.id });
  // Opting into nightlife allows adult ideas; ordinary generated content does
  // not inherit adult-venue permission. Test the real acceptance transaction.
  const ordinaryOwner = await user();
  const optionalNightlife = {
    ...outing,
    adultContext: true,
    adultEligible: true,
    arrangementConfirmed: true,
    confirmedVenueCostMinor: 1000,
  };
  const ordinaryQuest = {
    ...quest,
    adultOnly: false,
    minimumAge: undefined,
    supportsAdultContext: false,
    venuePermissionRequired: false,
    conflicts: [],
  };
  const ordinaryStored = await rpc("sq_store_private_proposal", ordinaryOwner, {
    ...input,
    quest: ordinaryQuest,
    outing: optionalNightlife,
  });
  const ordinaryRun = await rpc("sq_accept_private_run", ordinaryOwner, {
    template_id: ordinaryStored.quest.id,
    outing: optionalNightlife,
    expected_campaign: null,
  });
  assert.equal(ordinaryRun.run.outing.venuePermission, false);
  assert.equal(ordinaryRun.run.snapshot.template.adultOnly, false);
  assert.equal(ordinaryRun.run.snapshot.template.minimumAge, undefined);
  await rpc("sq_abandon_run", ordinaryOwner, { run_id: ordinaryRun.run.id });

  // An operator can require adults without being an adult-nightlife venue.
  // Age eligibility remains required; nightlife permission does not get added.
  const ageOnlyOwner = await user();
  const ageOnlyStored = await rpc("sq_store_private_proposal", ageOnlyOwner, {
    ...input,
    outing: optionalNightlife,
    quest: { ...ordinaryQuest, adultOnly: true, minimumAge: 18 },
  });
  const ageOnlyAccept = {
    template_id: ageOnlyStored.quest.id,
    outing: optionalNightlife,
    expected_campaign: null,
  };
  await assert.rejects(
    () =>
      rpc("sq_accept_private_run", ageOnlyOwner, {
        ...ageOnlyAccept,
        outing: { ...optionalNightlife, adultEligible: false },
      }),
    /private_requirements_pending/,
  );
  const ageOnlyRun = await rpc(
    "sq_accept_private_run",
    ageOnlyOwner,
    ageOnlyAccept,
  );
  assert.equal(ageOnlyRun.run.outing.venuePermission, false);
  assert.equal(ageOnlyRun.run.snapshot.template.minimumAge, 18);
  await rpc("sq_abandon_run", ageOnlyOwner, { run_id: ageOnlyRun.run.id });

  const adultOwner = await user();
  const adultStored = await rpc("sq_store_private_proposal", adultOwner, {
    ...input,
    outing: optionalNightlife,
    quest: {
      ...ordinaryQuest,
      adultOnly: true,
      minimumAge: 21,
      supportsAdultContext: true,
      conflicts: ["alcohol", "adult_venues"],
    },
  });
  const adultAccept = {
    template_id: adultStored.quest.id,
    expected_campaign: null,
    outing: { ...optionalNightlife, venuePermission: true },
  };
  for (const missing of [
    { venuePermission: false },
    { adultEligible: false },
  ]) {
    await assert.rejects(
      () =>
        rpc("sq_accept_private_run", adultOwner, {
          ...adultAccept,
          outing: { ...adultAccept.outing, ...missing },
        }),
      /private_requirements_pending/,
    );
  }
  // Build 15 clears the discovery preference at selection; its explicit
  // confirmations for this selected experience still authorize acceptance.
  const adultRun = await rpc("sq_accept_private_run", adultOwner, {
    ...adultAccept,
    outing: { ...adultAccept.outing, adultContext: false },
  });
  assert.equal(adultRun.run.snapshot.template.minimumAge, 21);
  await rpc("sq_abandon_run", adultOwner, { run_id: adultRun.run.id });
  await assert.rejects(
    () =>
      sql(
        `select public.sq_accept_private_run(${quote(adultOwner)},${json(adultAccept)},'no-access','hash');`,
        "authenticated",
      ),
    /permission denied/,
  );
}
