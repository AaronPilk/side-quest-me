import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function runActivityCatalogTests(sql) {
  console.log(
    "Checking activity variant keys, immutable history, and migration replay…",
  );
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260930160717_expanded_activity_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const digest = () =>
    sql(
      "select md5(string_agg(id || content::text, ',' order by id)) from quest_templates where variant_key='default' or version=1;",
    );
  const before = await digest();
  await sql(migration, null);
  await sql(
    await readFile(
      new URL(
        "../../supabase/migrations/20260930203052_activity_instructions_v2.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    null,
  );
  await sql(
    await readFile(new URL("../../supabase/seed.sql", import.meta.url), "utf8"),
    null,
  );
  assert.equal(await digest(), before);
  assert.equal(
    await sql(
      "select count(*) from quest_templates where variant_key='default';",
    ),
    "33",
  );
  assert.equal(
    await sql(
      "select count(*) from quest_templates where variant_key<>'default';",
    ),
    "2160",
  );
  assert.equal(
    await sql(
      "select count(*) from quest_templates where variant_key<>'default' and published and version=2;",
    ),
    "1080",
  );
  assert.equal(
    await sql(
      "select count(*) from quest_templates where variant_key<>'default' and not published and version=1;",
    ),
    "1080",
  );
  assert.equal(
    await sql(
      "select count(distinct family_id) from quest_templates where variant_key<>'default';",
    ),
    "60",
  );
  assert.equal(
    await sql(
      "select count(*) from quest_templates where family_id='activity_date_photo_duet' and intensity='full_send' and version=1;",
    ),
    "6",
  );
  assert.equal(
    await sql(
      "select count(*) from quest_templates where variant_key is distinct from coalesce(content->>'variantKey','default');",
    ),
    "0",
  );
  assert.equal(
    await sql(
      "select relrowsecurity from pg_class where oid='public.quest_templates'::regclass;",
    ),
    "t",
  );
  await assert.rejects(
    sql(
      `insert into quest_templates(id,family_id,version,category,intensity,title,content,published,variant_key)
    select 'catalog_duplicate_probe_v1',family_id,version,category,intensity,title,content,false,variant_key
    from quest_templates where id='activity_date_photo_duet_alpha_full_send_v1';`,
      null,
    ),
    /quest_templates_family_intensity_variant_version_key/,
  );
  await assert.rejects(
    sql(
      `insert into quest_templates(id,family_id,version,category,intensity,title,content,published,variant_key)
    select 'catalog_key_mismatch_probe_v1',family_id,version,category,intensity,title,content,false,'incorrect'
    from quest_templates where id='activity_date_photo_duet_alpha_full_send_v1';`,
      null,
    ),
    /quest_templates_variant_key_matches_content/,
  );
  await assert.rejects(
    sql(
      "update quest_templates set variant_key='changed' where id='activity_date_photo_duet_alpha_full_send_v1';",
      null,
    ),
    /template_version_immutable/,
  );
  console.log(
    "PASS: 1080 current activity variants, 1113 historical rows unchanged, valid family/key/version uniqueness, content consistency, RLS, immutable keys, and idempotent migration/seed.",
  );
}
