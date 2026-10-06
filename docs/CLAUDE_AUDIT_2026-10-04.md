# Claude audit — Sidequest iPhone app before App Store submission (2026-10-04)

Audited tree: `5e1136d852fb1fe8cd14bd4c6f0c668b3127f9c1` (clean working tree,
confirmed on the Mac and in a byte-identical container snapshot). Backend
HEAD `eee5adc` is deployed per `docs/AI_SETUP.md`; this audit did not deploy,
migrate, upload or submit anything. All tool runs happened in an isolated
Linux container on the snapshot; the iPhone Simulator was driven on the Mac in
background mode (taps only; see §5 for what that mode cannot reach). Nothing
in `.local/` credential files was opened.

## 1. Executive verdict and top release blockers

**TestFlight (internal) — usable.** Build 1.0.0 (15) is a working beta for
the owner and a handful of testers: sign-in, Create, generated experiences,
camera import/record (owner-confirmed preview and zoom only), journal, Series,
rewards, settings and public pages all exist and the automated suites pass.
Note that Build 15 does **not** contain the "Down for Anything" rename (it was
archived 69 minutes before that commit); testers still see "Demon".

**Public App Store — not ready.** Five items block a public release, in
order:

1. **The core product promise still fails on Full Send.** In fresh live runs
   against the deployed rules, the normal-Create pipeline still picks ordinary
   activities dressed up with extra rounds: four games of bowling for a 21+
   nightlife Full Send group, private karaoke for a Bold couple, a concert for
   an Unlimited-time $900 Full Send night. The independent reviewer approved
   every one of 9/9 runs. The darts-night sample that Codex saved as a pass
   had a reviewer audienceIntensity of 3 and would be rejected by the shipped
   gate, so some documented "passes" were produced by an intermediate build.
   Root cause in F1, prose in §4. This is the complaint the beta testers
   raised in Build 3 and it is not fixed; it is partly improved.
2. **No real recording has ever been verified on hardware.** Preview and zoom
   were confirmed by the owner on Build 12; recording, microphone playback,
   draft recovery, backgrounding and export have only browser, renderer and
   Simulator-import evidence (§5). The Simulator refuses the native camera by
   design (`SidequestCameraPlugin.swift:172`).
3. **Account creation email is not production-grade.** Welcome sign-in is a
   Supabase magic link with no custom SMTP configured (per
   `docs/APP_STORE_PREPARATION_2026-10-04.md` §Remaining); the client already
   has copy for `over_email_send_rate_limit`. A reviewer's password login does
   not prove a stranger can create an account. Not retested here (no
   production access from this audit).
4. **No authorized moderation operator** exists for a UGC app (Apple 1.2
   requires timely response to reports), and the operator role bundles
   licensing administration (owner decision pending).
5. **Age-gated adult/alcohol content on self-reported age.** The product now
   affirmatively suggests bar crawls, cocktail nights and names "strip clubs
   or cabaret" as valid directions (`worker/quest-idea-quality.ts:146`) for
   anyone who taps 21+. Apple 1.4.3 forbids encouraging excessive alcohol use
   and any encouragement of minors; the saved 18+ rating helps, but the owner
   should expect questions and must keep the age-rating answers and App
   Privacy declaration consistent with this behaviour (§8).

Housekeeping rather than blockers: the Mac's 2.6 GB `.local/` release
evidence includes plaintext credential exports (`sidequest-production-secrets.json`,
`sidequest-project-keys-revealed.json`, `supabase-credentials-tree.json`,
`sidequest-auth-backup.json`); they are gitignored but should be purged, and
`_to_delete/` (two retired Series components) can go.

## 2. Findings ordered by severity

Severity: **High** = blocks public release or breaks the core promise;
**Medium** = user-visible defect or misleading state; **Low** = polish.
Status: **Confirmed** (reproduced here), **Hypothesis** (from code reading,
not reproduced), **Historical** (documented earlier, rechecked).

### F1 · High · Confirmed · Full Send still returns ordinary activities with extra rounds

- **Where:** `worker/experience-discovery.ts:230-232` (selection prompt and
  weighted formula), `worker/quest-idea-quality.ts:81-92` (`chooseQuestConcept`
  weights playability×3, goal×2, originality×1, audienceIntensity×3,
  filmability×1), `:150-156` (`QUEST_IDEA_RUBRIC`), `:163-170`
  (`REVIEW_INSTRUCTIONS`).
- **Reproduction:** nine bounded live GPT-6 Astra discovery runs (18 provider
  calls, all HTTP 200, 36–47 s each) with the shipped code and prompts;
  outputs in `.local/ai-eval/claude-audit-2026-10-04/*.json` (§4).
- **Expected:** a Full Send proposal "substantially more ambitious" than an
  ordinary activity; Full Send nightlife for an eligible 21+ group may lean on
  cocktails, bar crawls, tastings.
- **Actual:**
  - 4 friends · late night · Full Send · 21+ · adult nightlife on · alcohol
    allowed · listings: cocktail bar, dive bar, bowling alley → **"Four Games,
    No Hiding"**: three partner-rotation bowling games plus a singles finale
    (225 min). The cocktail concept (B) was self-scored audienceIntensity **3**
    and lost. Reviewer approved (audienceIntensity 4, originality 3).
  - Same plan rerolled with the bowling night as history → "Four Friends, One
    Horror Movie" (live-actor horror escape room), which is genuinely Full
    Send — so variety only arrives on the second paid attempt.
  - 2 people · late night · Bold · 21+ · alcohol **excluded** → **"Your
    Private-Room Headliner Set"**: private karaoke for two (karaoke was a
    candidate in 4 of these 9 runs and selected once here, plus Codex's
    five-friends sample; the title "Private-Room Arena Tour" recurs verbatim
    across unrelated plans).
  - 3 friends · Down for Anything · Full Send · **Unlimited time · $900** ·
    nightlife on · hotel/bar/music listings → "Three Friends, One Loud Night":
    attend one concert, 180 minutes. Unlimited time and the budget were not
    used; no overnight idea appeared.
  - Codex's own saved samples show the same shape: "Five Friends, One
    Ridiculous Headline Set" (karaoke, ten lead-song attempts, 21+ cocktail
    listings ignored), "Last Friend Standing: Darts Night", "The
    Three-Discipline Arcade Throwdown" (30 scored arcade attempts).
- **Root cause (from the code and the transcripts):**
  1. The generator grades its own concepts and the selection formula rewards
     playability and audienceIntensity equally while originality has weight 1.
     A safe, familiar activity scores playability 5 and self-assigned
     audienceIntensity 4–5 every time, so it wins.
  2. Commit `eee5adc` removed the only concrete negative definition of Full
     Send from the rubric ("A first open-mic appearance, karaoke, … extra
     rounds, longer duration, louder wording or greater cost alone does not
     establish Full Send", present in `1148d52:worker/quest-idea-quality.ts`).
     What remains is one sentence: "A routine activity with only a Full Send
     label is not enough" (`quest-idea-quality.ts:154`).
  3. The reviewer never rejected anything in 9/9 runs; its `intensityEvidence`
     restates the proposal ("sustained competitive commitment"). Under the
     current rules the review is a rubber stamp, and its 220-character field
     was cut at the limit in every run (F9).
  4. Confirmed interests dominate selection ("games" → bowling/arcade,
     "music"/"comedy" → karaoke) even though the prompt says they are
     "inspiration, not a fence". Alcohol-forward concepts are consistently
     self-scored audienceIntensity 3, so the owner's bar-crawl intent only
     surfaces in the Draft-with-AI path when the user writes it in the brief.
- **User impact:** the exact Build 3 complaint ("boring… I selected full
  send", reports `AEBcS0UxyJM4hNij1qRB2GE`, `ADc3aov81n8uUfNd6pXSqds`).
- **Evidence that the gate does bite when the reviewer is honest:** replaying
  Codex's "Last Friend Standing: Darts Night" review (audienceIntensity 3)
  through `acceptsQuestQuality` → rejected; it was saved as a success in the
  Mac's `.local/ai-eval/open-creative-final-2026-10-04/`, which means that
  eval ran on a working-tree state without the threshold.

### F2 · Medium · Confirmed · Adult-nightlife opt-in forces every proposal to be "21+ adult-only"

- **Where:** `worker/experience-discovery.ts:191-199` — when
  `nightlifeSuggestionAllowed` is true the response schema is pinned to
  `supportsAdultContext: literal(true)`, `adultOnly: literal(true)`,
  `minimumAge: literal(21|18)`.
- **Actual:** bowling, a horror escape room, karaoke for two and a concert all
  came back `adultOnly:true, minimumAge:21` (the concert also tagged
  `alcohol`), because the schema left the model no choice. The preflight then
  asks for "Explicit adult eligibility" and "Confirm this venue permits your
  chosen adult nightlife activity" for a bowling alley
  (`shared/experience-discovery.ts:94-108`).
- **Expected:** the model decides whether the chosen experience is adult;
  the age floor follows the content, not the opt-in.

### F3 · High · Confirmed · The TestFlight build predates the Demon → Down for Anything rename

- **Where:** on the Mac, `.local/Sidequest-build15-v2-delivery.xcarchive`
  `Info.plist` `CFBundleVersion 15` and its bundled `native-build.json`
  `builtAt 2026-10-04T21:51:59Z` (= 17:51 EDT, the minute of commit
  `4025788`); the rename is `9953519` at 19:00:51 EDT and changes
  `shared/domain.ts:10` and `shared/profile.ts:74`, both client-bundled.
- **Actual:** the installed iPhone 17 Simulator demo build still shows
  "Demon" (`.local/ios-evidence/claude-audit-2026-10-04/02-…Demon.jpg`); the
  iPhone 17 Pro Max demo build (built after the commit) shows "Down for
  Anything". No TestFlight binary contains the rename. `docs/AI_SETUP.md`
  notes that `eee5adc` shipped backend-only; it does not say that the rename
  commit `9953519` is also absent from every TestFlight build.
- **Impact:** testers and the App Store screenshot set see two different
  names for the same category; the server prompt now calls it Down for
  Anything while the client says Demon.

### F4 · Medium · Confirmed · Curated fallback has no coverage for most non-venue plans

- **Where:** `worker/curated-experiences.ts:432-446` — every option defaults
  to `settings: ["venue"]` (`:435`) except two outdoor friend options
  (fishing `:229`, e-bike `:264`) and one home option (wingman `:297`:
  adult + friends + Down for Anything + Bold + invitation/conversation
  participation).
  With `adultContext` on, only options flagged `nightlife` qualify (`:437`).
- **Actual:** when generation fails (timeout, duplicate concepts,
  `selected_concept_invalid`, review rejection) a solo or couple plan at home
  or outside, any chill plan outside a restaurant, and a Full Send
  adult-nightlife plan shorter than four hours (live show needs 240 min and
  $80/person) all get `discovery_unavailable` ("We couldn't make a strong
  experience within this plan. Try a different setting or a longer outing.").
  Honest, but it reads as "nothing fits" — report #17/18 territory.

### F5 · Medium · Hypothesis · Audio playback of takes may route to the earpiece while the capture session runs

- **Where:** `ios/App/App/SidequestCameraPlugin.swift` configures an
  `AVCaptureSession` with an audio input and never touches
  `AVAudioSession` category/options (no `.defaultToSpeaker`,
  `automaticallyConfiguresApplicationAudioSession` left default).
- **Why it matters:** with a running capture session the system audio
  session is play-and-record; WKWebView `<video>` playback of a take can come
  out of the receiver at low volume. The owner's "microphone playback" check
  is still open (`docs/APP_STORE_PREPARATION_2026-10-04.md` §Build 13). Test
  on hardware: record a take, tap play while the preview is live.

### F6 · Medium · Confirmed · Invalid DOM nesting in every `Empty` state that passes a paragraph

- **Where:** `src/components/ui.tsx:59` (`Empty`) and `:82` (`PageTitle`)
  wrap children in `<p>`; `src/pages/Creator.tsx:493-503` and
  `src/pages/Series.tsx:1502-1533` pass `<p>` and `<Link className="button">`
  children. React 19 logs "`<p>` cannot contain a nested `<p>`" 31 times in
  `.local/pw-full.log` (account-type, browser, business-audit,
  navigation-rewards, profile-layout, series and settings-layout suites).
- **Impact:** the browser closes the outer paragraph early, so the button
  renders outside the intended block; visible on an empty public profile and
  the `/series/new` dead end.

### F7 · Medium · Historical · Build-3 "no quest available" and location autofill

- Reports #15–19 (2026-10-01). Normal Create now calls the AI pipeline and the
  location step no longer defaults to "cafés"; verified in browser fixtures
  (`tests/experience-discovery-browser.spec.ts`, `apple-maps-browser.spec.ts`)
  and the Simulator location step (`14-create-step7-location.jpg`). Not
  reproducible on production from this audit.

### F8 · Low · Confirmed · Watermark text vs brand

- `renderer/overlays.mjs:9` burns in "Side quest app"; the product is
  "Sidequest" everywhere else and the roadmap says "Sidequest app". The owner's
  own review prompt asked for "Side quest app", so this is a decision to
  confirm, not a bug.

### F9 · Low · Confirmed · Reviewer's evidence field truncated

- `worker/quest-idea-quality.ts:48` `intensityEvidence: text(220)`; all 9
  live reviews came back at exactly 220 characters, 8 cut mid-sentence and
  two ending in stray non-Latin glyphs from constrained decoding. Review-only,
  not user-visible, but it means the reviewer never finishes its reasoning.

### F10 · Low · Confirmed · Demo iOS bundle cannot play its fixture feed video

- The Pro Max demo build's Discover card shows "This video could not play.
  Your place is saved." (`22-discover-feed-fixture-video-failed.jpg`). Demo
  only; irrelevant to production but it is the build Codex screenshots from.

### F11 · Low · Confirmed · Rewards tab opens on licensing money states for a consumer

- `/rewards` defaults to **Earnings** with "Demo paid earnings $0.00" and
  "Accepted · awaiting payment $0.00" above Perks (`17-tabs-1.jpg`). The brief
  says brand/UGC monetization should not clutter the consumer experience.

### Not defects, but owner decisions surfaced by the audit

- **Sign in with Apple is not implemented** (no `AuthenticationServices`
  usage, no entitlements file in `ios/App`). Apple 4.8 does not require it
  because the app only uses its own email account system; the owner's stated
  preference for Sign in with Apple is a product gap, not a review blocker.
- **Public browsing without an account** is allowed for Discover, posts,
  creators, quests and Series (`src/App.tsx:112-115`), contrary to the stated
  "everyone must make an account"; Apple 5.1.1(v) actually favours this.
- **Paid licensing** is manual (no IAP, no checkout). Apple 3.1.1 vs 3.1.3(e)
  is a judgment call for a brand-to-creator video licence consumed outside
  the app; be ready to explain it in review notes.

## 3. Feature / test matrix

Environment keys: **C** = container (unit, DB, Playwright on Chromium),
**S** = iPhone Simulator demo build on the Mac (background taps only),
**P** = physical iPhone (owner), **L** = live provider (OpenAI, synthetic).

| Area                                                       | Result                                                                                                                                                                                                                                                                 | Env | Evidence                                                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck, lint, build                                     | Passed                                                                                                                                                                                                                                                                 | C   | `.local/typecheck.log`, `lint.log`, `build.log` (exit 0)                                                                        |
| Unit tests                                                 | Passed 828/828, 70 files                                                                                                                                                                                                                                               | C   | `.local/unit.log`                                                                                                               |
| Isolated database suite, 23 migrations                     | Passed                                                                                                                                                                                                                                                                 | C   | `.local/db-test.log`                                                                                                            |
| `test:db:advisors`                                         | Not tested (no Supabase CLI here)                                                                                                                                                                                                                                      | —   | Codex's `.local/beta15-db-advisors.log` on the Mac is the last recorded run                                                     |
| Render fixtures                                            | Passed                                                                                                                                                                                                                                                                 | C   | `.local/fixtures.log`                                                                                                           |
| Full Playwright suite (286)                                | Passed — 283 in the 39 min run; the 3 that failed under load (`browser.spec.ts:342` synthetic recording, `capture-drafts-browser.spec.ts:527` overlay draft, `series-growth-browser.spec.ts:184` `ECONNRESET` from the dev server) passed 6/6 when re-run in isolation | C   | `.local/pw-full.log`, `.local/pw-rerun/`                                                                                        |
| Down for Anything label, saved prefs, older records        | Passed in source; **Failed in shipped build**                                                                                                                                                                                                                          | C/S | F3                                                                                                                              |
| Routing brief: age unknown / under 18 / 18–20 / 21+        | Passed (unit + live)                                                                                                                                                                                                                                                   | C/L | `tests/quest-routing.test.ts`, `age-eligibility-browser.spec.ts`; under-18 live run returned an age-appropriate trampoline plan |
| Adult opt-in + alcohol exclusion                           | Passed (exclusion honoured) / **Failed (forced adult tags)**                                                                                                                                                                                                           | L   | couple alcohol-excluded run: `conflicts=[]`, "No alcohol purchases", but `minimumAge 21` — F2                                   |
| Solo / couple / 3–6 friends                                | Passed                                                                                                                                                                                                                                                                 | L   | nine runs, participants pinned by schema literal `experience-discovery.ts:204-206`                                              |
| Chill / Bold / Full Send / Down for Anything               | Chill+Bold acceptable; **Full Send fails product bar**                                                                                                                                                                                                                 | L   | F1                                                                                                                              |
| Home / outside / venue                                     | Passed                                                                                                                                                                                                                                                                 | L   | solo home free, couple outside no listings, venue runs                                                                          |
| Free / limited / group vs per-person budget                | Passed                                                                                                                                                                                                                                                                 | L   | $0 home run, $30 per person × 6 = $180 cap honoured                                                                             |
| Finite time / Unlimited                                    | Passed mechanically; Unlimited not exploited                                                                                                                                                                                                                           | L   | F1 third bullet                                                                                                                 |
| Missing location / supplied places / pending costs         | Passed                                                                                                                                                                                                                                                                 | L   | kayak run with no listings; `venueCostUnknown` zeros with honest note in every paid run                                         |
| Repeated generation / retry / cached replay                | Passed by code + unit                                                                                                                                                                                                                                                  | C   | `Quest.tsx:193-266`, `experience-discovery.ts:550-575`, `tests/discovery-replay-preferences.test.ts`                            |
| Preference/age change before accepting                     | Passed by code + unit                                                                                                                                                                                                                                                  | C   | `validatePrivateAcceptance` re-reads profile; replay recheck `:553`                                                             |
| Participants/time/budget/setting/intensity survive         | Passed                                                                                                                                                                                                                                                                 | L   | `discoveryEligibility(...).blocking === []` on all nine results                                                                 |
| Curated fallback coverage                                  | **Failed** for home/outside/short nightlife                                                                                                                                                                                                                            | C   | F4                                                                                                                              |
| Camera: preview, permission denial/recovery                | Passed in browser mocks; **Not tested on P**                                                                                                                                                                                                                           | C   | `camera-preview-browser.spec.ts`, `native-camera-browser.spec.ts`                                                               |
| Hold/tap without duplicate start/stop                      | Passed by code + browser                                                                                                                                                                                                                                               | C   | `Capture.tsx:900-1052`, `nativeRecording`/`nativeStopping` guards                                                               |
| Multiple takes, pause/resume, timer, flip, zoom, torch     | Passed in browser mocks                                                                                                                                                                                                                                                | C   | `camera-zoom-browser.spec.ts`, Swift `cameraState()` presets                                                                    |
| Quest instructions without leaving capture                 | Passed (sheet)                                                                                                                                                                                                                                                         | C   | `Capture.tsx` instructions sheet                                                                                                |
| Gallery import, cancel, imported audio                     | Passed in browser; Simulator import documented by Codex                                                                                                                                                                                                                | C   | `browser.spec.ts:176` real import → render                                                                                      |
| Save draft, leave, relaunch, resume                        | Passed in browser; **Not tested on P**                                                                                                                                                                                                                                 | C   | `capture-drafts-browser.spec.ts`                                                                                                |
| Failed copy keeps footage                                  | Passed by code                                                                                                                                                                                                                                                         | C   | `Capture.tsx:308-360`, `retryNativeTakes`                                                                                       |
| Background / interruption / lock / account switch          | Passed by code only                                                                                                                                                                                                                                                    | C   | Swift observers `:100-158`, `clearRecordings`                                                                                   |
| Overlay drag/pinch/size + preview/export parity            | Passed in browser + renderer                                                                                                                                                                                                                                           | C   | `scripts/verify-session-renderer.mjs` pass (`watermarkLogo:true`)                                                               |
| Upload/render failure, retry, network interruption         | Passed in browser mocks                                                                                                                                                                                                                                                | C   | `media-actions-browser.spec.ts`                                                                                                 |
| Exported file: 1080×1920, H.264/AAC, audio, watermark      | Passed                                                                                                                                                                                                                                                                 | C   | §5                                                                                                                              |
| Photos/Files/share cancel + save                           | **Not tested** (needs device)                                                                                                                                                                                                                                          | —   |                                                                                                                                 |
| 60 s / 40 MB enforcement and messaging                     | Passed                                                                                                                                                                                                                                                                 | C   | Swift `:559-561`, `Capture.tsx:346,914,1122,1370`                                                                               |
| Sign in with Apple                                         | **Not implemented**                                                                                                                                                                                                                                                    | —   |                                                                                                                                 |
| Email signup/login, logout, deletion                       | Passed in browser mocks; delivery **Blocked**                                                                                                                                                                                                                          | C   | `email-sign-in-browser.spec.ts`, `password-sign-in-browser.spec.ts`, `AccountSecurity.tsx`                                      |
| Personal vs Brand onboarding, business workspace           | Passed                                                                                                                                                                                                                                                                 | C   | `account-type-browser.spec.ts`, `business-audit-browser.spec.ts`                                                                |
| Preferences: progress, save/resume, skip, reminders        | Passed                                                                                                                                                                                                                                                                 | C   | `preferences-wizard-browser.spec.ts`, `preference-identity-browser.spec.ts`                                                     |
| ChatGPT copy/open/paste/review                             | Passed in browser; app-vs-browser handoff **Not tested on P**                                                                                                                                                                                                          | C   | `chatgpt-handoff.ts`, `SidequestPlacesPlugin.swift:121-135`                                                                     |
| Discover filters, search, feed, Series nav                 | Passed                                                                                                                                                                                                                                                                 | C/S | `discover-*`, `23-series-library.jpg`                                                                                           |
| Budget slider and outing wizard                            | Passed                                                                                                                                                                                                                                                                 | C/S | `06`–`15-*.jpg`, slider dragged to $240 natively                                                                                |
| Location permission / denied recovery / place selection    | Passed in browser mocks                                                                                                                                                                                                                                                | C   | `apple-maps-browser.spec.ts`                                                                                                    |
| Accept → leave → Resume from Discover/Activity/Create      | Passed                                                                                                                                                                                                                                                                 | C/S | `open-quest-browser.spec.ts`, `01-…run-page.jpg` Resume card                                                                    |
| Edit profile save/cancel/error                             | Passed                                                                                                                                                                                                                                                                 | C   | `profile-browser.spec.ts`, `social-loading-browser.spec.ts`                                                                     |
| Private tab = journal only                                 | Passed                                                                                                                                                                                                                                                                 | C   | `profile-browser.spec.ts`                                                                                                       |
| Settings / support / privacy / terms / account             | Passed                                                                                                                                                                                                                                                                 | C/S | `public-information-browser.spec.ts`, `20`, `21-help-support.jpg` shows aaron@pilk.ai                                           |
| Social publication, privacy, block/report, moderation      | Passed in browser + DB                                                                                                                                                                                                                                                 | C   | `reel-publication-browser.spec.ts`, DB "reporting/blocking/moderation" PASS                                                     |
| Rewards, milestones, duplicate-award prevention            | Passed                                                                                                                                                                                                                                                                 | C   | `navigation-rewards-browser.spec.ts`, DB concurrency awards PASS                                                                |
| Brand functions gated                                      | Passed                                                                                                                                                                                                                                                                 | C   | `business-audit-browser.spec.ts`                                                                                                |
| Series: quest → turn into series → Part 2 → film → publish | Passed                                                                                                                                                                                                                                                                 | C   | `series-growth-browser.spec.ts` (+ DB growth invariants)                                                                        |
| Small iPhone, keyboard, safe areas                         | Passed at 320/390/430 in browser                                                                                                                                                                                                                                       | C   | `*-layout-browser.spec.ts`; Simulator 430 pt frames fit                                                                         |
| Dynamic Type / VoiceOver                                   | **Not tested** (200% text in browser only)                                                                                                                                                                                                                             | —   |                                                                                                                                 |
| Apple Maps claims                                          | Passed — consent copy says "Check opening hours, prices and availability before you go"; the model is told listings establish "not hours, ticket inventory, prices…"                                                                                                   | C   | `Quest.tsx:612`, `experience-discovery.ts:64`                                                                                   |

## 4. Actual AI examples

All runs: OpenAI `gpt-6-astra`, low reasoning effort, two calls each
(comparison+proposal, then review), synthetic listings `Synthetic …`, no real
user data, `store:false`. Inputs ≈4.2–4.5 k tokens and outputs 1.5–1.8 k per
proposal call; review ≈4.3 k in / 120–225 out. Latency 36–47 s per scenario.
Full transcripts: `.local/ai-eval/claude-audit-2026-10-04/<scenario>.json`
(container copy; synced to the Mac under the same path).

| Scenario                                                                                                                        | Result                                                                                         | Reviewer scores (P/G/O/AI/F) | Reading                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| couple · date night · Full Send · outside · $100 · no listings · 21+                                                            | **Two Paddles, One Big Loop** — tandem kayak shoreline circuit, 140 min, pending rental charge | 4/5/4/4/3                    | Good: concrete, ambitious for a date, honest about operator approval and weather                                                          |
| couple · date night · Chill · venue · $60 · age unknown · restaurant + food hall                                                | **A Little Night Market Feast** — two counters, one dish to cook later, 90 min                 | 5/5/3/5/4                    | Fine for Chill                                                                                                                            |
| solo · daytime · Bold · home · free · 18–20                                                                                     | **The Six-Minute One-Person Comedy Meltdown** — three characters, one continuous take          | 5/5/4/4/5                    | Good solo home idea; no purchases, honest failed-attempt ending                                                                           |
| 4 friends · late night · **Full Send** · venue · $400 · 4 h · 21+ · nightlife on · cocktail bar / dive bar / bowling            | **Four Games, No Hiding** — 3 rotating-partner bowling games + singles finale, 225 min         | 4/5/3/4/4                    | **Weak**: ordinary bowling, intensity from "four full games"; cocktail concept self-scored AI 3 and lost; tagged 21+ adult-only by schema |
| same plan, reroll with bowling as history                                                                                       | **Four Friends, One Horror Movie** — private live-actor horror escape room                     | 4/5/4/5/3                    | Strong, but only on the second attempt                                                                                                    |
| 6 friends · street challenges · Bold · outside · $30/person · strangers excluded · park                                         | **The Park Navigation Gauntlet** — pairs author 4-checkpoint routes, swap, score /16           | 4/5/4/4/4                    | Good free Bold idea; no stranger involvement                                                                                              |
| 3 friends · Down for Anything · **Full Send** · venue · **Unlimited** · $900 · 21+ · nightlife on · hotel / bar / music venue   | **Three Friends, One Loud Night** — attend an unfamiliar headline set, 180 min                 | 4/5/3/4/4                    | **Weak**: ignores Unlimited and $900; karaoke and cabaret were the alternatives                                                           |
| 4 friends · Down for Anything · Full Send · venue · $200 · **under 18** · trampoline park / arcade                              | **Trampoline Dodgeball: Every Possible Alliance** — three 2v2 alliances, best-of-three         | 4/5/4/4/3                    | Good and age-appropriate; asks about guardian waivers; no adult tags                                                                      |
| couple · late night · Bold · venue · $150 · 21+ · nightlife on · **alcohol excluded** · wine bar / cocktail house / comedy club | **Your Private-Room Headliner Set** — private karaoke for two                                  | 4/5/4/4/4                    | Exclusion honoured ("No alcohol purchases") but karaoke again; DJ-lesson concept (O5/AI5) lost to karaoke on playability                  |

Rejected or weak outputs on record (Codex's `.local/ai-eval` on the Mac;
container copies under `.local/evidence/ai-eval/`): the 2026-10-01
five-friends Full Send attempt whose three concepts scored audienceIntensity
2/3/3 and were all rejected at the concept stage; "Last Friend Standing: Darts Night"
approved by the model with audienceIntensity 3 — rejected by the shipped
gate on replay; "Five Friends, One Ridiculous Headline Set" (karaoke) approved
and still accepted by the shipped gate.

What a user sees for every paid venue idea: cost `$0–$0`, "Booking price to
check", a note that zero is a pending-price placeholder, and requirements that
restate "the listing confirms none of these". That is honest; it is also three
confirmations before the first exciting sentence.

## 5. Camera and export evidence

**Browser/mock evidence (container):** `camera-preview`, `camera-zoom`,
`native-camera`, `capture-drafts`, `media-actions` and `browser.spec.ts`
suites exercise permission denial/recovery, hold/tap guards, multi-take
sessions, timer/flip/zoom/torch state, import, draft restore, failed-copy
retry, overlay gestures and render/upload failure paths against mocked
MediaRecorder/plugin bridges. `browser.spec.ts:176` imports a real fixture,
renders a real MP4 through the local FFmpeg renderer and downloads it.

**Renderer export (container, real FFmpeg):** `scripts/verify-session-renderer.mjs`
passed (`watermarkLogo:true`, overlay placement retained). An independent
export of `.local/fixtures/landscape-with-audio.mp4` through `renderReel()`
produced `.local/export-proof/<id>.mp4`: 8.0 s, 1080×1920, H.264 yuv420p 30
fps (no rotation side data), AAC 48 kHz stereo, mean volume −24.1 dB (audio
present), MP4 `isom`; frame at 4 s shows the white logo and "Side quest app"
pill at bottom-left (`.local/export-proof/watermark-crop.png`). Render time
22 s on this container.

**Simulator evidence (Mac, demo bundle, background taps):** Create wizard
steps 1–7 and the review header, Activity, Discover (Quests and Series),
Rewards, Profile, Settings and Help & support captured at 430 pt
(`.local/ios-evidence/claude-audit-2026-10-04/`). The native camera is
refused in the Simulator (`camera_simulator`), so capture there is
import-only, as Codex documented. Background control cannot scroll a
WKWebView (Page Down, Tab and AX scrolling all no-ops), so anything below the
first screen — including "Find my quests" and the camera — was not reached
in this session; the owner can take over the Simulator window to finish
(exact steps in §8).

**Physical-iPhone evidence:** owner-confirmed preview and zoom on Build 12
only. Still owed on hardware (none observed by this audit): a real recording
with microphone audio and its playback (F5), two takes in one session,
leave/relaunch/resume with takes intact, camera/microphone permission denial
and re-grant from Settings, backgrounding and lock mid-take, incoming call,
account switch clearing drafts, Photos import with sound, the overlay drag/pinch
on a touch screen, Complete quest → render → Save Video / share sheet / cancel,
and playing the saved file from Photos.

**Enforced limits today:** native `maxRecordedDuration` 60 s, `maxRecordedFileSize`
40 MB, `minFreeDiskSpaceLimit` 50 MB, H.264 ~3 Mbps 1080p
(`SidequestCameraPlugin.swift:559-580`); JS session cap 60 s / 30 takes / 40 MB
(`Capture.tsx:914, 346`); import "no larger than 40 MB" and "between 5 and 60
seconds" (`:1122, :1370`); renderer 5–60 s selections with a 60.1 s compose
tolerance, 100 MB output, 240 s budget (`renderer/contracts.mjs:5-12`,
`renderer/core.mjs:525-531`); DB 60 000 ms / 40 MB. Messages match.

**Feature gaps (planned, not shipped):** thumbnail timeline with trim/split/
reorder/undo; multi-asset gallery import and photo duration; cover-frame
picker; local export with progress; separate music/voiceover tracks and
mixing; speech captions and text/sticker layers; timed or multiple overlays,
rotation; teleprompter persistence; recording speed, filters, enhancement,
green screen, retouch; 3 m / 10 m recording (every layer enforces 60 s / 40 MB);
duet/stitch/TikTok posting. Toolbar today offers 15/30/60 s, hold or tap,
timer 0/3/10 s, flip, torch, 0.5×/1× presets, one still overlay, instructions
sheet and teleprompter.

## 6. Beta feedback reconciliation

Source: App Store Connect export retrieved by Codex at 2026-10-04 19:34 UTC
(`.local/beta-feedback-current-2026-10-04.json` on the Mac, container copy in
`.local/evidence/`; 28 screenshot reports, 0 crash submissions; all from one
iPhone 15 Pro, iOS 18.7.3). This audit could
not pull a fresher export: the API key lives outside the connected folder.
Anything submitted after Build 15 went live (22:20 UTC) is unknown.

| Build                      | Reports                                                                                                                                                                                                                                                                                                                                                        | Status                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 (20 reports, 2026-10-01) | Layout fit/scroll (#8, #9, #13), transport and budget dropdowns (#6, #7, #20), ChatGPT button/prompt UI (#10, #11), ChatGPT opens browser (#12), location autofill "café" (#5, #19), nothing populates / no quest available (#15, #17, #18), boring Full Send quests (#1, #2), "not terrible" (#3), profile could not be updated (#14), More options tab (#16) | Fixed-and-retested in browser/Simulator for #5–#11, #13–#20 (wizard screens fit at 430 pt, pill controls, single ChatGPT step, AI-driven Create, location optional). **#12 unresolved on device** (universal-link handoff built, never confirmed on a phone). **#1–#2 partly fixed, not resolved** (F1). |
| 11 (1)                     | Zoom presets 0.5/1.0 and pinch                                                                                                                                                                                                                                                                                                                                 | Fixed in Build 12 (`f493857`), owner-confirmed on device                                                                                                                                                                                                                                                 |
| 12 (3)                     | "couldn't film" after stop; UI spacing; drag/pinch overlay                                                                                                                                                                                                                                                                                                     | Fixed in Builds 13 and 14 per docs; **not retested on device by anyone** (Codex's bridge could not interact with the Simulator for Build 14)                                                                                                                                                             |
| 13 (4, duplicates)         | Loading error on every tab                                                                                                                                                                                                                                                                                                                                     | Fixed live by migration `20261004194705` (hosted); reproduced by Codex with the production error before, 200s after. Not re-verified here.                                                                                                                                                               |

New in this audit: none from testers (no fresh export); F1–F11 above are
new findings from code and live runs.

## 7. Prioritized repairs and missing features

1. **Make Full Send measurable** (F1). Suggested shape: require each
   candidate to state `ordinaryVersion` (what the same group would do on a
   normal night) and `whatMakesItMore`; reject candidates whose activity is
   in a short "ordinary unless transformed" list (bowling, karaoke, darts,
   arcade, trivia, board games, dinner, escape room at Bold) unless the
   transformation is named; restore the removed negative definition to both
   prompts; give originality weight 2 for Full Send; have the reviewer score
   `ambition` relative to the ordinary version and block < 4 for Full Send.
   Re-run the nine scenarios in §4 and require ≥ 7 to read as Full Send.
2. **Let the model set the adult metadata** (F2): drop the three literals,
   validate `minimumAge ≥ 21` only when the proposal tags `alcohol`, and
   keep the server-side age recheck.
3. **Ship the rename** in the next TestFlight build (F3) and regenerate the
   App Store screenshot that shows the category.
4. **Add fallback families** for solo/couple home and outside, chill
   outside, and a 2–3 hour adult-nightlife option (F4); or change the
   `discovery_unavailable` copy to say the AI could not finish rather than
   "nothing fits".
5. **Hardware verification session** for everything in §5 "still owed",
   starting with F5 (take playback audio route).
6. **Email delivery:** configure a production SMTP sender in Supabase and
   create a fresh account from a non-reviewer address before submission.
7. **Moderation:** assign an operator with a clear scope, run one end-to-end
   report → review → removal on production.
8. **App Review packaging:** reviewer notes explaining self-reported age,
   adult-content gating, manual licensing (no IAP), and the public browse
   path; confirm age-rating answers include alcohol references and mature
   themes; finalise App Privacy from `docs/APP_PRIVACY_INVENTORY_2026-10-02.md`.
9. **Purge plaintext credential exports** from `.local/` and rotate anything
   that was written to disk; delete `_to_delete/`.
10. Fix `Empty` nesting (F6); open Rewards on Perks for personal accounts
    (F11); confirm the watermark wording (F8); widen `intensityEvidence` (F9).
11. Decide on Sign in with Apple (product preference) — not a review
    requirement while the app has no third-party login.

Missing features vs. the owner's camera reference are listed in §5.

## 8. Commands, counts, artifacts, uncertainty

Run in the container on the snapshot (Node 22.22, Playwright 1.63,
Chromium 1243, FFmpeg, PostgreSQL 16 as an unprivileged user):

| Command                                                                        | Result                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                            | exit 0                                                                                                                    |
| `npm run lint`                                                                 | exit 0                                                                                                                    |
| `npm test`                                                                     | 828 passed, 70 files                                                                                                      |
| `npm run build`                                                                | exit 0                                                                                                                    |
| `npm run render:fixtures`                                                      | exit 0                                                                                                                    |
| `npm run test:db` (`node scripts/db-test.mjs` as `pgtest`)                     | PASS, 23 migrations, 753 seeds                                                                                            |
| `npm run test:db:advisors`                                                     | not run (needs Supabase CLI)                                                                                              |
| `npm run test:browser`                                                         | 283 passed / 3 failed in one 39 min run; those 3 re-run twice each in isolation: 6/6 passed (container load, not product) |
| `node scripts/verify-session-renderer.mjs`                                     | pass                                                                                                                      |
| Live discovery evaluation (custom harness over `generateDiscoveredExperience`) | 9 scenarios, 18 calls, 0 provider failures                                                                                |
| `npm run ios:simulator -- --demo`                                              | not run here (Xcode is Mac-only); two demo builds were already installed                                                  |

Artifacts (container paths; `.local/` items synced to the Mac):
`docs/CLAUDE_AUDIT_2026-10-04.md` (this file),
`.local/ai-eval/claude-audit-2026-10-04/*.json` (nine transcripts),
`.local/export-proof/` (rendered MP4, frame, watermark crop),
`.local/ios-evidence/claude-audit-2026-10-04/*.jpg` (24 Simulator captures),
`.local/pw-full.log`, `.local/pw-full/` (Playwright traces for failures),
`.local/unit.log`, `.local/db-test.log`, `.local/claude-audit-discovery*.log`.

Simulator steps for the owner (full control, iPhone 17 Pro Max demo window):
Create → fill all seven steps → scroll → **Find my quests** → pick a card →
Accept → **Record or import video** (expect the Simulator camera notice) →
Import video → Save video → Complete quest → confirm the render, Save Video
and the Photos playback with sound. Then `npm run ios:simulator -- --demo` on
the current tree so the Pro Max build matches HEAD, and a production build
for the reviewer-account flows.

Uncertainty: no production API or App Store Connect access from this audit
(email delivery, moderation, the hosted migration state and fresh TestFlight
feedback are reported from Codex's dated evidence); the live model is
non-deterministic, so the nine runs are a sample, not a rate; Dynamic Type,
VoiceOver, keyboard avoidance and every hardware camera behaviour remain
untested; the three Playwright failures in the full run are load artifacts of
this container (all pass in isolation and in Codex's CI run for `4025788`).

## 9. Conclusions

**Current TestFlight usability:** fit for internal testing. Builds 13–15
addressed every Build 12/13 report, the loading-error regression is fixed on
the hosted database, and the suites are green. Testers should be told that
"Demon" is now "Down for Anything" (not in their build), that Full Send ideas
are still uneven, and that camera recording/export is the thing to try and
report on.

**Public App Store readiness:** not yet. The product's central promise
(ideas worth doing at the chosen intensity) is not reliably delivered for
Full Send; no human has verified a recording-to-export cycle on hardware;
account email delivery and moderation operations are unconfigured; and the
adult-content behaviour needs deliberate review packaging. None of these are
code-size problems — F1 and F2 are prompt/schema changes with a measurable
re-test, the rest are configuration, device time and decisions.
