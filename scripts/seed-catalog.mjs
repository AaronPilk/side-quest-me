import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const temporary = mkdtempSync(join(tmpdir(), "sidequest-catalog-"));
try {
  // Compile these local catalog dependencies only; this never executes imported profile text.
  for (const name of ["places", "domain", "activity-recipes", "catalog"]) {
    let output = ts.transpileModule(
      readFileSync(join(root, "shared", `${name}.ts`), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText;
    output = output
      .replace(
        'require("zod")',
        `require(${JSON.stringify(require.resolve("zod"))})`,
      )
      .replace(
        /require\("\.\/(domain|places|activity-recipes)"\)/g,
        (_match, dependency) =>
          `require(${JSON.stringify(join(temporary, `${dependency}.cjs`))})`,
      );
    writeFileSync(join(temporary, `${name}.cjs`), output);
  }
  const { catalog } = require(join(temporary, "catalog.cjs"));
  const { historicalActivityCatalog } = require(
    join(temporary, "activity-recipes.cjs"),
  );
  const { questVariantSchema } = require(join(temporary, "domain.cjs"));
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const rowFor = (raw, keyed = false) => {
    const quest = questVariantSchema.parse(raw);
    return `(${quote(quest.id)}, ${quote(quest.familyId)}, ${quest.version}, ${quote(quest.category)}, ${quote(quest.intensity)}, ${quote(quest.title)}, ${quote(JSON.stringify(quest))}::jsonb, true${keyed ? `, ${quote(quest.variantKey ?? "default")}` : ""})`;
  };
  const sqlFor = (variants, keyed = false) =>
    `-- Generated from shared/catalog.ts by node scripts/seed-catalog.mjs.\n-- Authored activity variations, not live events or sourced venue inventory.\n-- No sponsors, merchant inventory, wallets, or redeemable offers.\n-- Published versions are immutable; new editorial content needs a new version and ID.\ninsert into public.quest_templates (id, family_id, version, category, intensity, title, content, published${keyed ? ", variant_key" : ""}) values\n${variants.map((quest) => rowFor(quest, keyed)).join(",\n")}\non conflict (id) do nothing;\n`;
  const additions = catalog.filter((quest) => quest.variantKey);
  const retireSuperseded = `-- Publication flags may change; historical content and accepted run snapshots do not.\nupdate public.quest_templates set published=false where id=any(array[${historicalActivityCatalog.map((quest) => quote(quest.id)).join(",")}]);\n`;
  writeFileSync(
    join(root, "supabase", "seed.sql"),
    sqlFor(catalog.filter((quest) => !quest.variantKey)) +
      "\n" +
      sqlFor(historicalActivityCatalog, true) +
      "\n" +
      sqlFor(additions, true) +
      "\n" +
      retireSuperseded,
  );
  console.log(
    `Wrote ${catalog.length} current and ${historicalActivityCatalog.length} historical quest variants to supabase/seed.sql`,
  );
  if (process.argv.includes("--activity-migration"))
    throw new Error(
      "The v1 activity migration is published and frozen. Use --activity-revision-migration with a new CLI-created activity_instructions_v2 migration.",
    );
  const migrationIndex = process.argv.indexOf("--activity-revision-migration");
  if (migrationIndex !== -1) {
    const path = resolve(root, process.argv[migrationIndex + 1] || "");
    if (
      !path.startsWith(join(root, "supabase", "migrations") + "/") ||
      !path.endsWith("_activity_instructions_v2.sql")
    ) {
      throw new Error(
        "Pass the new migration created with supabase migration new activity_instructions_v2.",
      );
    }
    writeFileSync(path, `${sqlFor(additions, true)}\n${retireSuperseded}`);
    console.log(`Wrote ${additions.length} additive variants to ${path}`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
