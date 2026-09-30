import { runRecordingSessionTests } from "./recording-session-invariants.mjs";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runCommunityTests } from "./community-invariants.mjs";
import { runSocialTests } from "./social-invariants.mjs";
import { runSeriesTests } from "./series-invariants.mjs";
import { runHostedHelperTests } from "./hosted-helper-invariants.mjs";
import { runActivityCatalogTests } from "./activity-catalog-invariants.mjs";
export async function runDatabaseTests(sql) {
  await runActivityCatalogTests(sql);
  await runHostedHelperTests(sql);
  const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
  const json = (v) => `${quote(JSON.stringify(v))}::jsonb`;
  const hash = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const rpc = (name, actor, input = {}, key = randomUUID()) =>
    sql(
      `select public.${name}(${quote(actor)},${json(input)},${quote(key)},${quote(hash(input))});`,
    ).then(JSON.parse);
  const scalar = (q, role) => sql(q, role);
  const deny = async (fn, match) => assert.rejects(fn, match);
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${quote(id)});`, null);
    await sql(`select sq_upsert_profile(${quote(id)},'{}');`);
    return id;
  };
  const a = await user(),
    b = await user(),
    operator = await user(),
    merchant = await user(),
    wrongMerchant = await user();
  await sql(
    `insert into private.role_memberships(user_id,role) values(${quote(operator)},'operator');`,
  );
  const templates = JSON.parse(
    await sql(
      "select jsonb_agg(jsonb_build_object('id',id,'family',family_id,'intensity',intensity,'category',category) order by id) from quest_templates where published;",
    ),
  );
  assert.equal(templates.length, 1113);
  assert.equal(await scalar('select count(*) from campaigns;'), '0');
  const distinct = [...new Map(templates.map((t) => [t.family, t])).values()];
  console.log(
    "Checking profile unknowns, summary-only updates, and role migration compatibility…",
  );
  const profileOwner = await user();
  const legacyPreferences = {
    role: "rotate",
    preparation: "some",
    exclusions: ["alcohol"],
  };
  await sql(
    `select sq_upsert_profile(${quote(profileOwner)},${json({ preferences: legacyPreferences, imported_summary: "A historical summary" })});`,
  );
  // Exercise an actual upgrade with a run accepted by the old function. The
  // disposable runner already applied all migrations; reinstall only that
  // prior function/column constraint before replaying the compatible migration.
  const currentAcceptDefinition = await sql("select pg_get_functiondef('public.sq_accept_run(uuid,jsonb,text,text)'::regprocedure);", null);
  const coreMigration = await readFile(
    new URL(
      "../../supabase/migrations/20260927151042_sidequest_core.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const legacyAccept = coreMigration.match(
    /create function public\.sq_accept_run\([\s\S]*?end \$\$;/,
  )?.[0];
  assert(legacyAccept);
  await sql(
    `alter table public.quest_runs alter column selected_role set not null;\n${legacyAccept.replace("create function", "create or replace function")}`,
    null,
  );
  const basicOuting = {
    participants: 2,
    budgetMinor: 5000,
    budgetScope: "total",
    currency: "USD",
    area: "",
  };
  const historical = await rpc("sq_accept_run", profileOwner, {
    template_id: distinct[0].id,
    outing: basicOuting,
  });
  assert.equal(historical.run.selected_role, "rotate");
  assert.equal(historical.run.snapshot.role, "rotate");
  await sql(
    await readFile(
      new URL(
        "../../supabase/migrations/20260929190728_preserve_unknown_profile_role.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    null,
  );
  const historicalReload = JSON.parse(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${quote(historical.run.id)};`,
    ),
  );
  assert.deepEqual(
    historicalReload,
    historical.run,
    "Upgrading must not rewrite accepted snapshots, hashes, or historical roles",
  );
  assert.deepEqual(
    JSON.parse(
      await sql(
        `select preferences from profiles where id=${quote(profileOwner)};`,
      ),
    ),
    legacyPreferences,
    "Historical preference ambiguity must not be rewritten as certainty",
  );
  await rpc("sq_abandon_run", profileOwner, { run_id: historical.run.id });
  const missingRole = await rpc("sq_accept_run", profileOwner, {
    template_id: distinct[0].id,
    outing: basicOuting,
  });
  assert.equal(
    missingRole.run.selected_role,
    null,
    "Omitted role must not fall back to a legacy rotate default",
  );
  assert.equal(missingRole.run.snapshot.role, null);
  await rpc("sq_abandon_run", profileOwner, { run_id: missingRole.run.id });
  const unknownRole = await rpc("sq_accept_run", profileOwner, {
    template_id: distinct[0].id,
    role: "mastermind",
    outing: { ...basicOuting, role: null },
  });
  assert.equal(
    unknownRole.run.selected_role,
    null,
    "Explicit outing unknown wins over any historical top-level role",
  );
  assert.equal(unknownRole.run.snapshot.role, null);
  await deny(
    () =>
      sql(
        `update quest_runs set selected_role='rotate' where id=${quote(unknownRole.run.id)};`,
      ),
    /accepted_snapshot_immutable/,
  );
  await rpc("sq_abandon_run", profileOwner, { run_id: unknownRole.run.id });
  const explicitRotate = await rpc("sq_accept_run", profileOwner, {
    template_id: distinct[0].id,
    outing: { ...basicOuting, role: "rotate" },
  });
  assert.equal(explicitRotate.run.selected_role, "rotate");
  assert.equal(explicitRotate.run.snapshot.role, "rotate");
  await rpc("sq_abandon_run", profileOwner, { run_id: explicitRotate.run.id });
  const preferencesWithUnknowns = {
    version: 2,
    role: null,
    categories: null,
    skills: ["music"],
    exclusions: ["alcohol"],
    preparation: null,
  };
  await sql(
    `set request.jwt.claim.sub=${quote(profileOwner)}; update profiles set preferences=${json(preferencesWithUnknowns)},imported_summary='Original imported text' where id=${quote(profileOwner)};`,
    "authenticated",
  );
  const readOwnProfile = () =>
    sql(
      `set request.jwt.claim.sub=${quote(profileOwner)}; select jsonb_build_object('preferences',preferences,'summary',imported_summary) from profiles where id=${quote(profileOwner)};`,
      "authenticated",
    ).then(JSON.parse);
  assert.deepEqual(
    (await readOwnProfile()).preferences,
    preferencesWithUnknowns,
    "Nested JSON nulls survive a fresh authenticated read",
  );
  await sql(
    `set request.jwt.claim.sub=${quote(profileOwner)}; update profiles set imported_summary='Edited imported text' where id=${quote(profileOwner)};`,
    "authenticated",
  );
  assert.deepEqual(await readOwnProfile(), {
    preferences: preferencesWithUnknowns,
    summary: "Edited imported text",
  });
  await sql(
    `set request.jwt.claim.sub=${quote(profileOwner)}; update profiles set imported_summary='' where id=${quote(profileOwner)};`,
    "authenticated",
  );
  assert.deepEqual(
    await readOwnProfile(),
    { preferences: preferencesWithUnknowns, summary: "" },
    "Summary removal persists independently of confirmed preferences",
  );
  await sql(
    `set request.jwt.claim.sub=${quote(b)}; update profiles set imported_summary='Another person' where id=${quote(profileOwner)};`,
    "authenticated",
  );
  assert.equal(
    (await readOwnProfile()).summary,
    "",
    "Summary-only update remains owner-scoped by RLS",
  );
  await sql(currentAcceptDefinition, null);
  const accept = (actor, t, key, area = '') =>
    rpc(
      "sq_accept_run",
      actor,
      {
        template_id: t.id,
        outing: {
          role: "mastermind",
          participants: 3,
          budgetMinor: 5000,
          budgetScope: "total",
          currency: "USD",
          area,
        },
      },
      key,
    );
  const prepare = async (actor, t, { review = false, area = '' } = {}) => {
    const { run } = await accept(actor, t, undefined, area);
    const clips = [];
    for (let slot = 1; slot <= 3; slot++) {
      const asset = await rpc("sq_reserve_upload", actor, {
        run_id: run.id,
        slot,
        expected_bytes: 1000,
        mime: "video/mp4",
      });
      const sha = hash(asset.id);
      await rpc("sq_seal_media", actor, {
        asset_id: asset.id,
        object_key: `sealed/${actor}/${asset.id}/${sha}`,
        bytes: 1000,
        mime: "video/mp4",
        duration_ms: 12000,
        sha256: sha,
        metadata: { width: 720, height: 1280 },
      });
      clips.push({ asset_id: asset.id, start_ms: 1000, end_ms: 11000 });
    }
    const input = {
      run_id: run.id,
      clips,
      declaration: { attempted: true, consent: true },
      needs_review: review,
    };
    return { run, clips, input };
  };
  const done = async (actor, t, review = false) => {
    const x = await prepare(actor, t);
    return {
      ...x,
      result: await rpc("sq_submit_run", actor, {
        ...x.input,
        needs_review: review,
      }),
    };
  };
  const ledgerEqual = async () =>
    assert.equal(
      await scalar(
        "select count(*) from (select w.owner_id from wallets w left join reward_ledger l on l.owner_id=w.owner_id group by w.owner_id having w.xp<>coalesce(sum(l.delta) filter(where asset='xp'),0) or w.points<>coalesce(sum(l.delta) filter(where asset='points'),0)) x;",
      ),
      "0",
    );
  console.log("Checking database grants, RLS, and one-active-run concurrency…");
  assert.equal(
    await scalar(
      "select count(*) from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace n on n.oid=c.relnamespace and n.nspname=t.schemaname where t.schemaname in ('public','private') and not c.relrowsecurity;",
      null,
    ),
    "0",
  );
  assert.equal(
    await scalar(
      "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' or (n.nspname='public' and p.proname like 'sq_%')) and (p.prosecdef or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));",
      null,
    ),
    "0",
  );
  await deny(
    () =>
      scalar(
        `select sq_accept_run(${quote(a)},'{}','12345678','x');`,
        "authenticated",
      ),
    /permission denied/,
  );
  await deny(
    () =>
      scalar(
        `update wallets set points=999999 where owner_id=${quote(a)};`,
        "authenticated",
      ),
    /permission denied/,
  );
  await deny(
    () =>
      scalar(
        `set request.jwt.claim.sub=${quote(a)}; update profiles set account_status='disabled' where id=${quote(a)};`,
        "authenticated",
      ),
    /permission denied/,
  );
  await deny(
    () => scalar("select * from private.redemption_secrets;", "authenticated"),
    /permission denied/,
  );
  await deny(
    () => scalar("select * from media_assets;", "authenticated"),
    /permission denied/,
  );
  const race = await Promise.allSettled([
    accept(a, distinct[0]),
    accept(a, distinct[1]),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  const active = race.find((x) => x.status === "fulfilled").value.run;
  assert.equal(
    await scalar(
      `set request.jwt.claim.sub=${quote(b)}; select count(*) from quest_runs;`,
      "authenticated",
    ),
    "0",
  );
  await deny(
    () => rpc("sq_abandon_run", b, { run_id: active.id }),
    /not_found/,
  );
  await deny(
    () =>
      sql(`update quest_runs set snapshot='{}' where id=${quote(active.id)};`),
    /accepted_snapshot_immutable/,
  );
  await rpc("sq_abandon_run", a, { run_id: active.id });
  console.log(
    "Checking completion replay, frozen evidence, cooldown, and render leases…",
  );
  const first = await prepare(a, distinct[0]);
  const key = randomUUID();
  const results = await Promise.all([
    rpc("sq_submit_run", a, first.input, key),
    rpc("sq_submit_run", a, first.input, key),
    rpc("sq_submit_run", a, first.input),
  ]);
  assert(results.every((x) => x.run.id === first.run.id));
  assert.equal(
    await scalar(
      `select count(*) from reward_ledger where run_id=${quote(first.run.id)};`,
    ),
    "2",
  );
  await deny(
    () => rpc("sq_submit_run", a, { ...first.input, needs_review: true }, key),
    /idempotency_conflict/,
  );
  await deny(
    () =>
      rpc("sq_reserve_upload", a, {
        run_id: first.run.id,
        slot: 1,
        expected_bytes: 100,
        mime: "video/mp4",
      }),
    /evidence_frozen/,
  );
  await deny(
    () =>
      sql(
        `update quest_runs set evidence_manifest='{}' where id=${quote(first.run.id)};`,
      ),
    /evidence_immutable/,
  );
  const otherLevel = templates.find(
    (t) =>
      t.family === distinct[0].family && t.intensity !== distinct[0].intensity,
  );
  const repeat = await done(a, otherLevel);
  assert.equal(repeat.result.run.reward_decision.reason, "family_cooldown");
  const job = results[0].render_job;
  const claims = await Promise.all([
    scalar(`select sq_claim_render(${quote(job.id)});`).then((v) =>
      v ? JSON.parse(v) : null,
    ),
    scalar(`select sq_claim_render(${quote(job.id)});`).then((v) =>
      v ? JSON.parse(v) : null,
    ),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claim = claims.find(Boolean);
  await sql(
    `select sq_fail_render(${quote(job.id)},${claim.fence},'network');`,
  );
  const next = JSON.parse(
    await sql(`select sq_claim_render(${quote(job.id)});`),
  );
  assert.equal(next.fence, claim.fence + 1);
  const output = {
    object_key: `renders/${job.id}/${next.fence}/${hash(job.id)}.mp4`,
    bytes: 3000,
    mime: "video/mp4",
    duration_ms: 30000,
    sha256: hash(job.id),
  };
  await deny(
    () =>
      sql(
        `select sq_finish_render(${quote(job.id)},${claim.fence},${json(output)});`,
      ),
    /stale_render_lease/,
  );
  const ready = JSON.parse(
    await sql(
      `select sq_finish_render(${quote(job.id)},${next.fence},${json(output)});`,
    ),
  );
  assert.equal(ready.status, "ready");
  assert.equal(
    await scalar(
      `select count(*) from reward_ledger where run_id=${quote(first.run.id)};`,
    ),
    "2",
  );
  const share = await rpc("sq_create_share", a, {
    run_id: first.run.id,
    asset_id: ready.output_asset_id,
    token_hash: hash("share"),
    caption: "A private adventure, deliberately shared",
  });
  await rpc("sq_revoke_share", a, { share_id: share.id });
  assert.equal(
    await scalar(
      `select revoked_at is not null from share_links where id=${quote(share.id)};`,
    ),
    "t",
  );
  console.log("Checking four simultaneous reviewed awards under daily cap…");
  const capped = await user();
  const reviews = [];
  for (const t of distinct.slice(0, 4))
    reviews.push(await done(capped, t, true));
  assert.equal(
    await scalar(`select points from wallets where owner_id=${quote(capped)};`),
    "0",
  );
  await deny(
    () =>
      rpc("sq_review_run", a, {
        run_id: reviews[0].run.id,
        decision: "approve",
      }),
    /forbidden/,
  );
  await Promise.all(
    reviews.map((r) =>
      rpc("sq_review_run", operator, { run_id: r.run.id, decision: "approve" }),
    ),
  );
  assert.equal(
    await scalar(
      `select count(*) from quest_runs where owner_id=${quote(capped)} and (reward_decision->>'xp')::int>0;`,
    ),
    "3",
  );
  assert.equal(
    await scalar(
      `select count(*) from quest_runs where owner_id=${quote(capped)} and reward_decision->>'reason'='daily_cap';`,
    ),
    "1",
  );
  console.log("Checking explicit failed-render retry creates no second award…");
  const retryJob = repeat.result.render_job;
  for (let attempt = 0; attempt < 3; attempt++) {
    const lease = JSON.parse(
      await sql(`select sq_claim_render(${quote(retryJob.id)});`),
    );
    const failure = JSON.parse(
      await sql(
        `select sq_fail_render(${quote(retryJob.id)},${lease.fence},'network');`,
      ),
    );
    assert.equal(failure.status, attempt === 2 ? "failed" : "queued");
  }
  const retryInput = {
    run_id: repeat.run.id,
    clips: repeat.clips,
    settings: { title: repeat.run.snapshot.title },
  };
  await deny(() => rpc("sq_request_render", a, retryInput), /retry_cooldown/);
  await sql(
    `update render_jobs set updated_at=now()-interval '61 seconds' where id=${quote(retryJob.id)};`,
  );
  const manualKey = randomUUID();
  const retried = await rpc("sq_request_render", a, retryInput, manualKey);
  assert.equal(retried.status, "queued");
  assert.equal(retried.manual_retries, 1);
  assert.equal(retried.id, retryJob.id);
  assert.deepEqual(
    await rpc("sq_request_render", a, retryInput, manualKey),
    retried,
  );
  const retryLease = JSON.parse(
    await sql(`select sq_claim_render(${quote(retryJob.id)});`),
  );
  const retryOutput = {
    ...output,
    object_key: `renders/${retryJob.id}/${retryLease.fence}/${hash("retry")}.mp4`,
    sha256: hash("retry"),
  };
  const recovered = JSON.parse(
    await sql(
      `select sq_finish_render(${quote(retryJob.id)},${retryLease.fence},${json(retryOutput)});`,
    ),
  );
  assert.equal(recovered.status, "ready");
  assert.equal(
    await scalar(
      `select count(*) from reward_ledger where run_id=${quote(repeat.run.id)};`,
    ),
    "0",
  );
  console.log(
    "Checking exact UTC/cooldown boundaries and protected review flags…",
  );
  const boundary = await user();
  const historySql = (times) =>
    times
      .map(
        (time, i) =>
          `insert into quest_runs select (jsonb_populate_record(null::quest_runs,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'owner_id',${quote(boundary)}::uuid,'family_id',${quote("boundary_" + i)},'finalized_at',${time},'created_at',${time},'updated_at',${time}))).* from quest_runs r where id=${quote(first.run.id)};`,
      )
      .join("\n");
  const dayStart =
    "date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'";
  assert.equal(
    JSON.parse(
      await sql(
        `begin; ${historySql(Array(3).fill(`(${dayStart})-interval '1 microsecond'`))} select sq_eligibility(${quote(boundary)},'fresh'); rollback;`,
      ),
    ).eligible,
    true,
  );
  assert.equal(
    JSON.parse(
      await sql(
        `begin; ${historySql(Array(3).fill(`(${dayStart})`))} select sq_eligibility(${quote(boundary)},'fresh'); rollback;`,
      ),
    ).reason,
    "daily_cap",
  );
  assert.equal(
    JSON.parse(
      await sql(
        `begin; ${historySql(["now()-interval '30 days'"])} select sq_eligibility(${quote(boundary)},'boundary_0'); rollback;`,
      ),
    ).eligible,
    true,
  );
  assert.equal(
    JSON.parse(
      await sql(
        `begin; ${historySql(["now()-interval '30 days'+interval '1 microsecond'"])} select sq_eligibility(${quote(boundary)},'boundary_0'); rollback;`,
      ),
    ).reason,
    "family_cooldown",
  );
  const flaggedOwner = await user();
  const flagged = await prepare(flaggedOwner, distinct[0]);
  await rpc("sq_flag_run", operator, {
    run_id: flagged.run.id,
    reason: "fixture_integrity_check",
  });
  const frozen = await rpc("sq_submit_run", flaggedOwner, flagged.input);
  assert.equal(frozen.run.status, "review_needed");
  assert.equal(frozen.wallet.points, 0);
  await deny(
    () =>
      sql(`select sq_review_evidence(${quote(a)},${quote(flagged.run.id)});`),
    /forbidden/,
  );
  const evidence = JSON.parse(
    await sql(
      `select sq_review_evidence(${quote(operator)},${quote(flagged.run.id)});`,
    ),
  );
  assert.equal(evidence.evidence_hash, frozen.run.evidence_hash);
  await rpc("sq_delete_media", flaggedOwner, {
    asset_id: flagged.clips[0].asset_id,
  });
  assert.equal(
    await scalar(
      `select reward_decision->>'reason' from quest_runs where id=${quote(flagged.run.id)};`,
    ),
    "evidence_deleted",
  );
  const session = randomUUID();
  await sql(
    `insert into auth.sessions(id,user_id) values(${quote(session)},${quote(a)});`,
    null,
  );
  assert.equal(
    await scalar(`select sq_check_session(${quote(a)},${quote(session)});`),
    "t",
  );
  assert.equal(
    await scalar(`select sq_check_session(${quote(b)},${quote(session)});`),
    "f",
  );
  await sql(`delete from auth.sessions where id=${quote(session)};`, null);
  assert.equal(
    await scalar(`select sq_check_session(${quote(a)},${quote(session)});`),
    "f",
  );
  console.log("Checking last-stock, overspending, and consume/cancel races…");
  const sponsor = await rpc("sq_upsert_sponsor", operator, {
    name: "TEST ONLY merchant",
    area: "test",
    approved: true,
    funding_reference: "test-fixture",
  });
  console.log('Checking approved campaign matching, frozen disclosure, and paused/expired RLS…');
  const campaignInput = {
    sponsor_id: sponsor.id, title: 'TEST ONLY placement', disclosure: 'Sponsored by TEST ONLY merchant',
    area: 'test', categories: [distinct[0].category], family_ids: [distinct[0].family],
    funded: true, state: 'active', starts_at: new Date(Date.now() - 60_000).toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(), funding_reference: 'test-funded-agreement', notes: 'PRIVATE FUNDING NOTE',
  };
  await deny(() => rpc('sq_upsert_campaign', a, campaignInput), /forbidden/);
  await deny(() => rpc('sq_upsert_campaign', operator, { ...campaignInput, funded: false }), /funding_required/);
  await deny(() => rpc('sq_upsert_campaign', operator, { ...campaignInput, family_ids: ['unreviewed_family'] }), /invalid_campaign_scope/);
  const expiredCampaign = await rpc('sq_upsert_campaign', operator, { ...campaignInput, starts_at: new Date(Date.now() - 120_000).toISOString(), ends_at: new Date(Date.now() - 60_000).toISOString() });
  const campaignOwner = await user();
  const expiredMatch = await accept(campaignOwner, distinct[0], undefined, 'test');
  assert.equal(expiredMatch.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', campaignOwner, { run_id: expiredMatch.run.id });
  const campaign = await rpc('sq_upsert_campaign', operator, campaignInput);
  const reviewedAcceptance = {
    template_id: distinct[0].id,
    outing: { role: 'mastermind', participants: 3, budgetMinor: 5000, budgetScope: 'total', currency: 'USD', area: 'test' },
  };
  await deny(() => rpc('sq_accept_run', campaignOwner, { ...reviewedAcceptance, expected_campaign: null }), /campaign_changed/);
  await deny(() => rpc('sq_accept_run', campaignOwner, { ...reviewedAcceptance, expected_campaign: { id: campaign.id, version: campaign.version + 1 } }), /campaign_changed/);
  assert.equal(await scalar(`select count(*) from quest_runs where owner_id=${quote(campaignOwner)} and status in ('accepted','in_progress');`), '0');
  const reviewedAccepted = await rpc('sq_accept_run', campaignOwner, { ...reviewedAcceptance, expected_campaign: { id: campaign.id, version: campaign.version } });
  assert.equal(reviewedAccepted.run.snapshot.sponsor.campaign_id, campaign.id);
  await rpc('sq_abandon_run', campaignOwner, { run_id: reviewedAccepted.run.id });
  assert.equal(await scalar(`select count(*) from campaigns where id=${quote(campaign.id)};`, 'anon'), '1');
  assert.equal(await scalar(`select count(*) from campaigns where id=${quote(expiredCampaign.id)};`, 'anon'), '0');
  await deny(() => scalar('select * from private.campaign_operations;', 'authenticated'), /permission denied/);
  const wrongArea = await accept(campaignOwner, distinct[0], undefined, 'elsewhere');
  assert.equal(wrongArea.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', campaignOwner, { run_id: wrongArea.run.id });
  const wrongFamily = await accept(campaignOwner, distinct[1], undefined, 'test');
  assert.equal(wrongFamily.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', campaignOwner, { run_id: wrongFamily.run.id });
  const sponsored = await prepare(campaignOwner, distinct[0], { area: 'test' });
  assert.equal(sponsored.run.snapshot.sponsorDisclosure, campaignInput.disclosure);
  assert.equal(sponsored.run.snapshot.sponsor.sponsor_name, sponsor.name);
  assert.equal(sponsored.run.snapshot.sponsor.campaign_version, campaign.version);
  const frozenHash = sponsored.run.snapshot_hash;
  await rpc('sq_pause_campaign', operator, { campaign_id: campaign.id });
  assert.equal(await scalar(`select count(*) from campaigns where id=${quote(campaign.id)};`, 'anon'), '0');
  const staleCampaignOwner = await user();
  await deny(() => rpc('sq_accept_run', staleCampaignOwner, { ...reviewedAcceptance, expected_campaign: { id: campaign.id, version: campaign.version } }), /campaign_changed/);
  const reviewedNoCampaign = await rpc('sq_accept_run', staleCampaignOwner, { ...reviewedAcceptance, expected_campaign: null });
  assert.equal(reviewedNoCampaign.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', staleCampaignOwner, { run_id: reviewedNoCampaign.run.id });
  const sponsoredSubmission = await rpc('sq_submit_run', campaignOwner, { ...sponsored.input, needs_review: true });
  assert.equal(sponsoredSubmission.run.snapshot_hash, frozenHash);
  assert.equal(sponsoredSubmission.render_job.manifest.sponsorDisclosure, campaignInput.disclosure);
  assert.equal(sponsoredSubmission.run.snapshot.sponsorDisclosure, campaignInput.disclosure);
  assert.equal(sponsoredSubmission.wallet.points, 0);
  const afterPause = await accept(campaignOwner, distinct[0], undefined, 'test');
  assert.equal(afterPause.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', campaignOwner, { run_id: afterPause.run.id });
  await rpc('sq_upsert_campaign', operator, { ...campaignInput, id: campaign.id });
  await rpc('sq_upsert_sponsor', operator, { id: sponsor.id, name: sponsor.name, area: 'test', approved: false, funding_reference: 'test-fixture' });
  assert.equal(await scalar(`select count(*) from campaigns where id=${quote(campaign.id)};`, 'anon'), '0');
  const noApprovedSponsor = await accept(campaignOwner, distinct[0], undefined, 'test');
  assert.equal(noApprovedSponsor.run.snapshot.sponsorDisclosure, undefined);
  await rpc('sq_abandon_run', campaignOwner, { run_id: noApprovedSponsor.run.id });
  await deny(() => rpc('sq_upsert_campaign', operator, { ...campaignInput, id: campaign.id }), /funding_required/);
  await rpc('sq_upsert_sponsor', operator, { id: sponsor.id, name: sponsor.name, area: 'test', approved: true, funding_reference: 'test-fixture' });
  await rpc('sq_pause_campaign', operator, { campaign_id: campaign.id });
  const campaignState = JSON.parse(await sql(`select sq_operator_state(${quote(operator)});`));
  assert.equal(campaignState.campaigns.find(c => c.id === campaign.id).state, 'paused');
  assert.equal(JSON.stringify(campaignState.campaigns).includes('PRIVATE FUNDING NOTE'), false);
  await sql(
    `insert into private.role_memberships(user_id,role,merchant_id) values(${quote(merchant)},'merchant',${quote(sponsor.id)});`,
  );
  const offerInput = {
    merchant_id: sponsor.id,
    title: "TEST fixture",
    terms: "Test only",
    area: "test",
    currency: "USD",
    point_cost: 10,
    stock_total: 1,
    funded: true,
    active: true,
    starts_at: new Date(Date.now() - 60000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    funding_reference: "test-fixture",
    per_user_limit: 10,
  };
  const offer = await rpc("sq_publish_offer", operator, offerInput);
  await done(b, distinct[0]);
  const reserves = await Promise.allSettled([
    rpc("sq_reserve_reward", a, {
      offer_id: offer.id,
      offer_version: offer.version,
      area: "test",
    }),
    rpc("sq_reserve_reward", b, {
      offer_id: offer.id,
      offer_version: offer.version,
      area: "test",
    }),
  ]);
  assert.equal(reserves.filter((x) => x.status === "fulfilled").length, 1);
  const reservation = reserves.find((x) => x.status === "fulfilled").value
    .redemption;
  const token = hash("single-use");
  await sql(
    `select sq_redemption_material(${quote(reservation.owner_id)},${quote(reservation.id)},${quote(token)});`,
  );
  await deny(
    () =>
      rpc("sq_consume_redemption", wrongMerchant, {
        redemption_id: reservation.id,
        token_hash: token,
      }),
    /redemption_unavailable/,
  );
  const terminal = await Promise.allSettled([
    rpc("sq_consume_redemption", merchant, {
      redemption_id: reservation.id,
      token_hash: token,
    }),
    rpc("sq_cancel_redemption", reservation.owner_id, {
      redemption_id: reservation.id,
    }),
  ]);
  assert(terminal.some((x) => x.status === "fulfilled"));
  const state = await scalar(
    `select state from redemptions where id=${quote(reservation.id)};`,
  );
  const refunds = await scalar(
    `select count(*) from reward_ledger where redemption_id=${quote(reservation.id)} and reason='refund';`,
  );
  assert.equal(refunds, state === "consumed" ? "0" : "1");
  if (state === "consumed")
    assert.equal(
      (
        await rpc("sq_consume_redemption", merchant, {
          redemption_id: reservation.id,
          token_hash: token,
        })
      ).already_consumed,
      true,
    );
  else
    await rpc("sq_cancel_redemption", reservation.owner_id, {
      redemption_id: reservation.id,
    });
  const low = await user();
  await done(
    low,
    templates.find((t) => t.intensity === "chill"),
  );
  const o1 = await rpc("sq_publish_offer", operator, offerInput),
    o2 = await rpc("sq_publish_offer", operator, offerInput);
  const spend = await Promise.allSettled(
    [o1, o2].map((o) =>
      rpc("sq_reserve_reward", low, {
        offer_id: o.id,
        offer_version: o.version,
        area: "test",
      }),
    ),
  );
  assert.equal(spend.filter((x) => x.status === "fulfilled").length, 1);
  const held = spend.find((x) => x.status === "fulfilled").value.redemption;
  const changedOffer = await rpc("sq_publish_offer", operator, {
    ...offerInput,
    id: held.offer_id,
    point_cost: 15,
  });
  const beforeRefund = Number(
    await scalar(`select points from wallets where owner_id=${quote(low)};`),
  );
  await rpc("sq_cancel_redemption", low, { redemption_id: held.id });
  assert.equal(
    Number(
      await scalar(`select points from wallets where owner_id=${quote(low)};`),
    ),
    beforeRefund + held.point_cost,
  );
  await deny(
    () =>
      rpc("sq_reserve_reward", low, {
        offer_id: changedOffer.id,
        offer_version: changedOffer.version - 1,
        area: "test",
      }),
    /offer_changed/,
  );
  const expiringOffer = await rpc("sq_publish_offer", operator, offerInput);
  const expiring = await rpc("sq_reserve_reward", low, {
    offer_id: expiringOffer.id,
    offer_version: expiringOffer.version,
    area: "test",
  });
  const expiryHash = hash("expiry-token");
  await sql(
    `select sq_redemption_material(${quote(low)},${quote(expiring.redemption.id)},${quote(expiryHash)});`,
  );
  await deny(
    () =>
      sql(
        `update redemptions set expires_at=now()-interval '1 second' where id=${quote(expiring.redemption.id)};`,
      ),
    /redemption_terms_immutable/,
  );
  // Age the isolated fixture out of band; normal mutation attempts above are forbidden.
  await sql(
    `alter table redemptions disable trigger redemption_immutable; update redemptions set expires_at=now()-interval '1 second' where id=${quote(expiring.redemption.id)}; alter table redemptions enable trigger redemption_immutable;`,
    null,
  );
  await deny(
    () =>
      rpc("sq_consume_redemption", merchant, {
        redemption_id: expiring.redemption.id,
        token_hash: expiryHash,
      }),
    /redemption_unavailable/,
  );
  await Promise.all([
    sql("select sq_reconcile();"),
    rpc("sq_cancel_redemption", low, { redemption_id: expiring.redemption.id }),
  ]);
  assert.equal(
    await scalar(
      `select count(*) from reward_ledger where redemption_id=${quote(expiring.redemption.id)} and reason='refund';`,
    ),
    "1",
  );
  await rpc("sq_pause_offer", operator, { offer_id: expiringOffer.id });
  assert.equal(
    await scalar(
      `select count(*) from reward_offers where id=${quote(expiringOffer.id)};`,
      "anon",
    ),
    "0",
  );
  await sql(
    `update private.role_memberships set revoked_at=now() where user_id=${quote(merchant)};`,
  );
  await deny(
    () =>
      rpc("sq_consume_redemption", merchant, {
        redemption_id: reservation.id,
        token_hash: token,
      }),
    /redemption_unavailable/,
  );
  await ledgerEqual();
  assert.equal(
    await scalar(
      "select count(*) from reward_offers where stock_available<0 or stock_reserved<0 or stock_consumed<0 or stock_total<>stock_available+stock_reserved+stock_consumed;",
    ),
    "0",
  );
  console.log(
    "Checking deletion cancels work and closes unresolved review without award…",
  );
  const deleting = await user();
  const pending = await done(deleting, distinct[0], true);
  const running = JSON.parse(
    await sql(
      `select sq_claim_render(${quote(pending.result.render_job.id)});`,
    ),
  );
  const deletion = await rpc("sq_delete_account", deleting, {});
  assert.equal(deletion.status, "deleting");
  await deny(
    () =>
      sql(
        `select sq_finish_render(${quote(running.id)},${running.fence},${json({ ...output, object_key: `renders/${running.id}/${running.fence}/${hash("deleted")}.mp4` })});`,
      ),
    /stale_render_lease|account_unavailable/,
  );
  assert.equal(
    await scalar(
      `select reward_decision->>'reason' from quest_runs where id=${quote(pending.run.id)};`,
    ),
    "account_deleted",
  );
  assert.equal(
    await scalar(
      `select count(*) from media_assets where owner_id=${quote(deleting)} and state<>'deleted';`,
    ),
    "0",
  );
  assert.equal(
    await scalar(
      `set request.jwt.claim.sub=${quote(deleting)}; select count(*) from quest_runs;`,
      "authenticated",
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select sq_claim_render(${quote(pending.result.render_job.id)});`,
    ),
    "",
  );
  await deny(
    () =>
      rpc("sq_reserve_upload", deleting, {
        run_id: pending.run.id,
        slot: 1,
        expected_bytes: 100,
        mime: "video/mp4",
      }),
    /account_unavailable/,
  );
  console.log("Checking whole-run deletion races render promotion atomically…");
  console.log(
    "Checking deletion redacts content while retaining immutable economic hashes…",
  );
  const oldHashes = JSON.parse(
    await sql(
      `select jsonb_build_object('snapshot',snapshot_hash,'evidence',evidence_hash) from quest_runs where id=${quote(pending.run.id)};`,
    ),
  );
  await deny(
    () => sql(`select sq_finalize_account_deletion(${quote(a)});`),
    /deletion_not_requested/,
  );
  await deny(
    () => sql(`select sq_finalize_account_deletion(${quote(deleting)});`),
    /media_cleanup_pending/,
  );
  await sql(
    `update media_cleanup set completed_at=now() where asset_id in (select id from media_assets where owner_id=${quote(deleting)});`,
  );
  const redacted = JSON.parse(
    await sql(`select sq_finalize_account_deletion(${quote(deleting)});`),
  );
  assert.equal(redacted.ready_to_delete_auth, true);
  const retained = JSON.parse(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${quote(pending.run.id)};`,
    ),
  );
  assert.deepEqual(retained.outing, {});
  assert.deepEqual(retained.evidence_manifest, { redacted: true });
  assert.deepEqual(retained.snapshot, {
    redacted: true,
    template_id: pending.run.template_id,
    family_id: pending.run.family_id,
  });
  assert.equal(retained.snapshot_hash, oldHashes.snapshot);
  assert.equal(retained.evidence_hash, oldHashes.evidence);
  assert.equal(retained.reward_decision.reason, "account_deleted");
  assert.equal(
    await scalar(
      `select count(*) from private.idempotency_records where actor_id=${quote(deleting)};`,
    ),
    "0",
  );
  assert.equal(
    await scalar(
      `select count(*) from private.audit_events where actor_id=${quote(deleting)} and action='account_content_redacted';`,
    ),
    "1",
  );
  await sql(`select sq_finalize_account_deletion(${quote(deleting)});`);
  assert.equal(
    await scalar(
      `select count(*) from private.audit_events where actor_id=${quote(deleting)} and action='account_content_redacted';`,
    ),
    "1",
  );
  await deny(
    () =>
      sql(
        `update quest_runs set privacy_redacted_at=now(),snapshot='{"redacted":true}' where id=${quote(first.run.id)};`,
      ),
    /redaction_requires_deletion/,
  );
  const eraseOwner = await user();
  const eraseRun = await done(eraseOwner, distinct[1], true);
  const eraseLease = JSON.parse(
    await sql(
      `select sq_claim_render(${quote(eraseRun.result.render_job.id)});`,
    ),
  );
  const eraseOutput = {
    ...output,
    object_key: `renders/${eraseLease.id}/${eraseLease.fence}/${hash("erase-race")}.mp4`,
    sha256: hash("erase-race"),
  };
  const eraseRace = await Promise.allSettled([
    rpc("sq_delete_run_media", eraseOwner, { run_id: eraseRun.run.id }),
    sql(
      `select sq_finish_render(${quote(eraseLease.id)},${eraseLease.fence},${json(eraseOutput)});`,
    ),
  ]);
  assert.equal(eraseRace[0].status, "fulfilled");
  assert.equal(
    await scalar(
      `select count(*) from media_assets where run_id=${quote(eraseRun.run.id)} and state<>'deleted';`,
    ),
    "0",
  );
  assert.equal(
    await scalar(
      `select count(*) from render_jobs where run_id=${quote(eraseRun.run.id)} and status in ('queued','processing');`,
    ),
    "0",
  );
  assert.equal(
    await scalar(
      `select reward_decision->>'reason' from quest_runs where id=${quote(eraseRun.run.id)};`,
    ),
    "evidence_deleted",
  );
  await deny(
    () => rpc("sq_delete_run_media", b, { run_id: eraseRun.run.id }),
    /not_found/,
  );
  console.log(
    "Checking bounded retention preserves failed exports and removes expired sources…",
  );
  await sql(
    `alter table media_assets disable trigger asset_immutable; update media_assets set created_at=now()-interval '31 days' where run_id in (${quote(first.run.id)},${quote(repeat.run.id)}) and kind='source'; alter table media_assets enable trigger asset_immutable;`,
    null,
  );
  const preservedJob = await rpc("sq_request_render", a, {
    run_id: repeat.run.id,
    clips: repeat.clips,
    settings: { title: "A different edit" },
  });
  const preserveLease = JSON.parse(
    await sql(`select sq_claim_render(${quote(preservedJob.id)});`),
  );
  await sql(
    `select sq_fail_render(${quote(preservedJob.id)},${preserveLease.fence},'encode_failed');`,
  );
  // First run has a valid ready reel. Repeat has a failed edit, so its sources stay accessible.
  await sql("select sq_schedule_retention();");
  assert.equal(
    await scalar(
      `select count(*) from media_assets where run_id=${quote(first.run.id)} and kind='source' and state='deleted';`,
    ),
    "3",
  );
  assert.equal(
    await scalar(
      `select count(*) from media_assets where run_id=${quote(repeat.run.id)} and kind='source' and state='sealed';`,
    ),
    "3",
  );
  assert.equal(
    await scalar(
      `select state from media_assets where id=${quote(ready.output_asset_id)};`,
    ),
    "sealed",
  );
  await deny(
    () =>
      rpc("sq_request_render", a, { run_id: first.run.id, clips: first.clips }),
    /invalid_evidence/,
  );
  await ledgerEqual();
  assert.deepEqual(
    JSON.parse(await sql(`select sq_wallet_audit(${quote(operator)});`)),
    [],
  );
  await runCommunityTests(sql);
  await runSocialTests(sql);
  await runSeriesTests(sql);
  await runRecordingSessionTests(sql);
  console.log(
    "PASS: 1113 seeds, real RLS/privileges, transactions, concurrent acceptance/awards/stock/spending/consumption, idempotency, evidence, fenced render, share revoke, deletion, ledger reconciliation.",
  );
}
