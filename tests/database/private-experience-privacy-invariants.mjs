import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function runPrivateExperiencePrivacyTests(sql) {
  console.log(
    "Checking private plan RLS and deletion of generated content and caches…",
  );
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const rpc = (name, actor, input = {}, key = randomUUID(), digest) =>
    sql(
      `select public.${name}(${q(actor)},${json(input)},${q(key)},${q(digest || createHash("sha256").update(JSON.stringify(input)).digest("hex"))});`,
    ).then(JSON.parse);
  const user = async () => {
    const id = randomUUID();
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
    return id;
  };
  const owner = await user(),
    other = await user();
  const base = JSON.parse(
    await sql(
      "select content from quest_templates where published and category='daytime' and intensity='chill' order by id limit 1;",
    ),
  );
  const outing = {
    category: "daytime",
    intensity: "chill",
    group: "solo",
    participants: 1,
    setting: "home",
    budgetMinor: 0,
    budgetScope: "total",
    currency: "USD",
    area: "Private fixture area",
    role: null,
    durationMinutes: 30,
  };
  const input = {
    quest: {
      ...base,
      privateGenerated: true,
      title: "Private fixture memory",
      award: { xp: 0, points: 0 },
      cost: {
        minMinor: 0,
        maxMinor: 0,
        scope: "total",
        venueCostUnknown: false,
      },
      arrangementRequired: false,
      adultOnly: false,
      requiresVolunteer: false,
      durationMinutes: 5,
    },
    mechanic: "privacy_fixture",
    outing,
    location: {
      name: "Private fixture location",
      latitude: 40.7,
      longitude: -74,
    },
    provider: "openai",
    model: "privacy-test",
  };
  const proposal = await rpc("sq_store_private_proposal", owner, input);
  const untouched = await rpc("sq_store_private_proposal", other, input);
  const template = proposal.quest.id;
  const readOwn = (actor) =>
    sql(
      `set request.jwt.claim.sub=${q(actor)}; select count(*) from private_quest_proposals where template_id=${q(template)};`,
      "authenticated",
    );
  assert.equal(await readOwn(owner), "1");
  assert.equal(await readOwn(other), "0");
  await assert.rejects(
    () => sql("select * from private_quest_proposals;", "anon"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      sql(
        "select * from private.experience_discovery_requests;",
        "authenticated",
      ),
    /permission denied/,
  );
  assert.equal(
    await sql(
      "select relrowsecurity from pg_class where oid='private.experience_discovery_requests'::regclass;",
      null,
    ),
    "t",
  );
  await sql(
    `update profiles set account_status='disabled' where id=${q(owner)};`,
  );
  assert.equal(
    await readOwn(owner),
    "0",
    "A stale JWT cannot read disabled-account plans",
  );
  await sql(
    `update profiles set account_status='active' where id=${q(owner)};`,
  );
  assert.equal(
    await readOwn(owner),
    "1",
    "Disabling an account does not erase its plans",
  );
  await assert.rejects(
    () => sql(`select private.clear_private_experiences(${q(owner)});`),
    /deletion_not_requested/,
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_templates set title='Edited private text' where id=${q(template)};`,
      ),
    /template_version_immutable/,
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_templates set title='Deleted private experience',content='{"redacted":true,"privateGenerated":true}' where id=${q(template)};`,
      ),
    /template_version_immutable/,
  );
  const run = await rpc("sq_accept_private_run", owner, {
    template_id: template,
    outing,
  });
  const key = randomUUID(),
    digest = "privacy-request-hash";
  await rpc("sq_reserve_experience_discovery", owner, {}, key, digest);
  await rpc(
    "sq_finish_experience_discovery",
    owner,
    { response: { proposals: [proposal] } },
    key,
    digest,
  );
  assert.equal(
    await sql(
      `select count(*) from private.experience_discovery_requests where owner_id=${q(owner)} and response is not null;`,
    ),
    "1",
  );
  assert.equal(
    await sql(
      `select count(*) from private.idempotency_records where actor_id=${q(owner)} and operation in ('private_proposal','accept_private_run');`,
    ),
    "2",
  );

  const deletion = await rpc("sq_delete_account", owner);
  assert.equal(deletion.status, "deleting");
  assert.equal(await readOwn(owner), "0");
  assert.equal(
    await sql(
      `select count(*) from private_quest_proposals where owner_id=${q(owner)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.experience_discovery_requests where owner_id=${q(owner)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.idempotency_records where actor_id=${q(owner)} and operation in ('private_proposal','accept_private_run');`,
    ),
    "0",
  );
  const tombstone = JSON.parse(
    await sql(
      `select jsonb_build_object('title',title,'content',content,'published',published) from quest_templates where id=${q(template)};`,
    ),
  );
  assert.deepEqual(tombstone, {
    title: "Deleted private experience",
    content: { redacted: true, privateGenerated: true },
    published: false,
  });
  assert.equal(
    await sql(
      `select title from quest_templates where id=${q(untouched.quest.id)};`,
    ),
    input.quest.title,
    "Deletion is scoped to its owner",
  );
  assert.equal(
    await sql(
      `select count(*) from private_quest_proposals where owner_id=${q(other)};`,
    ),
    "1",
  );
  await assert.rejects(
    () => rpc("sq_store_private_proposal", owner, input),
    /account_unavailable/,
  );
  await assert.rejects(
    () =>
      rpc(
        "sq_finish_experience_discovery",
        owner,
        { response: { proposals: [proposal] } },
        key,
        digest,
      ),
    /account_unavailable/,
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_templates set title='Restored private text' where id=${q(template)};`,
      ),
    /template_version_immutable/,
  );
  await assert.rejects(
    () =>
      sql(`update quest_templates set published=true where id=${q(template)};`),
    /private_template_cannot_publish/,
  );

  await sql(`select sq_finalize_account_deletion(${q(owner)});`);
  await sql(`select sq_finalize_account_deletion(${q(owner)});`);
  const redactedRun = JSON.parse(
    await sql(
      `select to_jsonb(r) from quest_runs r where id=${q(run.run.id)};`,
    ),
  );
  assert.equal(redactedRun.snapshot.redacted, true);
  assert.equal(redactedRun.snapshot_hash, run.run.snapshot_hash);
  assert.equal(
    redactedRun.template_id,
    template,
    "Deletion preserves the run's opaque foreign key",
  );
  assert.equal(
    await sql(
      `select count(*) from private.idempotency_records where actor_id=${q(owner)};`,
    ),
    "0",
  );
  await assert.rejects(
    () =>
      sql(
        `update quest_templates set title='Changed catalog text' where id=${q(base.id)};`,
      ),
    /template_version_immutable/,
  );
  await sql(`select private.clear_private_experiences(${q(owner)});`);

  // Exercise the migration's backfill against an account whose deletion began
  // before this cleanup trigger existed, including an unused generated plan.
  const legacyOwner = await user();
  const legacyProposal = await rpc(
    "sq_store_private_proposal",
    legacyOwner,
    input,
  );
  await rpc(
    "sq_reserve_experience_discovery",
    legacyOwner,
    {},
    randomUUID(),
    digest,
  );
  await sql(
    `begin;
    alter table profiles disable trigger private_experience_account_cleanup;
    update profiles set account_status='deleting' where id=${q(legacyOwner)};
    alter table profiles enable trigger private_experience_account_cleanup;
    commit;`,
    null,
  );
  assert.equal(
    await sql(
      `select count(*) from private_quest_proposals where owner_id=${q(legacyOwner)};`,
    ),
    "1",
  );
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20261001214937_private_experience_account_privacy.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const backfill = migration.match(
    /do \$\$ declare actor uuid;[\s\S]*?end \$\$;/,
  )?.[0];
  assert(backfill);
  await sql(backfill, null);
  assert.equal(
    await sql(
      `select count(*) from private_quest_proposals where owner_id=${q(legacyOwner)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from private.experience_discovery_requests where owner_id=${q(legacyOwner)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select content->>'redacted' from quest_templates where id=${q(legacyProposal.quest.id)};`,
    ),
    "true",
  );
}
