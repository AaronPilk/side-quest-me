# Claude review — uncommitted pass after build 1 (2026-10-01)

Scope: the working tree described in `docs/CLAUDE_REVIEW_PROMPT.md` (account
intent, menu removal, profile/Series/business polish, Discover search race,
direct preferences wizard, draft ownership, optional AI filming help). Local
only. Nothing was pushed, deployed, migrated on production, or uploaded to
TestFlight. Build 1 is unchanged.

How it was reviewed: the exact working tree (tracked + untracked, excluding
ignored files) was snapshotted into an isolated Linux container and read
against the committed baseline diff; five focused code reviews (account type,
drafts/wizard, Discover, AI, navigation/UI) were followed by the full JS
toolchain and browser suites there; the iPhone Simulator on the Mac was driven
in background mode against the build Codex had already installed.

## Verdict

The pass is sound in the areas that carry risk — authorization, privacy, draft
isolation, the Discover race, the AI request contract — and ready to continue
toward a release **after** the fixes below are rebuilt and re-verified on the
Simulator. Nothing found is a data-safety or security blocker. Three findings
would have been user-visible on day one and are fixed in this tree.

## Confirmed defects — fixed in this tree

| #   | Severity | What                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                             | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | Real (Supabase) accounts could never reach the new account-type step. Every in-app entry pointed at `/onboarding?preferences=1`, which clamps to question 1 and never renders the account choice; the only full-flow entry was the demo Welcome button. Real users stayed `accountType: null` and `onboardingCompleted: false` forever unless they found Settings → Account settings.            | `QuestWizard.tsx`, `PreferenceReminder.tsx`, `Quest.tsx`                                          | First-run accounts (no account type **and** onboarding not completed) are sent to the full `/onboarding` from the Create nudge and the reminder, so the account choice is their first step; everyone else keeps the direct wizard. Direct editing still never touches account type. New browser test: first-run nudge → "Your account" → Personal → optional context → questions → Cancel returns to the exact quest; afterwards the same nudge opens the 11-question editor. |
| 2   | Medium   | Wizard **Skip** persisted an accidental tap. On a multi-choice screen, tapping a chip then Skip saved it (the screen says "Skips stay unknown"). **Reproduced natively** on iPhone 17 / iOS 26.4: after Skip + Back the chip was still checked and labelled "Answer from survey" (`.local/ios-evidence/claude-review-2026-10-01/wizard-0*.jpg`). Each skip also issued a full-preferences PATCH. | `Onboarding.tsx`                                                                                  | Skip now restores the last server-confirmed answer for that question and advances without a write. An explicit "Reset answer to unknown" saves immediately (it is an explicit choice, like a chip), so Reset → Skip still persists unknown and the existing wizard test keeps passing. New browser test covers tap → Skip → unchanged saved value, Back shows the saved chip, reload.                                                                                         |
| 3   | High     | AI filming help on an **active** quest always failed. Accepted runs store the outing with the assigned `role`; `aiQuestRequestSchema` uses the strict `outingSchema`, so the client threw before any request and rendered the raw ZodError JSON. The browser spec never caught it because it mocks `assist` wholesale and only mounts on the selection page.                                     | `ai-quest-api.ts`, `AiQuestAssist.tsx`, `shared/domain.ts`                                        | Added `OUTING_KEYS`/`pickOuting`; the client projects the outing before validating. Schema-validation failures now show the generic retry copy. Unit tests prove a stored run outing is rejected as-is and accepted once projected.                                                                                                                                                                                                                                           |
| 4   | Medium   | With the menu gone, the Business workspace was only reachable after a successful `me` read (Settings, Rewards, /account all gated on `me.data`); when `/api/me` failed, `/account` returned before rendering Sign out / Delete, and nothing else in the app signs out.                                                                                                                           | `Settings.tsx`, `Profile.tsx`                                                                     | Settings shows Business workspace and Admin entries while the account read is failing (both routes gate themselves and carry a retry); `/account` renders Sign out and Delete my account in its error state. Browser tests extended.                                                                                                                                                                                                                                          |
| 5   | Medium   | Legacy **pending/rejected** applicants and an approved brand that just edited its profile (which resets the business to `pending`) lost the workspace: the gate and `/studio` only accepted `isBrandAccount`, whose inference needs `state === "approved"`. Their stored `brand_review` notification (`/studio`) redirected to creator offers and `/business` bounced to `/account`.             | `shared/account.ts`, `BrandAccountGate.tsx`, `CommunityStudio.tsx`, `Rewards.tsx`, `Settings.tsx` | New `hasBusinessWorkspace`: explicit Brand, or an unstated account that already holds a business record in any review state; explicit Personal never. This is routing only — `isBrandAccount` and every approved-only server check are unchanged. Unit tests added.                                                                                                                                                                                                           |
| 6   | Low      | `/account` "Save account type" was disabled whenever the selection equalled the displayed value, so a user whose Brand status was only inferred (null + approved business) could never store it explicitly.                                                                                                                                                                                      | `Profile.tsx`                                                                                     | Save is disabled only when nothing is selected; saving an unchanged value is an idempotent PATCH.                                                                                                                                                                                                                                                                                                                                                                             |
| 7   | Low      | A late `saveAndLeave`/`finish`/account-choice response from a previous mount (for example after a native A→B sign-in) still ran `sessionStorage.removeItem(draftKey)` and `navigate(...)` from the stale closure, which could remove B's fresh draft and yank B out of the wizard. The server write itself was already pinned to A.                                                              | `Onboarding.tsx`                                                                                  | A mounted ref guards every post-await side effect.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | Low      | Approved-business CTA row: the global `.button + .button { margin-top: 12px }` pushed "Edit business profile" 12 px below "Explore available videos" and made it shorter on wider screens.                                                                                                                                                                                                       | `business-workspace.css`                                                                          | `margin: 0` on the pill group, matching the other new pill groups.                                                                                                                                                                                                                                                                                                                                                                                                            |

## Confirmed but left as-is (report, no change)

- The `me` DTO from `/api/me` normalises account type **without** the business
  record while `community/me` normalises **with** it, so a null-type account
  with an approved business reads as Brand in Settings/Discover and as unknown
  on `/account`. After the migration backfill this population is tiny (accounts
  disabled at migration time, or a client that PATCHes `null`). Fix 5/6 make it
  recoverable; unifying the two reads is a follow-up.
- Post-save draft sync replaces the other flow's `preferences` wholesale
  (`profile-drafts.ts`); with two live drafts a wizard save can drop an unsaved
  answer in the ten-question draft. Arguably by design; worth a note in the
  code.
- On the review page, a free-text-only answer (e.g. a humor example with no
  chip) reads "Confirmed" while progress counts it missing; cosmetic.
- "Looks right" on the full flow for a legacy user with no account type bounces
  to the account step without a message; works, reads as a broken button.
- Dead CSS for the removed menu (`.space-menu`, `.secondary-nav`,
  `.desktop-space`) remains in `design.css`/`glass-design.css`/
  `navigation-design.css`.
- The "Quest preferences" shortcut renders for Brand accounts while the
  reminder hides for them; probably unintended, harmless.
- Group-size input (pre-existing) can show a stuck leading zero when cleared and
  retyped; the budget input guards against this, the group input does not.

## Hypotheses — not reproduced

- `worker/ai-quest.ts` uses `minLength`/`maxLength` inside a `strict: true`
  JSON schema; OpenAI's strict subset has historically rejected those keywords.
  `docs/AI_SETUP.md` says one live call succeeded, so treat as low. Because the
  catch swallows the upstream status, a schema rejection in production would be
  undiagnosable; logging the status code (never the body) would be within the
  no-bodies rule.
- Deploy ordering: `deploy.yml` runs `wrangler deploy` with no migration step.
  If the Worker ships before `20261001173038_account_type_intent.sql`, `/api/me`
  selects a missing column and every signed-in user sees "Your profile could not
  be loaded". Documented, not enforced.
- A tab change on Discover during the sub-frame window after a submit could
  drop the just-submitted `q` (built from committed params). Not reproducible by
  a person.
- Pinned access token on profile PATCH: a save delayed past token expiry now
  401s instead of using a refreshed token; user sees the error, draft retained.

## Areas confirmed sound

- **Authorization:** `account_type` is read only in `sq_community_read('me')`
  and `profileDto`; no SQL or Worker authorization path references it.
  `offer_create`, `offer_fulfill`, commercial download and `/api/operator` still
  gate on `business_profiles.state='approved'` / `private.is_operator`. The
  Worker PATCH rejects non-enum values before any write. Migration: nullable,
  check constraint, column-level grant consistent with the core migration,
  backfill restricted to active + approved, function replacements limited to
  adding `accountType` and nulling it on deletion (diffed line by line).
- **Privacy:** no public view serialises `account_type`. AI provider payload is
  limited to published quest mechanics, confirmed structured answers (free-text
  fields excluded), bounded outing fields and a coarse place category; no
  summary, identity, area, coordinates or Apple place IDs. Responses API shape,
  strict JSON schema, `store:false`, 64 KiB cap, 30 s abort, generic 503 on any
  failure, separate 3/min limiter, secrets server-side only, no `VITE_`.
- **Draft isolation:** both draft keys are read only through the owner check;
  `accountIdentityChanged` keeps drafts on INITIAL_SESSION / TOKEN_REFRESHED /
  USER_UPDATED / same-id SIGNED_IN and clears them on a different id or
  SIGNED_OUT; delayed saves stay pinned to their original session and skip sync
  when the owner changed.
- **Discover race:** traced every requested sequence (rapid submits, typing
  mid-transition, Clear, Back/Forward, reel open/close, tab change with a query,
  fresh `/discover?q=`) against React Router 7.18's `startTransition` behaviour;
  markers cannot survive and no effect loops.
- **Navigation/profile:** bottom nav is Discover, Activity, Create (centred),
  Rewards, Profile; Profile → Settings renders in loading, error and loaded
  states; tabs, owner-only controls, server-derived counts and crowns intact;
  no fixed widths that would overflow at 320 px in the changed CSS; violet on
  white 5.09:1 and on the canvas 4.71:1.

## Verification on the final tree

| Check                                                                                                                             | Result                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run typecheck`                                                                                                               | exit 0                                                                   |
| `npm run lint`                                                                                                                    | exit 0                                                                   |
| `npm test`                                                                                                                        | 51 files, **509 passed** (was 505; +4 unit tests)                        |
| `npm run build`                                                                                                                   | ok                                                                       |
| `npm run render:fixtures`                                                                                                         | ok                                                                       |
| Focused browser suites after the fixes (`preferences-wizard`, `preference-identity`, `profile`, `account-type`, `consumer-audit`) | **41 passed** (two new scenarios)                                        |
| Full `npx playwright test` (128 scenarios)                                                                                        | see the line appended below once the run completes                       |
| `npm run test:db` / `test:db:advisors`                                                                                            | **not run** here (initdb refuses root; no Supabase CLI) — run on the Mac |

### iPhone Simulator (background control, Codex's pre-fix build, iPhone 17 / iOS 26.4)

Checked: preferences wizard screens 2–3 (safe areas, controls above the home
area), Skip defect reproduced natively (see fix 2), Save & leave → Profile
(photo, @username, bio, counts, Edit/Share, preferences shortcut, milestone
card), Profile → Settings entries (Account settings, Private journal, Business
workspace for the persona that chose Brand, Demo tools), Account & preferences
progress card first, Business workspace status card and shortcut pills at
390 px, "Set up business profile" opening and focusing the Business name field
with the keyboard, Demo tools page. Screenshots:
`.local/ios-evidence/claude-review-2026-10-01/`.

Not checked in the Simulator: anything that needs scrolling or a native popup
(persona switch `<select>`, lower profile tabs, account-type section on
`/account`) — background control cannot scroll a WKWebView or open pickers —
and **none of the fixes above**, because the installed build predates them.

## Release blockers before another TestFlight / production step

1. Rebuild and re-check the Simulator on this tree:
   `npm run ios:simulator -- --demo`, then: fresh demo → Create nudge opens the
   account choice first; Settings for a Personal persona has no Business entry;
   Brand persona workspace; wizard tap → Skip leaves the saved answer;
   `/account` after a forced profile failure still shows Sign out.
2. `npm run test:db:advisors` on the Mac (13 migrations).
3. Apply `20261001173038_account_type_intent.sql` to the hosted project
   **before** deploying the Worker that selects `profiles.account_type`.
4. Decide the AI rollout separately: the owner's key is not configured; the
   feature is dormant in production until it is. Consider logging the upstream
   status code on failure first.
5. Physical-device checks remain owed (camera, share sheet, Safari behaviour,
   push-free reminders on a real account).

Public-release requirements (privacy/support/terms pages, moderation staffing,
age handling) are unchanged by this pass.
