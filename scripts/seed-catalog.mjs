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
  // Compile these two local fixture modules only; this never executes imported profile text.
  for (const name of ["domain", "catalog"]) {
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
        'require("./domain")',
        `require(${JSON.stringify(join(temporary, "domain.cjs"))})`,
      );
    writeFileSync(join(temporary, `${name}.cjs`), output);
  }
  const { catalog } = require(join(temporary, "catalog.cjs"));
  const { questVariantSchema } = require(join(temporary, "domain.cjs"));
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const rows = catalog.map((raw) => {
    const quest = questVariantSchema.parse(raw);
    return `(${quote(quest.id)}, ${quote(quest.familyId)}, ${quest.version}, ${quote(quest.category)}, ${quote(quest.intensity)}, ${quote(quest.title)}, ${quote(JSON.stringify(quest))}::jsonb, true)`;
  });
  const sql = `-- Generated from shared/catalog.ts by node scripts/seed-catalog.mjs.\n-- Authored quest fixtures only. No sponsors, merchant inventory, wallets, or redeemable offers.\n-- Published versions are immutable; new editorial content needs a new version and ID.\ninsert into public.quest_templates (id, family_id, version, category, intensity, title, content, published) values\n${rows.join(",\n")}\non conflict (id) do nothing;\n`;
  writeFileSync(join(root, "supabase", "seed.sql"), sql);
  console.log(
    `Wrote ${catalog.length} authored quest variants to supabase/seed.sql`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
