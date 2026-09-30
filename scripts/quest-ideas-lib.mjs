/**
 * Pure helpers for the idea pipeline, shared by the CLIs and the unit tests.
 * No file or network access here.
 */

const STOP = new Set(
  "a an the and or of to in on at for with your you yourself own new one from that this it its into by is are be do go get make take try have has out up as if than then so not no".split(
    " ",
  ),
);
/** Lowercase word bag with light stemming, for near-duplicate detection. */
export function tokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word))
      .map((word) =>
        word
          .replace(/(ing|ies|ed|es|s)$/, (suffix) =>
            suffix === "ies" ? "y" : "",
          )
          .replace(/(ing|ed)$/, ""),
      )
      .filter(Boolean),
  );
}
/** Overlap coefficient (shared ÷ smaller bag) so a short raw idea still matches
 * a longer library entry that contains it; very short bags fall back to Jaccard
 * so one shared word cannot count as a match. */
export function similarity(a, b) {
  const left = tokens(a),
    right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  const smallest = Math.min(left.size, right.size);
  return smallest >= 4
    ? shared / smallest
    : shared / (left.size + right.size - shared);
}
export function normalizeIdea(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/^[-–•\d.)\s]+/, "")
    .trim()
    .replace(/\.$/, "");
}

const RULES = [
  // [regex, patch] – first matching category rule wins; the rest accumulate.
  [
    /\b(date|partner|couple|romance|anniversary)\b/i,
    { category: "date_night" },
  ],
  [
    /\b(midnight|night|sunset|stargaz|dark|after dark|evening)\b/i,
    { category: "late_night", themes: ["night"] },
  ],
  [
    /\b(stranger|barista|neighbor|neighbour|interview|compliment|haggle|ask (?:a|an|someone))\b/i,
    {
      category: "street_challenges",
      themes: ["strangers"],
      conflicts: ["strangers"],
    },
  ],
  [
    /\b(open mic|perform|karaoke|costume|dress code|party|ceremony|award)\b/i,
    { category: "demon", themes: ["performance"] },
  ],
  [
    /\b(cook|bake|recipe|meal|dinner|restaurant|cafe|coffee|croissant|ice cream|food|eat|taste|snack|cocktail|tea)\b/i,
    { themes: ["food"], interests: ["cooking"] },
  ],
  [
    /\b(walk|hike|cycle|bike|run|skate|swim|climb|jump|dance|sports?)\b/i,
    { themes: ["movement"], interests: ["sports"] },
  ],
  [
    /\b(draw|paint|craft|origami|scrapbook|photo|print|make|build|sew|knit|write|poem|journal)\b/i,
    { themes: ["creative"], interests: ["making"] },
  ],
  [
    /\b(learn|skill|lesson|class|workshop|practice|master|teach)\b/i,
    { themes: ["skill"], interests: ["skill_reveals"] },
  ],
  [
    /\b(explore|neighborhood|neighbourhood|town|city|route|bus|train|transit|ferry|map|museum|library|landmark|building)\b/i,
    { themes: ["explore"], interests: ["local_knowledge"] },
  ],
  [
    /\b(park|forest|nature|garden|plant|flower|bird|cloud|river|canal|beach|sunrise|sky|rain)\b/i,
    { themes: ["nature"] },
  ],
  [
    /\b(kind|thank|gift|volunteer|review|letter|call|text|message|friend|family)\b/i,
    { themes: ["kindness"] },
  ],
  [
    /\b(childhood|kid|used to|old|first-ever|first ever|reclaim|memory|nostalg)\b/i,
    { themes: ["nostalgia"] },
  ],
  [
    /\b(rank|rate|score|compare|versus|best|worst|power ranking)\b/i,
    { themes: ["ranking"], interests: ["competitive"] },
  ],
  [
    /\b(coin|dice|random|blind|whatever|chance|spin|lottery)\b/i,
    { themes: ["chance"], interests: ["spontaneous"] },
  ],
  [
    /\b(game|puzzle|crossword|sudoku|trick|quiz|escape room|lego)\b/i,
    { interests: ["games"] },
  ],
  [
    /\b(music|song|playlist|album|genre|instrument|jazz|concert|gig)\b/i,
    { interests: ["music"] },
  ],
  [
    /\b(alcohol|beer|wine|pub crawl|bar crawl|drinks?)\b/i,
    { conflicts: ["alcohol"] },
  ],
  [
    /\b(skydiv|climb|marathon|boxing|kickbox|axe|slingshot|motorcycle|cold shower)\b/i,
    { conflicts: ["physical_challenges"], intensity: "full_send" },
  ],
  [
    /\b(eat every|every .* in your city|challenge)\b/i,
    { conflicts: ["food_challenges"] },
  ],
  [
    /\b(trip|travel|abroad|weekend getaway|day trip|overnight|another (?:town|city))\b/i,
    { conflicts: ["travel_outside_area"], scope: "expedition" },
  ],
  [
    /\b(tattoo|piercing|psychic|tarot|rage room)\b/i,
    { flags: ["needs_review"] },
  ],
  [
    /\b(home|bedroom|shelf|room|couch|desk|drawer|window)\b/i,
    { settings: ["home"], themes: ["home"] },
  ],
  [
    /\b(museum|library|cafe|restaurant|shop|market|cinema|theater|theatre|class|studio|lobby|club)\b/i,
    { settings: ["venue"] },
  ],
  [
    /\b(walk|street|park|outside|outdoor|beach|hill|river|neighborhood|neighbourhood|city)\b/i,
    { settings: ["outside"] },
  ],
];
const HABIT =
  /\b(every (?:day|morning|week)|for (?:one|a) (?:week|month)|daily|30 days|streak|glasses of water|go to bed|detox|declutter|excel|license|side hustle|track one|not-to-do|goals? for the month|vision (?:board|list)|reflect on|freewrit|journal about)\b/i;
const PRODUCT = /\b(subscription box|pinterest|bible)\b/i;

/** Heuristic first-pass tags. These are suggestions for a human editor, never
 * a claim of understanding; the library file is what the app trusts. */
export function suggestTags(text) {
  const tags = {
    category: null,
    intensity: "chill",
    scope: "session",
    settings: [],
    themes: [],
    interests: [],
    conflicts: [],
    flags: [],
  };
  const push = (key, values) => {
    for (const value of values)
      if (!tags[key].includes(value)) tags[key].push(value);
  };
  for (const [pattern, patch] of RULES) {
    if (!pattern.test(text)) continue;
    if (patch.category && !tags.category) tags.category = patch.category;
    if (patch.intensity) tags.intensity = patch.intensity;
    if (patch.scope) tags.scope = patch.scope;
    for (const key of ["settings", "themes", "interests", "conflicts", "flags"])
      if (patch[key]) push(key, patch[key]);
  }
  if (!tags.category) tags.category = "daytime";
  if (!tags.settings.length) tags.settings.push("outside");
  if (!tags.themes.length) tags.themes.push("novelty");
  if (!tags.interests.length) tags.interests.push("spontaneous");
  if (HABIT.test(text)) tags.flags.push("habit_not_quest");
  if (PRODUCT.test(text)) tags.flags.push("product_or_platform");
  if (
    tags.themes.includes("strangers") &&
    !tags.conflicts.includes("strangers")
  )
    tags.conflicts.push("strangers");
  return tags;
}

/**
 * Turns a raw pool into reviewable candidates:
 * - normalizes text, drops empties
 * - collapses near-duplicates within the pool (keeps first, records the rest)
 * - marks candidates already covered by the library (similarity ≥ threshold)
 * - attaches heuristic tags and review flags
 */
export function ingest(rawPool, library, { threshold = 0.7 } = {}) {
  const kept = [];
  const duplicates = [];
  for (const raw of rawPool) {
    const text = normalizeIdea(raw.idea ?? raw.text ?? "");
    if (!text) continue;
    const twin = kept.find((item) => similarity(item.text, text) >= threshold);
    if (twin) {
      twin.alsoFrom.push(raw.id ?? raw.source ?? "unknown");
      duplicates.push({ id: raw.id, of: twin.id, text });
      continue;
    }
    kept.push({
      id: raw.id ?? `raw-${kept.length}`,
      text,
      source: raw.source ?? "",
      sourceUrl: raw.sourceUrl ?? "",
      alsoFrom: [],
    });
  }
  const candidates = kept.map((item) => {
    let best = { id: null, score: 0 };
    for (const idea of library) {
      const score = Math.max(
        similarity(item.text, idea.text),
        ...idea.briefs.map((brief) => similarity(item.text, brief)),
      );
      if (score > best.score) best = { id: idea.id, score };
      if (idea.sources?.includes(item.id)) best = { id: idea.id, score: 1 };
    }
    const tags = suggestTags(item.text);
    return {
      ...item,
      suggested: tags,
      covered: best.score >= threshold ? best.id : null,
      closest: best.id
        ? { id: best.id, score: Number(best.score.toFixed(2)) }
        : null,
      status: tags.flags.length
        ? "needs_review"
        : best.score >= threshold
          ? "covered"
          : "new",
    };
  });
  return {
    candidates,
    duplicates,
    summary: {
      raw: rawPool.length,
      unique: kept.length,
      duplicates: duplicates.length,
      covered: candidates.filter((c) => c.status === "covered").length,
      needsReview: candidates.filter((c) => c.status === "needs_review").length,
      new: candidates.filter((c) => c.status === "new").length,
    },
  };
}
