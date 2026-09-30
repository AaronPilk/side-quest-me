/**
 * Generate reviewable quest recipe drafts from the idea library.
 *
 *   node scripts/generate-quest-ideas.mjs --count 3
 *   node scripts/generate-quest-ideas.mjs --category late_night --setting home --group friends
 *   node scripts/generate-quest-ideas.mjs --seed 2026-10-01 --budget 0 --minutes 60 --exclude strangers,alcohol
 *   node scripts/generate-quest-ideas.mjs --variants      # print each authored, validated variant
 *   node scripts/generate-quest-ideas.mjs --json > drafts.json
 *
 * Output is a DRAFT for editorial review. Nothing here touches shared/catalog.ts,
 * supabase/seed.sql or any migration. To publish, add the reviewed recipe to
 * shared/activity-recipes.ts and create a new migration.
 */
import { loadQuestIdeas } from "./quest-ideas-loader.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : (args[index + 1] ?? "");
};
const has = (name) => args.includes(`--${name}`);
if (has("help")) {
  console.log(
    "Options: --count N --seed S --category C --intensity I --setting S --group G --minutes M --budget CENTS --exclude a,b --theme t,u --variants --json --coverage",
  );
  process.exit(0);
}
const {
  questIdeas,
  generateQuestRecipes,
  draftVariants,
  ideaCoverage,
  questVariantSchema,
} = loadQuestIdeas();

if (has("coverage")) {
  console.log(JSON.stringify(ideaCoverage(questIdeas), null, 2));
  process.exit(0);
}
const constraints = {
  count: Number(flag("count") ?? 3),
  seed: flag("seed"),
  category: flag("category"),
  intensity: flag("intensity"),
  setting: flag("setting"),
  group: flag("group"),
  maxMinutes: flag("minutes") ? Number(flag("minutes")) : undefined,
  budgetMinor: flag("budget") ? Number(flag("budget")) : undefined,
  exclusions: flag("exclude")?.split(",").filter(Boolean),
  themes: flag("theme")?.split(",").filter(Boolean),
};
for (const key of Object.keys(constraints))
  if (constraints[key] === undefined) delete constraints[key];

const drafts = generateQuestRecipes(constraints, questIdeas);
const validated = drafts.map((draft) => {
  const variants = draftVariants(draft).map((variant) =>
    questVariantSchema.parse(variant),
  );
  return { draft, variants };
});
if (has("json")) {
  console.log(
    JSON.stringify(
      validated.map(({ draft, variants }) => ({
        ...draft,
        ...(has("variants") ? { variants } : { variantCount: variants.length }),
      })),
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!validated.length) {
  console.log(
    "No library idea fits those constraints. Loosen one filter or add ideas.",
  );
  process.exit(0);
}
for (const { draft, variants } of validated) {
  console.log(
    `\n# ${draft.title}  (${draft.category} · from idea ${draft.ideaId})`,
  );
  console.log(`Action:   ${draft.action}`);
  console.log(`Evidence: ${draft.evidence}`);
  console.log("Briefs:");
  draft.prompts.forEach((prompt, index) =>
    console.log(`  ${index + 1}. ${prompt}`),
  );
  console.log(
    `Tags: interests=${draft.interests.join(",")} settings=${draft.settings.join(",")} conflicts=${draft.conflicts.join(",") || "none"}`,
  );
  console.log("Review before publishing:");
  for (const note of draft.reviewNotes) console.log(`  - ${note}`);
  console.log(
    `Validated ${variants.length} catalog variants (${variants[0].id} … ${variants.at(-1).id}).`,
  );
  if (has("variants"))
    for (const variant of variants)
      console.log(`  ${variant.id}: ${variant.title} — ${variant.hook}`);
}
