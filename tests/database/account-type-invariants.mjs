import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

export async function runAccountTypeTests(sql) {
  console.log(
    "Checking account intent upgrade, owner persistence and unchanged brand approval…",
  );
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const users = Array.from({ length: 6 }, () => randomUUID());
  const [approved, pending, rejected, operator, disabled, personal] = users;
  for (const id of users) {
    await sql(`insert into auth.users(id) values(${q(id)});`, null);
    await sql(`select sq_upsert_profile(${q(id)},'{}');`);
  }
  for (const [id, state] of [
    [approved, "approved"],
    [pending, "pending"],
    [rejected, "rejected"],
    [disabled, "approved"],
  ]) {
    await sql(
      `insert into business_profiles(user_id,name,website,contact_email,state) values(${q(id)},'Upgrade fixture','https://example.com','fixture@example.com',${q(state)});`,
    );
  }
  await sql(
    `insert into private.role_memberships(user_id,role) values(${q(operator)},'operator'); update profiles set account_status='disabled' where id=${q(disabled)};`,
  );
  // Reconstruct the pre-migration column shape on this disposable database and
  // apply the actual new migration over real approved/pending/rejected records.
  await sql("alter table public.profiles drop column account_type;", null);
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20261001173038_account_type_intent.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await sql(migration, null);
  const readType = async (id) =>
    JSON.parse(
      await sql(
        `select to_jsonb(p)->'account_type' from profiles p where id=${q(id)};`,
      ),
    );
  assert.equal(await readType(approved), "brand");
  for (const id of [pending, rejected, operator, disabled, personal])
    assert.equal(await readType(id), null);
  const writeType = (actor, target, value) =>
    sql(
      `set request.jwt.claim.sub=${q(actor)}; update profiles set account_type=${value === null ? "null" : q(value)} where id=${q(target)};`,
      "authenticated",
    );
  await writeType(approved, approved, "personal");
  assert.equal(await readType(approved), "personal");
  await writeType(personal, approved, "brand");
  assert.equal(
    await readType(approved),
    "personal",
    "Another account cannot change the owner's choice",
  );
  await assert.rejects(
    () => writeType(personal, personal, "operator"),
    /account_type_check/,
  );
  await writeType(personal, personal, "brand");
  assert.equal(await readType(personal), "brand");
  const me = JSON.parse(
    await sql(`select sq_community_read(${q(personal)},'me','{}');`),
  );
  assert.equal(me.accountType, "brand");
  assert.equal(me.brand, null);
  assert.deepEqual(me.roles, []);
  await assert.rejects(
    () =>
      sql(
        `select sq_community_mutate(${q(personal)},'offer_create','{}',${q(randomUUID())},'fixture-hash');`,
      ),
    /brand_approval_required/,
  );
  assert.equal(
    await sql(
      `select count(*) from private.role_memberships where user_id=${q(personal)};`,
    ),
    "0",
  );
  assert.equal(
    await sql(
      `select count(*) from business_profiles where user_id=${q(personal)};`,
    ),
    "0",
  );
  await sql(
    `set request.jwt.claim.sub=${q(personal)}; update profiles set imported_summary='Separate edit' where id=${q(personal)};`,
    "authenticated",
  );
  assert.equal(
    await readType(personal),
    "brand",
    "Unrelated profile edits preserve account intent",
  );
  await writeType(personal, personal, null);
  assert.equal(await readType(personal), null);
  assert.equal(
    JSON.parse(await sql(`select sq_community_read(${q(approved)},'me','{}');`))
      .accountType,
    "personal",
  );
  const ids = users.map(q).join(",");
  await sql(
    `delete from private.role_memberships where user_id in (${ids}); delete from business_profiles where user_id in (${ids}); delete from wallets where owner_id in (${ids}); delete from profiles where id in (${ids}); delete from auth.users where id in (${ids});`,
    null,
  );
}
