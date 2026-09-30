/**
 * Ingest a raw pool of side-quest ideas into reviewable candidates.
 *
 *   node scripts/ingest-quest-ideas.mjs                       # research/quest-ideas/raw-pool.json
 *   node scripts/ingest-quest-ideas.mjs path/to/new-pool.json # any [{idea|text, source, sourceUrl, id?}]
 *
 * Writes research/quest-ideas/candidates.json and prints a summary. It never
 * edits shared/quest-ideas.ts: a person promotes candidates into the library by
 * writing them in Sidequest's own words with real tags.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQuestIdeas } from "./quest-ideas-loader.mjs";
import { ingest } from "./quest-ideas-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(
  process.argv[2] || join(root, "research", "quest-ideas", "raw-pool.json"),
);
const output = join(root, "research", "quest-ideas", "candidates.json");
const rawPool = JSON.parse(readFileSync(input, "utf8"));
if (!Array.isArray(rawPool))
  throw new Error("The raw pool must be a JSON array.");
const { questIdeas } = loadQuestIdeas();
const result = ingest(rawPool, questIdeas);
writeFileSync(
  output,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      input: input.replace(root + "/", ""),
      libraryIdeas: questIdeas.length,
      summary: result.summary,
      candidates: result.candidates,
      duplicates: result.duplicates,
    },
    null,
    1,
  ),
);
const { summary } = result;
console.log(
  `Read ${summary.raw} raw ideas → ${summary.unique} unique (${summary.duplicates} near-duplicates folded).`,
);
console.log(
  `${summary.covered} already covered by the library, ${summary.needsReview} flagged for review, ${summary.new} new candidates.`,
);
console.log(`Wrote ${output.replace(root + "/", "")}`);
const preview = result.candidates.filter((c) => c.status === "new").slice(0, 8);
if (preview.length) {
  console.log("\nFirst new candidates:");
  for (const c of preview)
    console.log(
      `- [${c.suggested.category}/${c.suggested.scope}] ${c.text} (${c.source})`,
    );
}
