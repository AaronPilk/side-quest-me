/**
 * Compiles the shared idea library for Node CLIs, the same way seed-catalog.mjs
 * compiles the catalog: a local transpile of the exact TypeScript the app ships.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const MODULES = ["places", "domain", "activity-recipes", "quest-ideas"];

export function loadQuestIdeas() {
  const temporary = mkdtempSync(join(tmpdir(), "sidequest-ideas-"));
  try {
    for (const name of MODULES) {
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
          /require\("\.\/(domain|places|activity-recipes|quest-ideas)"\)/g,
          (_match, dependency) =>
            `require(${JSON.stringify(join(temporary, `${dependency}.cjs`))})`,
        );
      writeFileSync(join(temporary, `${name}.cjs`), output);
    }
    const ideas = require(join(temporary, "quest-ideas.cjs"));
    const domain = require(join(temporary, "domain.cjs"));
    return { ...ideas, questVariantSchema: domain.questVariantSchema };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
