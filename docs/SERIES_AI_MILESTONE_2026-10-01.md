# Series and AI milestone — October 1, 2026

This is a **local, unshipped** update in `/Users/pilksclaes/Side Quest Me`.
Existing Claude and other working-tree changes were preserved. No Git push,
hosted migration, Cloudflare deployment or TestFlight upload was performed.
Use `docs/CLAUDE_REVIEW_PROMPT.md` for the complete product/release handoff and
`docs/AI_SETUP.md` for exact provider configuration.

The AI configuration and evidence below describe the earlier milestone. The later
OpenAI activation and real quality evaluations are recorded in
`docs/OPENAI_QUALITY_CHECK_2026-10-01.md`; use that report for current AI status.

## Series behavior

Reworked later on October 1 after the product owner clarified the intent: a
series is **not** authored from scratch. It grows out of a quest a person
already did, the way a Part 1 / Part 2 / Part 3 story grows on TikTok or
Instagram. See `docs/CREATOR_SERIES.md` for the full description.

- Accepting a quest never asks about a series. The pre-acceptance
  **Just this quest / Start a series** choice, the **Start a series** link in
  Create, **Create a series** in Discover → Series, and **New series** on the
  profile are gone. `/series/new` without a quest explains that a series starts
  with a quest you did and points to Create and the journal.
- **Turn into a series** on an accepted or completed quest (or in the journal) is
  a single prefilled screen: title and premise come from the quest, the cover
  from its category. Saving creates a **private** series whose Part 1 is that
  quest; the series page opens with a one-time "saved" notice. Canceling leaves
  the quest unchanged. Nothing about the run, its media, render, completion,
  publication or reward/wallet records is rewritten, and no bonus is issued.
- The series page offers **Create Part N**: it appends a private part for the
  **same reviewed quest version** and opens Create to accept it with the
  author's own outing. The attempt is stamped as that part. Once that part's
  video is finished, **Publish Part N** publishes it (a growing story goes public
  with its first published part; a planned story publishes all parts through the
  editor and then keeps its part count). The quest page links back with
  **Open series · Create Part N+1** once an attempt is finalized.
- The author may film their own unpublished part before anything is published.
  Other people never see a draft series or an unpublished part, cannot read it
  as a part, and cannot accept it. Repeating the same quest inside its family
  cooldown earns no second award; the run reports `family_cooldown` honestly.
- The editor still shapes the story (Story → Format → Parts → Review with the
  existing progress bar, covers and action bar): title, premise, cover, growing
  or planned format, part titles, prerequisites, reordering of draft parts, and
  which parts are included when the series is published. The reviewed-quest
  picker and **Add part** are removed. Part 1 keeps its locked source identity,
  and a part the author already filmed or is filming cannot be removed.
- Owner-scoped local editor drafts retain answers/step on same-account reopening.
  Foreign/unowned drafts cannot be attributed to another user. Actual sign-out or
  account change clears private local drafts; token refresh does not. Delayed
  saves must not update a different account's editor.

Two compatible migrations are involved:
`supabase/migrations/20261001173049_link_existing_run_to_series.sql` (linkage of
an existing run as Part 1, stored on `quest_series_parts` through `source_run_id`
and `source_context`) and `supabase/migrations/20261001173101_series_grow_from_quest.sql`
(the author may accept any part of their own series; owner availability no
longer requires public state; redacted parts stay unavailable). Apply them in
that order, after the pending account-intent migration and **before** releasing
the Worker that uses them. Neither edits historical `quest_runs` rows. The
isolated database exercised all **15** local migrations, including a dedicated
grow-from-quest invariant test; hosted production remains at the earlier
12-migration checkpoint.

## AI behavior and remaining configuration

Server-only adapters support **xAI/Grok, OpenAI and Anthropic/Claude**. Selection
is explicit, consent names the selected provider, and no different provider is
silently substituted. Existing OpenAI configuration remains compatible.

**Create → Draft with AI** asks for a brief, reviews the current outing and
previews a proposal. **Use editable draft** fills the existing original-quest
editor. Explicit save and the existing operator review remain necessary before
a new original becomes a runnable catalog quest. AI does not immediately publish,
accept or award a quest. Existing filming assistance can propose hooks, shots,
captions and a loop without changing the canonical quest.

The server sends only confirmed structured preferences plus the intended brief
and authoritative plan. It excludes imported summary text, identity, unconfirmed
legacy defaults, private free-form notes, exact coordinates and place IDs.
Generated quest proposals must pass the strict contract and the existing
eligibility checks, including participants, intensity, budget, time, setting and
firm exclusions. Rewards/identity are assigned by the app. Output is bounded,
requests are rate-limited and time out, and errors preserve retry/manual options.
Semantic quality and truthful model tagging still require review.

Normal recommendations remain deterministic; summary review remains manual.
This pass adds no live event search, confirmed venue costs/hours or location
verification. The demo iOS build never calls a real AI provider.

**No Grok key is configured, and no current live Grok/Claude/draft-model request
was verified.** Provider behavior tests use mocked responses. The September 30
synthetic OpenAI smoke test is historical evidence, not a benchmark or a live
test of these new adapters. Given the owner's preference, Grok is prepared with:

```dotenv
AI_QUEST_PROVIDER=xai
AI_QUEST_MODEL=grok-4.7
XAI_API_KEY=YOUR_SERVER_ONLY_KEY
```

For local authenticated Worker development, store these in ignored `.dev.vars`;
do not overwrite existing development settings. For production, the key belongs
in the existing Cloudflare Worker's secrets; provider/model belong in the GitHub
`production` environment variables. Detailed steps are in `docs/AI_SETUP.md`.
Never place a key in the iOS bundle, a `VITE_` variable, GitHub source or chat.
Compare real creative briefs before declaring any provider best. Every provider
has its own policies; Grok does not imply unrestricted output.

OpenAI does now support [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)
for eligible participating applications. Commercial integration currently needs
an [approved registered client ID](https://developers.openai.com/siwc/request-client-id),
which Sidequest does not have. Each connected user uses their own plan's limits;
the owner's subscription cannot fund all app users. An API provider switch does
not enable this distinct OAuth/PKCE, per-user streaming-inference integration.
Do not copy cached CLI OAuth credentials into the app.

## Verified local result

- **546 unit tests in 52 files passed**, full typecheck, lint and production build.
  This includes provider isolation, named consent, request redaction, draft
  validation/eligibility, timeout/refusal/size errors, app-assigned identity/rewards
  and frozen Series linkage. AI had 60 focused implementation tests plus a
  separate 30-test adapter audit; those overlap the full-suite count.
- **26 distinct focused Series browser cases passed** across the final 24-case
  flow run and two additional safe-area regressions. Coverage includes choosing
  Series at acceptance, later active/completed conversion, cancellation, private
  metadata, ownership/idempotency, real video rendering/finalization, unchanged
  rewards, same-owner draft restoration and foreign-owner isolation. Layout
  checks cover 320/390/430px and 200% text; actual Chromium safe-area overrides
  exercise 390×844 and 402×874 with 59px top/34px bottom, all cover labels above
  the dock, navigation clearance and returning to Format.
- **Seven distinct AI/original browser flows passed** using provider mocks on a
  fresh isolated demo server. They cover Grok-named consent, Full Send/two-person
  outing preservation, preview → editable draft → explicit save → reopening,
  retry, unavailable/manual paths, filming assistance and ordinary original
  submission/operator-review behavior. These are not real model-quality tests.
- The isolated PostgreSQL upgrade, invariants and advisors passed with real RLS,
  ownership, concurrency/idempotency, private/public privacy, deletion and unchanged
  source media/economic history. Generated database types passed their check.
  No hosted database was accessed or modified for this migration test.
- A freshly built **iPhone 17 / iOS 26.4 Simulator app** installed and launched.
  Actual UI checks created a private series from a reviewed quest, entered/restored
  text, converted an existing completed standalone quest, saved it privately,
  reopened after app restart, confirmed completed part-one progress and reopened
  Edit series. The final Format screen shows all four named covers clear of the
  action bar. AI-unconfigured UI accurately offers the manual original editor.
- Simulator keyboard focus exposed content scrolling behind the status clock.
  The fix uses a noninteractive native UIKit safe-area surface above WKWebView,
  observing only editing/dark presentation booleans. Focused title and premise
  checks confirmed the light status area remains clear. Physical-device camera,
  dark camera text-entry and live provider latency/quality still need a later
  configured-device check; this is not TestFlight or physical iPhone evidence.

Final logs:

- `.local/series-ai-final-unit.log`, `series-ai-final-typecheck.log`,
  `series-ai-final-lint.log`, `series-ai-final-build.log`, `series-ai-final-ios.log`.
- `.local/series-flow-browser-final.log`, `.local/series-native-layout.log`,
  `.local/series-source-db-check.log`, `.local/series-source-types-check.log`,
  `.local/ai-provider-audit-tests.log`.

Native evidence:

- `.local/ios-evidence/series-format-final-2026-10-01.png`.
- `.local/ios-evidence/series-keyboard-native-fix-2026-10-01.png`.
- `.local/ios-evidence/series-later-conversion-2026-10-01.png`.
- `.local/ios-evidence/series-private-completed-2026-10-01.png`.
- `.local/ios-evidence/ai-draft-unconfigured-2026-10-01.png`.

Before release, Claude should review this working tree using
`docs/CLAUDE_REVIEW_PROMPT.md`. Preserve historical quest/run content and unrelated
changes. The older findings in `docs/CLAUDE_REVIEW_2026-10-01.md` were not all part
of this milestone; do not describe unrelated issues as fixed by these changes.
