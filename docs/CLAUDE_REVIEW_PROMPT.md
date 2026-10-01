# Sidequest — Claude review handoff

Work in **`/Users/pilksclaes/Side Quest Me`**. Review the existing app and latest local changes first, then fix confirmed bugs within this scope and complete the relevant checks. Inspect repository instructions, `git status` and `git diff` first. Preserve unrelated work. Do not rebuild the product, invent speculative features or replace functioning features with placeholders. Report the review and verified local result before any release action.

**Keep this review local. Do not deploy Cloudflare, apply a production migration, push a new TestFlight build, change App Store Connect or publish content. The user wants to review this pass before another release.** Build 1 already exists; do not describe new local changes as shipped.

## Product direction

Sidequest turns a real outing into an activity worth doing and a short video worth keeping. The primary experience is social: discover an idea, create a quest, do it, capture it, and choose whether to share. Monetization comes from optional creator/business opportunities and exact-video licensing. It should not dominate the consumer flow or imply that everyone must become a professional UGC creator.

The user wants Apple/Meta-style ease with Sidequest's own violet identity. The approved brand is implemented in `shared/brand.mjs`, brand components and native assets: violet `#7950E8`, ink `#171A22`, off-white `#F7F6F2`. Trybe (`https://jointrybe.com/`) and Artec (`https://shareartec.com/`) are product references, not implemented integrations or permission to copy their products.

Use cool translucent/glass surfaces, rounded pill controls, careful phone spacing and high-quality photographic adventure imagery. “Adventurous” does not mean cartoon art. The bottom navigation order is **Discover, Activity, Create, Rewards, Profile**, with Create centered. Quest creation should feel like a short guided form, including the budget slider, rather than one long settings screen. Recording should feel familiar to a short-video app: hold/release, resume takes, duration choices, timer, flip/flash, teleprompter, gallery/overlay entry and swipe-up quest instructions. Export retains the Sidequest logo and “Side quest app” watermark. Do not introduce unsupported decorative buttons or force three separate uploads in the new session flow.

## Released baseline versus local work

- Repository: `https://github.com/AaronPilk/side-quest-me`.
- Earlier Claude baseline: `11cbb92`. Native/content/camera work shipped in **`80f2d5a`**; documentation checkpoint **`108f25d`** follows it. Inspect the present working tree rather than assuming it is committed.
- Production: `https://sidequest-me.aaron-9c3.workers.dev`.
- Supabase: existing approved **Side quest Me**, ref **`fpwpsxerogbwlnrvuurm`**. Do not create or switch projects.
- Deployed Worker: **`8e58cbe4-15a6-4e27-be5f-12c069872c8e`**; [deployment run 36779890875](https://github.com/AaronPilk/side-quest-me/actions/runs/36779890875).
- App Store Connect: **Sidequest Me**, app **`6817917086`**, bundle **`com.aaronpilk.sidequest`**, team **`5F5C5G25Y6`**. **1.0.0 (1)** processed as **VALID**, assigned to **Sidequest Internal**, with the owner's invitation confirmed. Physical iPhone installation and public App Store approval were not established by that check.
- Released verification: **451 unit tests in 45 files, 95 browser scenarios in one uninterrupted CI run**, lint, typecheck, isolated database/advisors, renderer fixtures and production build passed. [Checks run 36779823975](https://github.com/AaronPilk/side-quest-me/actions/runs/36779823975).
- Production has **12 applied migrations**, **1,113 published quests** and **1,080 archived activity rows**. The new account-intent migration below is **local**, not part of build 1.

Read `docs/BUILD_REVIEW_2026-09-30.md`, `docs/IOS_RELEASE.md`, `docs/TESTFLIGHT_NOTES.md`, `docs/MAPS.md`, `docs/ACTIVITY_CATALOG.md` and `docs/QUEST_IDEAS.md`. Older checkpoints are history, not proof of the newest working tree. Prefer dated final evidence over an earlier pending checklist row, and verify the current state.

## October 1 latest follow-up: OpenAI activation and idea quality

The owner selected OpenAI and asked for stronger backend idea development. Read
`docs/OPENAI_QUALITY_CHECK_2026-10-01.md` and `docs/AI_SETUP.md` first. These supersede
the earlier AI configuration/verification status below, not its historical evidence.

- **GPT-6 Astra** is configured locally with the existing OpenAI API key in ignored
  `.dev.vars` (0600). Never print, commit or copy the key into the client. Production
  configuration and TestFlight have not changed. No database changes were needed
  for this activation; the earlier pending account/Series migrations still exist.
- Original drafting now compares three concise concepts, expands the strongest
  feasible one, runs canonical hard constraints, then separately critiques the
  actual instructions. Inspect `worker/quest-idea-quality.ts`, `ai-quest-draft.ts`
  and `ai-provider.ts`. A model's scores are fallible judgments. Verify the actual
  actions, finish, costs, people, intensity, permissions and filming directions.
- The pipeline has at most three calls and a 90-second total deadline. Low reasoning
  effort keeps latency bounded on Astra; initial medium-effort trials timed out.
  The latest four synthetic live cases passed in 52–82 seconds. Human review caught
  winning incorrectly required for completion in two earlier AI-approved outputs;
  both affected cases passed a new live check after correcting that contract.
  See the report for
  outputs, timing, early failures and remaining editorial limitations. This small
  sample is not proof of universal quality or that Astra is the best model.
- The helper shows an accessible waiting message, preserves retry/manual paths,
  and blocks duplicate generation. **569 unit tests**, **five mocked draft browser
  cases**, **three mocked filming browser cases**, typecheck, lint and build passed.
  The iPhone 17 / iOS 26.4 demo was rebuilt, installed and opened in Simulator.
- Real provider tests call the exact generator with synthetic data, not the signed-in
  app route. Local Supabase credentials are missing, and demo AI is deliberately
  disabled. Live authenticated iPhone generation/save still needs testing after
  configuring a non-demo environment. Do not present the mocked browser busy-state
  screenshot or a Simulator launch as evidence of live native generation.
- Preserve named-provider consent, permanent-account authentication, rate limiting,
  private-field omission, app-assigned rewards/identity, explicit user save and
  operator publication review. Ordinary catalog recommendations remain deterministic;
  this does not automatically generate runnable quests in the normal recommendation
  flow or verify live nearby venues/events.

Run `npm run test:ai:live` only as an intentional paid evaluation. It makes up to
three calls for each of four scenarios, writes synthetic reports under ignored
`.local/ai-eval/`, and is excluded from regular unit/CI runs. Review the saved prose
as well as test status. Continue to keep this review local before release.

## October 1 earlier follow-up: guided Series and selectable AI

Review these newer local changes before relying on the September 30 checkpoint below.
They have not been deployed or uploaded to TestFlight.

- Discover now has a single-row feed filter, top-right search sheet and shared
  Quests/Series navigation. Series browse/detail routes select Discover in the
  bottom navigation; creating/editing a series selects Create. Profile also links
  to the Series library.
- Series creation/editing is a guided **Story → Format → Parts → Review** flow.
  It defaults to a growing story, uses compact format choices and visual covers,
  and keeps mobile actions above navigation. Owner-scoped local drafts survive
  leaving/reopening with the same account; actual sign-out/account changes clear
  private drafts. Confirm 320/390/430px and 200% text, including returning to
  earlier steps, keyboard focus and native safe areas.
- A selected quest offers **Just this quest / Start a series** before acceptance.
  Standalone quests can later become part one from the active/completed quest or
  Journal. `/series/new?run=...` has three steps and saves a private series linked
  to the actual accepted quest. Canceling leaves the quest intact. Video, render,
  completion, publication, frozen snapshot, rewards and wallet must not change.
  Public viewers must not see private series titles or metadata.
- Apply **`20261001173049_link_existing_run_to_series.sql`** after the account
  intent migration and before a Worker that uses the new Series read/link behavior.
  The association lives on the Series part, not as a rewrite of a historical run.
  Source part content locks immediately. The story format locks after first
  publication; a planned finite story also keeps its part count, while a growing
  story can add parts later. Check ownership, status, concurrent linking,
  idempotency, deletion, privacy and later editing independently.
- AI now has server-only **xAI/Grok, OpenAI and Anthropic/Claude** adapters. Provider
  selection is explicit, with named consent and no silent fallback. **Draft with
  AI** on Create opens a short brief/plan/proposal flow, then fills the existing
  editable original form only after an explicit action. Explicit save and operator
  review remain required; it does not instantly publish, accept or reward a quest.
  Existing filming assistance retains canonical mechanics. Both flows use confirmed
  structured preferences and authoritative outing inputs. Normal recommendations
  remain deterministic; summaries are still manually reviewed, and no live place
  or event verification is added.
- Read the updated **`docs/AI_SETUP.md`**. That earlier Series/provider pass used
  mocks without configuring a key; the latest activation above adds a local key
  and real synthetic evaluations. OpenAI subscription-backed inference exists
  for approved participating applications, but Sidequest has no approved commercial
  client ID. Each user's own plan limits apply; the owner's subscription is not a
  shared API budget. Do not copy CLI OAuth credentials into the app.

Relevant source: `src/pages/Series.tsx`, `src/series-design.css`,
`src/components/QuestSeriesChoice.tsx`, `src/pages/Quest.tsx`, `ActiveQuest.tsx`,
`Journal.tsx`, `shared/series.ts`, `worker/series.ts`, `worker/services.ts`,
`worker/ai-provider.ts`, `worker/ai-quest.ts`, `worker/ai-quest-draft.ts`,
`src/components/AiQuestDraftAssist.tsx`, `AiQuestAssist.tsx`,
`src/pages/OriginalQuest.tsx`, `shared/ai-quest.ts`, and the focused Series/AI tests.

The isolated database upgrade/invariants/advisors passed for late Series linkage.
All **26 focused Series browser cases** passed, including actual video rendering,
late conversion/privacy/preservation, large-text layout and two actual browser
safe-area overrides at 390 × 844 and 402 × 874 with 59px top / 34px bottom insets.
The native-layout cases keep every cover choice above the fixed action dock,
including after Back navigation. AI transport and draft
validation have independent regression coverage. Live model quality was unverified
at that checkpoint; the latest OpenAI report above records subsequent evaluations.
Use `docs/SERIES_AI_MILESTONE_2026-10-01.md` for that checkpoint's exact counts and
native results.

## Earlier changes to inspect

1. **Personal versus Brand account choice.** A new first onboarding step distinguishes personal adventures from representing a business. Personal continues into the optional summary and ten preference questions; Brand saves the choice and opens business setup. Account settings can change the choice independently. This is product intent, not an authorization role.
2. **Business visibility and routing.** Personal users should not see Business invitations throughout the app. Brand accounts get the workspace before approval, but approved-only actions still require approval. Explicit Personal wins even if the user has an existing approved business. Approved historical businesses can be conservatively backfilled; pending/unknown users must not be silently declared Brand. Operator/merchant permissions remain separate. Existing licenses and creator activity must survive account-type changes.
3. **Remove the global three-dot menu and duplicated desktop workspace links.** Profile settings becomes the reliable entry. Journal, preferences, imported summary, sign-out/account deletion, demo tools, blocked-account management and authorized admin tools must remain reachable, including when the profile API is loading or fails.
4. **Improve Profile and Series layouts.** Inspect current profile/header/tab and Series changes on a small phone. Preserve all tabs, edit/share controls, privacy, follows, owner-only controls and deep links. Counts and earned milestones must remain real.
5. **Polish Business workspace.** Responsive shortcut pills, clear status/setup card, an action opening/focusing the existing form, and readable licensing/video sections. No invented analytics, ad launching or automated payments. Editing an approved business resubmits it for review; that consequence must remain visible.
6. **Discover search navigation.** A broad run reproduced a race where a submitted URL transition could overwrite the next text being typed. `Discover.tsx` now marks its own submissions in navigation state, keeps newer draft input, and reconciles external/Back/Forward navigation with the URL. Review the submission sequence and stale-marker cleanup, including rapid searches, Clear and browser history. Do not restore the earlier unconditional URL-to-input layout effect.
7. **Direct preference wizard and recurring reminders.** Profile has a visible Quest preferences shortcut. Account preferences puts the progress card first. `/onboarding?preferences=1` asks eleven short questions with horizontal transitions, a progress bar, automatic advance for single choices, and explicit Continue for multiple choices. Interests and skills are separate screens. Confirmed answers save as users advance; Skip preserves an existing answer and leaves unknowns unknown. Explicit No preference is different from a skip. Save & leave resumes the first unanswered question later. Personal users see in-app reminders on Profile/Create until all eleven answers are confirmed; these are not OS push notifications. Direct editing must preserve account type, imported summary and onboarding status. The original ten-question first-onboarding route and its drafts remain compatible. Check both draft keys and identity cleanup.
8. **Optional AI filming assistance.** The original September 30 implementation added `AiQuestAssist` in selected/active quests with OpenAI support. The October 1 follow-up above adds selectable providers and editable original proposals. Canonical actions, costs, intensity, participants and rewards stay unchanged. Read `docs/AI_SETUP.md` for current behavior and configuration; production remains unconfigured.
9. **Account-bound draft safety.** The final review found that a direct native sign-in as a different user could retain an unfinished draft from the previous account. Both draft envelopes now carry an owner identity. Reads and post-save synchronization must reject foreign or unowned drafts, and auth transitions clear private drafts on an actual account change/sign-out while keeping them on same-account token refresh. Old unowned local drafts cannot be attributed safely: load the durable saved profile and explain that fallback. Saved profiles and confirmed answers remain compatible. A delayed save from the first account must not update the second account or its draft.

Main files:

- Model: `shared/account.ts`, `shared/domain.ts`, `shared/community.ts`, `worker/services.ts`, `worker/index.ts`, `src/lib/api.ts`, `src/lib/community-api.ts`, `src/lib/demo-community.ts`.
- New local migration: **`supabase/migrations/20261001173038_account_type_intent.sql`**. Inspect nullable account intent, constraints, conservative backfill, private responses, permissions and upgrade tests. A client choice must never grant approval or a server role.
- Choice/gate: `src/components/AccountTypeChoice.tsx`, `BrandAccountGate.tsx`, `account-type-choice.css`, `src/pages/Onboarding.tsx`, `Profile.tsx`, `Settings.tsx`.
- Navigation/profile: `src/App.tsx`, `src/pages/Creator.tsx`, `Discover.tsx`, `Rewards.tsx`, `Series.tsx`, `src/profile-design.css`, `src/series-design.css`.
- Search race/history regression: `src/pages/Discover.tsx`, `tests/discovery-audit-browser.spec.ts` (the submission markers are client navigation state, not authentication or server records).
- Workspace: `src/pages/CommunityStudio.tsx`, `src/pages/business-workspace.css`. Preserve `/studio`: stored business-review notifications target it. Operators route to Admin, Brand accounts to Business, other users to creator offers.
- Tests: `tests/account-type*`, `tests/profile-account-worker.test.ts`, `tests/profile-client.test.ts`, `tests/database/account-type-invariants.mjs`, `tests/profile-layout-browser.spec.ts`, and existing navigation/business/consumer/browser specs.
- Guided preferences: `shared/preference-progress.ts`, `src/components/PreferenceReminder.tsx`, `src/components/PreferenceControl.tsx`, `src/pages/preferences-wizard.css`, `tests/preferences-wizard-browser.spec.ts`, `tests/preference-progress.test.ts`; draft synchronization also touches `src/lib/demo-identity.ts` and `src/App.tsx`.
- Draft ownership: `src/lib/profile-drafts.ts`, `src/pages/Onboarding.tsx`, `src/lib/api.ts`, `src/App.tsx`, `tests/profile-drafts.test.ts`, `tests/preference-identity-browser.spec.ts` and the profile-client/account regressions. Inspect native direct account switching, delayed responses, cold start with foreign/unowned storage, token refresh and same-owner progress.
- AI: `shared/ai-quest.ts`, `worker/ai-quest.ts`, `src/lib/ai-quest-api.ts`, `src/components/AiQuestAssist.tsx`, `tests/ai-quest.test.ts`, `tests/ai-quest-worker.test.ts`, `tests/ai-assist-browser.spec.ts`, `.dev.vars.example`, `wrangler.jsonc` and generated binding types. Secrets never belong in the client or repository.

## Local verification checkpoint — September 30, 2026

This is the unshipped pass after the released baseline above. **No Git push, Cloudflare deployment, production migration or TestFlight update has been performed for it.** Production remains at 12 migrations and build 1; the isolated local database exercises 13.

- **505 unit tests in 51 files passed**, with full typecheck, lint and production build, after the final draft-ownership changes. The demo/native build also succeeded and launched on iPhone 17 / iOS 26.4. Local database checks passed with **13 migrations**, including account intent, compatibility upgrade, RLS, deletion and advisors.
- **All 118 browser scenarios passed in one uninterrupted run** before the final ownership hardening. Subsequent focused coverage passed **19 cases** (six identity, four account-type, nine wizard); the final strengthened six identity cases passed again after the last small ownership changes. Across those runs, **126 distinct cases were verified**, not one uninterrupted 126-case suite. The wizard cases include two additional 390 × 844 and 402 × 874 cases with actual browser safe-area overrides of 59px top / 34px bottom, covering unknown and confirmed-neutral answers across all eleven pages.
- The earlier Discover failure was fixed and is included in the passing broad run. Its seven focused regressions, 20 repeated stress executions and three pagination cases also passed; repetitions are not extra unique features.
- In the actual Simulator, Series opened its editor, Private navigated to account preferences, Personal Settings omitted Business, fresh Brand onboarding opened the workspace, and its setup CTA opened/focused the existing form. The visible Profile preference shortcut opened the wizard without scrolling. Skips stayed unknown across app restart; a single Bold choice saved and auto-advanced, Back restored it, and Save & leave returned to Profile. No role was invented.
- Native verification caught a long question pushing navigation too low. The final compact layout keeps normal-size controls above the home area; the two additional safe-area regressions cover both unanswered and confirmed-neutral states across all eleven questions. Large text remains scrollable and reduced motion is supported. Screenshot evidence is in `.local/ios-evidence/`, including `preference-wizard-question2-final.png`, `preference-wizard-confirmed-answer.png` and `preference-wizard-role-unknown.png`. This is Simulator evidence, not a physical-device check.
- Final account-safety tests prove direct A→B `SIGNED_IN` isolation for both original summary and preference-only routes; conservative fallback for unowned drafts; same-user `TOKEN_REFRESHED` preservation; stale initial-session responses; and delayed saves retaining their original authorization without modifying the new account's draft. Twenty-five focused profile-client/draft unit tests passed. No material React/AI component issue remained after that review.
- AI service/Worker coverage passed **23 focused tests**; three client-provider browser mocks are included in the broad browser result. A real isolated synthetic `gpt-6-astra` request returned valid structured output in approximately nine seconds. It sent public catalog text, a synthetic outing and empty preferences, not saved user data. No credential was persisted or deployed; production AI remains unconfigured.
- Logs: `.local/preferences-ai-owner-unit-final.log`, `.local/preferences-followup-browser-full.log`, `.local/preferences-identity-focused-browser.log`, `.local/preferences-identity-browser-final.log`, `.local/preferences-wizard-native-regression-final.log`, `.local/preferences-ai-owner-build-final.log`, `.local/ios-preferences-ai-owner-reviewed.log` and `.local/ai-provider-synthetic-smoke.log`.

## Existing behavior to preserve

- React/TypeScript/Vite UI, Hono Cloudflare Worker API, Supabase Auth/Postgres/RLS/RPCs, private R2 media, render queue and FFmpeg Container. Capacitor bundles the interface as an actual iOS app, not a Safari shortcut or remotely loaded production website.
- Quest creation is sequential. Current outing budget/time/setting/group are authoritative. Time choices: one/three/five hours or unlimited. Full Send must stay Full Send; a couple cannot silently become four people to force a match. Firm exclusions remain hard filters; explanations must reflect actual matching.
- Unknown survey answers stay unknown. Imported ChatGPT text is independently editable/removable. Manual review lets users separately confirm structured preferences. No AI summary parser is configured. Optional AI assistance is configured locally; production still needs its own server secret and reviewed deployment. Entertainment preferences, product-design context, negation and uncertainty must not become invented participation preferences.
- Sixty authored activity families expand into current variants, alongside the original quests. The **116-idea editorial library is unpublished tooling**, not live events or thousands of independently authored stories. Draft generation preserves maximum cost, time, allowed groups, intensity and authored instructions. Never edit historical row contents or applied migrations. Old public links return exact historical content; new attempts can explicitly choose current versions.
- Camera: one five-to-sixty-second video from recorded takes, stop/resume, local draft restoration, hold recording, timer, camera controls, guidance/teleprompter and optional photo overlay. Legacy three-clip evidence remains supported. Release media tracks on exit/background and never claim persistence before it succeeds.
- Photo overlays are bounded PNG/JPEG/WebP raster inputs. New single-video exports retain the approved logo and literal **“Side quest app”** watermark. iOS full-range H.264 needs actual limited-range conversion; removing that normalization reproduces a failure missed by ordinary browser fixtures.
- Native share sheet uses temporary private cache files; cancellation is not success. Public links use the configured HTTPS origin; private media remains authenticated. Do not report a browser download as successful native export.
- Native iOS 18+ Maps uses `SidequestPlaces`/`MKLocalSearch` with real durable IDs; iOS 15–17 retains manual-area/external-Maps fallback. Browser Apple Maps and live Ticketmaster inventory require provider configuration. Nearby links are not verified tickets, hours or filming permission. Automatic Eventbrite scraping is not implemented.
- XP, reward points and commercial money stay separate. Crowns are earned personal milestones, not fake global rankings. Licensing requires approved business, creator/video opt-in, exact accepted terms and verified manual fulfillment before restricted download. Account type cannot bypass those checks.

## Local and iOS review workflow

Never print `.env` contents, tokens, signing keys or sessions. Existing environment files are local and ignored. Use Node 22.12+ and the installed Xcode toolchain. Reuse healthy servers rather than opening duplicate ports.

In separate terminals from `/Users/pilksclaes/Side Quest Me`:

```sh
npm run dev:demo
```

```sh
npm run render:dev
```

Demo identities are under **Profile → Settings → Demo tools**. They are isolated fixtures, not real permissions. For native review:

```sh
npm run ios:simulator -- --demo
```

This builds/syncs/installs/launches the local demo in an available iPhone Simulator. Add `--device=SIMULATOR_UUID` for a specific device. Demo media expects dev port 5173 and renderer port 8789. Simulator loopback reaches this Mac; an actual iPhone's loopback does not. Never distribute the demo bundle. `ios:sync` builds the separate production bundle; syncing or archiving does **not** authorize an upload.

Review the actual Simulator, not just a desktop browser resized to a phone. Check safe areas, keyboard, long labels, tap targets, back navigation, Profile tabs, settings recovery, account-type persistence after reopening and Business setup. Test 320/390px layouts and a small supported phone. Use native picker/share interactions where possible; label synthetic camera footage and mocked providers clearly.

Previous native evidence: a three-second timer, 14.8-second synthetic recording, actual Photos picker selection, top-left overlay, render, native Save Video, and playback of the saved video in Simulator Photos. Native Apple search and selection for Central Park passed. Authenticated production smoke also composed/rendered/downloaded a ten-second full-range session with photo/watermark, range requests and cross-account denial. These are baselines, **not physical-phone verification**. Actual camera/audio quality, flash, interruptions, memory pressure, external-email callbacks, approximate GPS and cellular behavior still need device checks.

## Required cases and checks

- Fresh Personal/Brand onboarding; cancel/back/reload; completed onboarding; old profiles missing account type. Saving intent must not invent survey answers or erase summary/preferences/business/licenses/media.
- Brand → Personal → Brand after refresh; approved/pending/rejected businesses; direct `/business` and legacy `/studio`; operator and merchant accounts. Keep approval separate from intent and preserve authorized historical offer access.
- Without the menu, reach settings, sign-out/deletion, journal, summary review, blocked users and authorized admin tools. Simulate failed profile reads and confirm a usable Settings exit remains.
- Business setup/edit CTA opens the correct form, focuses its field, and fits a small phone. Submission/rejection/resubmission/approval and licensing links continue working. Accepted terms and manual-payment language stay accurate.
- Direct preferences: all eleven pages must fit the actual native safe areas at normal text size; browser-only geometry is insufficient. Check multi-select neutral answers versus unknown, single-select save/advance, saved error recovery, return destinations, summary removal while a draft exists, account switching, large text/reduced motion and reminder removal only when complete.
- AI: verify configuration-off fallback, explicit consent, authentication, strict request/output validation, timeout/refusal/retry, hard filters and no changes to the canonical quest. Client provider mocks prove UI behavior only. The four latest live synthetic proposals exercise the real three-stage generator; they do not prove authenticated iPhone operation, production configuration, consistent editorial quality or a model quality benchmark.
- Own/public profiles, every tab, edit/share, Series listing/follow/start/edit/dependencies, empty/error states and return destinations. Check overflow, contrast, headings and keyboard/touch use.
- Run meaningful regressions: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and relevant `npm run test:browser` scenarios. SQL uses isolated `npm run test:db` and `npm run test:db:advisors`; never reset production. Separate unit/mocked tests, live provider checks and native device evidence.

Earlier source-backed backlog risks: reward reservation idempotency keys only survive the current component mount after an ambiguous response; large Activity mark-read batches can hit the 60-request limiter. These were not confirmed production incidents. Reproduce locally before claiming an incident or changing transactions.

## Deliverable and release boundary

Lead with actionable findings by severity, exact file/line, reproduction, expected/observed behavior and affected user. Separate confirmed bugs from hypotheses. Save screenshots/artifacts for layout findings and name the actual browser/Simulator/device/account state. Report commands, counts, failures and unverified areas honestly. If the changes are sound, say so without inventing issues.

General public-release requirements remain separate: actual privacy/support/terms pages, operational UGC filtering/moderation, supported audience/content-age handling and physical-device validation. An accepted internal beta does not complete those requirements.

**Finish with a reviewable local result. Do not deploy, migrate production, push another TestFlight build or submit to App Review until the user reviews this pass and explicitly authorizes the release.**
