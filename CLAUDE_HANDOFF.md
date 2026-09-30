# Sidequest — complete Claude handoff

Prepared September 30, 2026. This is a working-state handoff, including unfinished local changes. It is not a claim that the latest audit is complete or production-ready.

## 1. Read this first

Continue the existing app. Do not start another project or replace the implementation with a mockup.

| Item | Exact state at handoff |
| --- | --- |
| Local repository | `/Users/pilksclaes/Side Quest Me` |
| GitHub | <https://github.com/AaronPilk/side-quest-me> |
| Branch | `main` |
| Local committed HEAD | `a14f17d` — deployment documentation |
| Live application code | `9eb8bdf5194242546ba18297ec9d4b2471bc92f4` — violet brand release |
| Live app | <https://sidequest-me.aaron-9c3.workers.dev> |
| Local demo | <http://127.0.0.1:5173> |
| Latest work | A substantial **uncommitted** consumer/social/business/camera audit, included in the working tree and handoff source archive |
| Latest work deployed? | **No.** No commit, push, production migration, or deployment of this audit has occurred. |
| Latest audit completely verified? | **No.** See the exact passing checks, failures, and unfinished coverage below. |
| Latest user request | “write me a full handoff for claude claude needs to know everything” |

The request immediately before the handoff was to test every feature and button, fix missing/broken functionality, and improve the app toward a social-media-quality experience while building a real UGC business. The owner supplied Trybe and Artec as references. Work on that audit began, but the user then requested this handoff. Preserve the changes and finish their verification before treating them as a release.

**GitHub alone is insufficient to resume the newest work.** The source archive contains the current working files, including untracked components, tests, and a new migration. If Claude Code is on this Mac, use the existing directory directly. If using another machine, use the archive or deliberately transfer the dirty changes after cloning the repository. Do not overwrite a newer checkout blindly.

No root/ancestor `AGENTS.md` was found during this work. Recheck instructions on arrival. Existing docs sometimes contain historical statements such as “all changes remain local.” The deployment record and this dated status distinguish the live baseline from the new local work.

## 2. Paste-ready instruction for Claude

> Continue building Sidequest in `/Users/pilksclaes/Side Quest Me`. First read `CLAUDE_HANDOFF.md`, the audit notes in `docs/audit-*.md`, current repository instructions, and `git status`/`git diff`. Preserve all existing changes. The app is already deployed, but the latest social/capture/business audit is uncommitted and not fully verified. Finish that audit and fix the documented failures before expanding the product. Test actual actions and persistence, not just page rendering. Keep Create first, the guided quest setup, the approved violet brand, private participation, accurate outing constraints, real social behavior, and the distinction between proposals, pending payments, and verified earnings. The product should feel like a polished social experience built around real-world quests, with optional exact-video licensing as a business. Study the supplied Trybe and Artec references without copying their branding or pretending unimplemented AI/payment capabilities work. Run the full relevant checks, verify mobile and desktop flows, and report exactly what passed, what failed, and what still needs configuration. Do not reset the working tree, expose credentials, create replacement cloud resources, silently weaken eligibility, or deploy incomplete work. The handoff lists existing production targets and prior deployment authorization; inspect the current state and finish a concrete verified release before publishing changes.

If Claude only has chat/file access, it should review the bundle and propose concrete patches against these files, and say clearly which checks it cannot execute. It must not claim to have tested or deployed through a tool it does not have.

## 3. Product vision and owner priorities

Sidequest helps people find real-world adventures, dates, social challenges, elaborate surprises, and appropriate consensual pranks; do them; make a short video; keep it private or publish it; and inspire someone else to make their own version.

The core loop is:

**Discover a quest video → Try this quest → Confirm your own plan → Do the activity → Film your story → Keep private or publish → Inspire another attempt → Optionally receive an offer to license that exact video.**

The distinctive asset is the relationship between the activity, its instructions, its versions, and many different attempts. A generic entertainment feed or generic UGC marketplace would lose that differentiation.

The owner wants a real business competing with Trybe in a unique way. UGC is the monetization opportunity, but the app must be useful and enjoyable even when someone never publishes or works with a brand. Brand tools belong in context; everyday users should not have to navigate a business dashboard to go on a date or make a funny video.

### Explicit experience requirements

- Apple-inspired clarity and restraint, combined with Meta/Instagram/TikTok familiarity. Use Sidequest's own approved brand.
- **Create is the first bottom-navigation destination.** Current order: Create, Discover, Rewards, Activity, Profile.
- Create feels like onboarding: one concise question per step, progress, back/edit, remembered answers, and a review before selection.
- Budget input must be editable without a stuck leading zero.
- Time choices are **1 hour, 3 hours, 5 hours, unlimited**.
- A date for two outside at Full Send must not turn into a Chill activity for four to six people. Never quietly alter the user's constraints.
- Avoid long generic “Let's adjust the plan” dead ends. Explain actual requirements when something cannot fit. Recovery is an explicit user choice, with boundaries preserved.
- Remove unnecessary travel-cost questions and blanket “anything already arranged?” steps. Request only confirmations actually needed by a selected quest; unknown is not permission.
- Prefer current location/coarse area and real places/events. The owner specifically asked for Eventbrite and other local sources. Current implementation does not automatically scan Eventbrite.
- A large catalog with worthwhile, varied activities. Catalog expansion is already present, but editorial quality is an ongoing need.
- Recording should allow record → stop → add another take → finish a part, return later, and make a short vertical reel.
- Filming advice must match the particular quest, including opening hooks, action, payoff, and a possible loop. Do not invent what the footage contains.
- Public profiles should feel like social profiles: photo, @username, bio, real counts, portrait video grid, follow and share.
- Demo persona controls should be in Settings → Demo tools, not appear as a normal user's role choice.
- Rewards should expose Earnings, Perks, and Brand offers, with truthful financial states.
- Multipart Quest Series should work as real authored activities and personal completion, not a decorative playlist.
- Every displayed button must work, explain a real unavailable state, or be removed. Empty/loading/error/retry states and browser refresh matter.
- The owner prefers implementation and verification over another proposal or repeated confirmation questions.

### Earlier profile milestone that must remain intact

- Unanswered questions remain unknown. Skipping an unanswered role cannot create “Happy to rotate roles.”
- Moving past an answered question preserves it. Explicit reset clears it.
- Historical defaults that cannot be distinguished from real choices are honestly marked unconfirmed.
- Optional ChatGPT summary text remains separate from confirmed structured preferences.
- Users can edit/remove the summary without repeating onboarding; removal saves immediately and persists after refresh.
- Removing imported text does not erase independently confirmed answers.
- Watching prank videos is not permission to perform pranks. Product-design requests are not personal preferences. Negation, uncertainty, and unknowns must not become positive preferences.
- No configured AI parser currently exists. Manual review is implemented and useful; no keyword extraction is presented as reliable language understanding.
- Firm boundaries are hard filters; confirmed interests/skills/willingness/participation/preparation can improve ranking. Current outing inputs stay authoritative.

## 4. Competitor references and product implications

These are vendor-described capabilities, not capabilities independently tested by us. Recheck current pages before making commercial claims.

**Trybe:** its site presents creator-program operations for brands: recruiting creators, managing submissions/revisions, content permissions, advertising workflows, commerce/attribution integrations, and creator compensation. The useful lesson for Sidequest is the operational path from finding a suitable piece of content to agreeing terms and tracking fulfillment. Sidequest already has a narrower exact-video licensing workflow. It does not have Trybe's full program, ad, commerce, communication, or payout stack. [Trybe official site](https://jointrybe.com/)

**Artec:** its website markets content improvement, coaching, and a proprietary content score. Brand deals are labeled “Coming soon” on the site. The App Store description discusses hook/body/ending feedback and prediction-related features. A release-note entry says view estimates were removed, despite marketing text still discussing estimates; do not treat those claims as a verified product specification or replicate them as a trustworthy forecast. [Artec official site](https://shareartec.com/), [Artec App Store listing](https://apps.apple.com/us/app/artec-ai-viral-predictor/id6751553903)

**Direction inferred from these references:** combine an enjoyable quest/attempt social loop with practical creation coaching and a usable licensing business. Do not add fake view estimates, “viral” guarantees, fake earnings, or dead payout buttons to look competitive.

Current audit adds “Shape your story,” an editorial review based on the authored quest and saved edit metadata. It does **not** watch footage, recognize speech, evaluate acting, calculate a proprietary AI score, predict reach, or value a brand deal.

Potential later roadmap, **not implemented or approved pricing**:

1. Better quest-linked social discovery and retention: Following, search, series, meaningful notifications, saved quests if a genuine backend is built.
2. Reliable creation tools and optional evidence-based transcript/video feedback after a real provider and review UX are implemented.
3. Brand discovery, shortlists, offers, clear permissions, and reliable delivery; existing exact-video licensing is the starting point.
4. Real payment integration, reconciliation, explicit platform fee policy, and only then payout controls.
5. Attribution/ad-platform or commerce integrations after the core loop and commercial demand are proven.
6. Funded local quests and carefully disclosed partnerships remain separate from licensing an existing video. There are no actual venue deals or live funded campaigns yet.

## 5. What is already built in the committed/live baseline

The application is considerably beyond a prototype. Preserve the working systems instead of replacing them with front-end-only versions.

| Area | Existing implementation | Important limit |
| --- | --- | --- |
| Accounts | Supabase email authentication, private profile, account status, scoped roles | Public email delivery needs custom SMTP configuration |
| Preferences | Ten-question onboarding, unknowns, provenance, manual summary review, immediate summary removal | No automatic language parser |
| Create | Guided outing questions, saved progress, selected quest/inspiration return path, review/edit, matching | Some UI/edge paths are being audited now |
| Catalog | 1,113 published variants across 73 reward families | These are authored activities/intensity variants, not 1,113 live local events |
| Matching | Deterministic ranking, hard filters, exact version acceptance, pagination, truthful reasons | No AI recommendation provider |
| Nearby | Coarse/current location, Apple Maps integration code, optional event provider, external browsing | Apple/Ticketmaster keys not installed; Eventbrite is a link only |
| Capture | Camera/upload, take assembly, three selected parts, trims, captions, fit/mute, identity-scoped local draft recovery | Physical-device coverage incomplete; not a complete TikTok editor |
| Rendering | Actual private media, R2, queued FFmpeg Container, progress/retry, vertical H.264/AAC reel | No AI vision or licensed music library |
| Journal/sharing | Private runs/reels, download, explicit revocable hosted share links, deletion | Share links and public posts are separate; downloaded copies cannot be recalled |
| Community | Explicit publish/unpublish, captions, inquiry opt-in, quest attribution, Try this quest, feed pagination | No likes/comments/DMs/bookmarks built |
| Profiles | Public photo/@username/bio, real counts, video grid, authored quests/series, follows, private owner tab | Follower/following roster pages are not built |
| Original quests | Structured draft/save/submit, independent operator review, immutable published version | No instant public unreviewed arbitrary content |
| Series | Finite/ongoing collections, ordered parts, prerequisites, own progress, follows/new-part activity | No automatic completion from views or publishing; no extra Series award |
| Licensing | Approved businesses, exact-video offers, revisions/counters/accept/decline, manual fulfillment, controlled downloads | No payment processor, escrow, automatic payout, or Meta account access |
| Rewards | Separate XP/points ledger, caps/cooldowns, funded-offer inventory/redemption, earnings views | No funded production inventory/credits seeded; demo perks cannot spend or redeem |
| Moderation | Reports, blocks, operator review/removal/suspension, role checks | Operational staffing/processes still needed for a public business |
| Deployment | GitHub Actions → Cloudflare Worker/assets + Container, Supabase database/auth | Audit changes below are not deployed |

### Catalog detail: be accurate about “thousands”

The catalog has 33 historical variants and 1,080 expansion variants. The expansion is **60 authored activity recipes × six concrete task briefs × three intensities**. There are 360 task briefs with intensity treatments, not 1,080 independently sourced events. All variants across a recipe share a family cooldown. The six briefs change the activity assignment; intensity changes the work and reveal.

New activities include photography, postcards, drawing, puzzles, small games, sound design, observation, comics, stop motion, original music, and absurd performances. Many use owned supplies and free settings. This improves ordinary solo/couple/outdoor coverage, but should not be presented as a complete professionally curated worldwide activity catalog.

`shared/activity-recipes.ts` is the editorial source and constructs the expansion variants; `shared/catalog.ts` combines them with the historical catalog. `scripts/seed-catalog.mjs` regenerates the seed. `worker/catalog.ts` loads stable pages beyond Supabase's default 1,000-row response limit. One result per family and additional pages prevent repeated intensity siblings from occupying every recommendation slot. Daily deterministic rotation changes eligible briefs without bypassing scoring or filters.

Do not rewrite a published template, historical seed row, or applied migration. Add a new version/migration for future editorial changes.

## 6. Architecture and code map

### Stack

- React 19.3, React Router 7.18, TypeScript 6, Vite 8.3, mobile-first PWA.
- Hono Worker API; Cloudflare Workers static assets, private R2, Queues, Containers, scheduled recovery/cleanup.
- Supabase Postgres and Auth; service-only transaction RPCs plus RLS.
- FFmpeg/ffprobe renderer; Sharp for images; real output encoding.
- Zod shared input contracts; Vitest unit/Worker tests; Playwright browser tests; actual isolated PostgreSQL regression tests.
- Exact versions are pinned in `package.json`/`package-lock.json`. Node engine is `>=22.12.0`; CI uses Node 24.
- This is not a Next.js/Vercel deployment. Do not introduce another hosting platform simply because a reference tool supports it.

### Main files

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Shell, authentication state, navigation, routes, protected return destinations |
| `src/pages/Quest.tsx` | Guided Create, candidates, acceptance, selected/inspired/Series quest context |
| `src/components/QuestWizard.tsx` | One-question outing UI and review |
| `src/pages/Onboarding.tsx`, `Profile.tsx`, `ImportProfile.tsx` | Private preferences, summary, editable onboarding |
| `src/components/PreferenceControl.tsx`, `SummaryReview.tsx` | Structured answers and manual import review |
| `src/pages/Discover.tsx`, `PublicQuest.tsx` | Public feed, quest preview, attempt entry points |
| `src/pages/Creator.tsx`, `Discover.tsx` | Public social profiles; Discover also renders the focused `/posts/:id` reel view |
| `src/pages/ActiveQuest.tsx`, `src/components/Capture.tsx` | Active quest, capture/trim/review/complete/render/share |
| `src/lib/capture-session.ts`, `capture-drafts.ts` | Filming prompts, takes and identity-scoped draft persistence |
| `src/pages/Journal.tsx`, `Rewards.tsx`, `Perks.tsx`, `Activity.tsx` | Personal history, rewards, notifications |
| `src/pages/CommunityStudio.tsx`, `LicenseOffer.tsx`, `OriginalQuest.tsx` | Business/creator commercial workspaces, offers, original drafts |
| `src/pages/Series.tsx` | Series discovery/detail/editor |
| `src/lib/api.ts` | Configured/demo core API client and client state |
| `src/lib/community-api.ts`, `social-api.ts`, `series-api.ts` | Typed domain APIs |
| `src/lib/demo-community.ts`, `demo-social.ts`, `demo-series.ts`, `demo-identity.ts` | Explicit local persona fixtures; never production state |
| `shared/domain.ts`, `recommend.ts`, `profile.ts`, `viability.ts` | Canonical quest/outing types and rewards; eligibility/ranking; preference normalization; early viability/recovery |
| `shared/community.ts`, `social.ts`, `series.ts`, media modules | Shared schemas/contracts |
| `worker/index.ts` | Core API, JWT/session checks, private media, rendering, rewards, recovery |
| `worker/community.ts`, `social.ts`, `series.ts`, `catalog.ts` | Domain routes and authoritative service calls |
| `supabase/migrations/`, `seed.sql` | Schema/functions/grants and reproducible catalog |
| `renderer/core.mjs`, `server.mjs`, `Dockerfile` | Shared FFmpeg engine, local adapter, cloud image |
| `scripts/db-test.mjs` | Fresh isolated PostgreSQL migration/security/concurrency checks |
| `scripts/render-fixtures.mjs` | Actual encoded synthetic fixture and media proof |
| `.github/workflows/checks.yml`, `deploy.yml` | CI and manual explicit-target deployment |

Inspect actual filenames before editing; the source tree is authoritative if a label in this map has changed.

### Main data flow

```text
Browser / authenticated user
  → Worker validates session, strict request, role and ownership
  → shared eligibility checks + published catalog
  → Postgres transactional RPC freezes accepted quest/version/terms
  → private upload reservations and R2 media
  → measured/finalized clips and immutable completion evidence
  → independent reward decision + render job
  → Queue → fenced Container/FFmpeg job → private sealed reel
  → owner download / explicit hosted share / explicit public post
  → optional approved brand offer for that exact sealed asset
  → mutually accepted terms → independent manual fulfillment verification
  → time-limited authorized commercial download
```

### Route inventory for testing

| Route | Exercise |
| --- | --- |
| `/`, `/create` | Create wizard, resume, all answers, review/edit, candidate pagination, accept |
| `/discover` | All/brand filters, pagination, retries; new Following and search |
| `/posts/:id` | Reel playback, Try this quest, creator/related attempts, report/block, publication management as owner, brand request |
| `/quests/:templateId` | Public plan/requirements, original author, share, attempt entry |
| `/creators/:id` | Public identity/photo, tabs, follow/unfollow/share, blocks |
| `/profile` | Own public profile and owner-only private tab |
| `/account` | Private profile/preferences and summary entry |
| `/onboarding` | Every question, skip/preserve/reset, review/edit, save, return path |
| `/profile/import` | Summary save/remove and separately confirmed preferences |
| `/runs/:id` | Upload/camera/retakes/trim/review/complete/render/export/share/publish/delete |
| `/journal` | Open saved run, search/status filters added in audit, private media |
| `/rewards` | Earnings / Perks / Brand offers; pending versus paid, demo versus funded |
| `/activity` | Relevant actions, read states, new category/unread filters |
| `/settings` | Account links, export/deletion/sign-out/error handling as exposed |
| `/settings/demo-tools` | Isolated demo identity switching only |
| `/business` | Business setup/review state, opted-in content discovery, offers, completed licenses |
| `/admin` | Original/business review, reports, moderation, fulfillment; staff-only |
| `/operator` | Existing operational rewards/campaign tools; staff-only |
| `/studio` | Compatibility routing to correct workspace |
| `/originals/new`, `/originals/:id` | Structured original draft, save/submit/review state |
| `/series`, `/series/new`, `/series/:id`, `/series/:id/edit` | Series explore/create/edit/publish/follow/parts/progress |
| `/offers/:id` | Proposal/counter/accept/decline/withdraw/history/manual fulfillment |
| `/auth/callback` | Sign-in return destination and recovery |
| `/s/:token` | Separate explicit hosted share capability; exact reel only, expiry/revoke |
| Unknown route | Useful recovery navigation |

## 7. Non-negotiable data and behavior invariants

### Preferences and matching

Version-2 `null` is unknown. Explicit empty exclusions (`[]`) means the user chose no listed boundaries. Empty free text is absence. Old ambiguous defaults (`rotate`, `depends`, `varies`, `decide_later`) normalize to unknown with `legacyUnconfirmed`; confirmed version-2 choices survive. Historical accepted run snapshots are not rewritten.

Summary text does not affect recommendations by itself. Confirmed choices record `survey` or `summary_review` provenance. The current manual review deliberately avoids extracting meaning from entertainment preferences, negation, uncertainty, or product-design prose.

Eligibility precedes ranking. Confirmed willingness can add 5 per matching tag; skills 4; interests 3; humor 2; supported participation role 2; preparation 2; relevant approach preference 2. Flexible/unknown answers generate no invented fit claims. Current outing category/intensity/budget/time/setting/group remain authoritative. Firm exclusions remain hard filters, including existing context-sensitive distinctions. Custom boundary prose pauses recommendations for explicit review rather than pretending to parse it. See `docs/PROFILES.md` and implementation for exact rules.

An early viability check must not reject based on unanswered default outing fields. Final acceptance rechecks the actual completed plan on the server. Suggested recovery must never silently modify budget, group, energy, setting, permission, or boundaries.

### Quest/run and rewards

- Published quest/version and accepted run snapshot are immutable. Do not derive an active run from a newly edited live catalog object.
- One accepted/in-progress run per account. Pending review frees the active slot according to existing policy.
- “Try this quest” creates a separate attempt with the viewer's own eligibility, outing, permissions, and evidence; inspiration remains attributed.
- Completion evidence and award decision are separate from rendering. Rerenders never issue another award.
- Existing policy: Chill 100 XP/10 points, Bold 250/25, Full Send 500/50; at most three rewarded runs per UTC day and one reward per family per 30 days.
- Ledger is immutable; corrections are compensating events. Wallet is its nonnegative projection.
- Demo rewards cannot reserve real stock or issue redeemable codes. Real inventory needs verified funding, scope, dates, and stock.
- Reservation, cancel/refund/expiry, and merchant consume are transactional and idempotent. Tokens are scoped, short-lived, signed, single-use, private.
- Campaigns/funded quests, point perks, and licensing cash are separate concepts.

### Media/privacy

- Three clips, each selected duration 5–15 seconds, compose the current reel format. Absolute source trim timestamps can be later than 15 seconds; validate **selection length**, not absolute end time.
- The server measures/validates bytes; client duration and MIME are hints. R2 keys are server-generated and private.
- Jobs have immutable manifests, leases/fencing and deduplication. Protect against stale jobs, replacement clips and duplicate callbacks.
- Local draft blobs are isolated by account/persona/run/slot. Stop/add takes before finishing. A saved finished part can be restored/uploaded/replaced; do not imply arbitrary append to an already finalized saved part.
- Private journal/reel is default. Sharing and publishing are separate explicit actions. Per-post brand inquiry availability is another separate opt-in.
- Public responses omit email, imported summary, private answers, exact location, source media, R2 keys, balances and private progress.
- Hosted share links pin an exact final asset and expire/revoke. Public posts have their own publication state. Never turn either into the other implicitly.
- Downloaded copies cannot be recalled. No UI should claim otherwise.
- Retention: source cleanup conditionally after 30 days; protect failed renders/review evidence. Reviews close after 14 days. Saved reels max 50/account; total media max 2 GiB. Deletion revokes access immediately and retries physical cleanup. Minimal ledger/audit facts remain.

### Community, licensing, Series

- Real follows and counts derive from stored records. Blocking removes reciprocal follows; unblocking does not restore them automatically. Authenticated blocks do not promise to hide otherwise public content from anonymous viewers.
- Original quests require independent operator review before public availability; approval produces an immutable template version.
- Business identities require review. Staff roles are protected memberships, never editable profile metadata or a production role dropdown.
- A brand request requires creator and post opt-in plus an approved business. No follower minimum is used to authorize an offer.
- Exact asset/version, payment minor units/currency, channels, dates/duration, editing permission, message, and explicit fee are captured. No default commercial fee was chosen.
- Only the other party accepts the latest proposal/counter; stale state fails. Acceptance is pending fulfillment, **not paid**.
- A separate operator records payment and permission evidence; only verified fulfillment contributes paid earnings and permitted commercial access. Current workflow is manual; there is no money transfer.
- Commercial delivery checks current authorization, exact asset, account availability, usage period, and suspension. Licensing one episode does not license all future Series parts.
- Series parts reference reviewed quest versions with stable identities. Prerequisites must be earlier parts with a reason. Personal finalized linked runs drive progress; views/follows/acceptance/publishing do not complete a part.
- Ongoing Series can be caught up; finite Series can be complete. New parts do not erase old completion. Each reel still requires explicit publication. No Series reward bonus.

## 8. Approved branding

| Token | Value |
| --- | --- |
| Primary violet | `#7950E8` |
| Charcoal | `#171A22` |
| Warm white | `#F7F6F2` |
| Symbol | Solid S-shaped route with an upper-right arrow |
| Main lockup | Violet mark, charcoal Sidequest wordmark, warm-white background |
| App icon | White mark on violet |

The owner supplied `sidequest-brand-spec.json` and `sidequest-violet-brand-sheet.png`. Both are included in the handoff bundle's `references/` directory. The raster sheet is a selected visual reference, not a delivered original vector/font master. The implementation uses a reconstructed shared SVG path and a native bold system wordmark, rather than claiming an exact original typeface.

Brand already applied live: shell, controls, navigation/selected states, onboarding/progress, media accents, renderer, favicon/PWA icons and manifest.

Source of truth: `shared/brand.mjs`; React mark: `src/components/BrandMark.tsx`; generation: `scripts/brand-assets.mjs`; mark output: `public/brand/sidequest-mark.svg`; icon outputs: `public/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`. See `docs/BRAND.md` for generation/contrast and limitations. White on approved violet is about 5.09:1. Do not revert to the old blue UI or flag logo seen in historical screenshots.

## 9. Current uncommitted audit — implementation inventory

Everything in this section is local and requires final integrated verification. Read `git diff`; do not assume every new test passes.

### A. Discovery/social/auth/activity work

Files: `shared/community.ts`, `worker/community.ts`, `src/pages/Discover.tsx`, `src/lib/demo-community.ts`, `src/lib/demo-social.ts`, `src/App.tsx`, `src/pages/Activity.tsx`, `src/components/Community.tsx`; new `src/components/PostSocialActions.tsx`, `src/discovery-social.css`, and tests/migration below.

- Added a Following feed based on actual stored follows; guest Following requests require sign-in.
- Added bounded public-story search over public caption, accepted quest title, creator display name and username. It is literal case-insensitive substring search, not an AI/semantic search engine.
- Search/filter applied before keyset pagination, with timestamp plus ID ordering and existing privacy/block rules.
- Optional `viewerFollowing` data supports feed follow/unfollow actions.
- Added real follow/unfollow with busy/error handling and public reel sharing via native share/clipboard/fallback URL.
- Added Explore Series and creator opportunity entry points; preserve selected feed/search when opening/closing reels.
- Feed state is keyed by filters and actor; preserve existing stale-response and pagination protections.
- Activity adds All/Unread/Connections/Brand offers filters and “Mark shown as read.” This affects shown items, not a silently global inbox operation. Partial failure should remain recoverable.
- Shared community mutation keys are retired after successful actions, retained for uncertain retries. This fixes later intentional identical actions being mistaken for replays.
- App authentication catches rejected session reads and email sends; adds retry feedback and preserves intended protected destinations.

**Known polish still pending:** the manual 390px Discover view showed substantial header/filter/search/shortcut height before the first reel, and the third feed tab wrapped. Make videos and quest actions more prominent; verify larger text and narrow screens. No actual likes/comments/bookmarks/DMs were added. Do not render unsupported social controls as if they exist.

### B. Consumer profile/onboarding/quest work

Files: `src/pages/Onboarding.tsx`, `ImportProfile.tsx`, `Profile.tsx`, `Settings.tsx`, `PublicQuest.tsx`, narrow `Quest.tsx` guard, `src/components/SummaryReview.tsx`; new `src/consumer-audit.css`, `tests/consumer-audit-browser.spec.ts`.

- Direct editing from confirmed-answer chips and unknown-answer review, without requiring the whole survey again.
- Preserve skips, explicit reset and refresh-safe drafts.
- Clarify private account nickname versus public creator identity.
- Retry initial profile/import/onboarding/settings/public quest loading.
- Check returned sign-out errors and improve feedback.
- Public quest preview exposes more useful plan, filming, materials, requirement and fallback details; native share/clipboard fallback.
- Clear stale clipboard error after successful summary copy.
- Guard selected Series quest context against using a stale cached part with a different requested ID.

Read `docs/audit-consumer.md` for final agent notes, especially two legacy onboarding browser failures whose expected `/create` URL became `/`. Both currently render Create, but this is an unresolved navigation/test contract change that must be consciously resolved.

### C. Capture, story review and journal work

Files: `src/components/Capture.tsx`, `src/pages/ActiveQuest.tsx`, `Journal.tsx`, `src/lib/api.ts`, narrow `worker/index.ts`; new `src/components/StoryReview.tsx`, `src/components/story-review.css`, `src/lib/story-review.ts`, `src/pages/journal-design.css`, `tests/media-actions-browser.spec.ts`, `tests/story-review.test.ts`.

- Preserve valid later-in-source trim windows instead of clamping their absolute end to 15 seconds.
- Preview only the selected range.
- Canceling a newly opened camera session preserves existing selected media/draft state.
- Improve share-copy/revoke, abandon and deletion feedback; inspect current diff for exact state-reset handling on run changes.
- Add “Shape your story” prompts based on quest filming guidance and selected duration/caption/mute/crop metadata. Clearly labels limits; it never analyzes unseen video or predicts virality.
- Journal gains search/status filters and clearer resume cues.
- New owner-only `GET /api/quest-runs/:id/share-links` returns active link metadata so a previously created link can be revoked after refresh. It returns IDs/captions/times, **not raw tokens or hashes**. Only token hashes are stored, so old URLs cannot be reconstructed. The creator must keep the original URL or create another link.
- Configured API client supports listing those links; demo list currently returns `[]`. Configured/mock endpoint coverage is important.

Read `docs/audit-capture.md` for exact test state. New share management and deletion testing was not finished when the user requested the handoff.

### D. Business, Series and reward work

Files: `src/pages/CommunityStudio.tsx`, `Creator.tsx`, `LicenseOffer.tsx`, `Operator.tsx`, `OriginalQuest.tsx`, `Perks.tsx`, `Series.tsx`; new `tests/business-audit-browser.spec.ts`.

- Perks uses a reservation identity per logical intent: uncertain retries reuse a key, a new reward action gets a new key.
- Clear stale codes when switching/canceling; distinguish successful reservation from failed token retrieval and permit retry.
- Add Series quest search/intensity filtering over the large catalog without losing selected parts.
- Guard invalid prerequisite reorder/removal, and retry initial Series editor reads.
- Improve business/profile/workspace/action errors, review states and relevant next steps.
- Fix a demo brand discovery filter to use the business record ID, not assume it equals the owner ID.
- Retry public creator reads; no follower roster feature was added.

Read `docs/audit-business.md` for exact final test evidence. Some broader media/licensing checks were interrupted while concurrent Playwright processes were also managing the renderer.

### E. New migration — NOT applied to production

`supabase/migrations/20260930182548_social_discovery_following_search.sql`

This replaces `sq_community_read` with compatible existing branches plus Following/search handling. No new table or changed RPC signature is required. Existing service-only grants are preserved. The current local isolated DB/advisor run passed after applying all ten migrations, including literal `%` search, public/private filtering, anonymous Following denial, block handling, and multi-page ordering.

Production currently has **nine** applied migrations. Apply this **tenth** migration deliberately to the already-selected project before deploying code that depends on the new feed contract. Inspect remote migration state and dry run first. Do not reset the database or rerun all infrastructure creation commands.

### F. New regression files

- `tests/discovery-audit-browser.spec.ts` — six root social/activity/auth scenarios; currently has unresolved failures.
- `tests/consumer-audit-browser.spec.ts` — fourteen focused consumer scenarios.
- `tests/media-actions-browser.spec.ts` — capture/share/publication/deletion actions.
- `tests/business-audit-browser.spec.ts` — reward idempotency, business setup, Series and error handling.
- `tests/story-review.test.ts` — metadata-only feedback, no fabricated footage judgments.
- Modified `tests/community-worker.test.ts` — Following auth and search bounds.
- Modified `tests/database/community-invariants.mjs` — real SQL Following/search/privacy/cursor behavior.

## 10. Verification evidence and unresolved failures

### What passed before this audit

- Committed brand release deployment: [Actions 36750945163](https://github.com/AaronPilk/side-quest-me/actions/runs/36750945163), successful.
- Its full Checks run: [Actions 36750276217](https://github.com/AaronPilk/side-quest-me/actions/runs/36750276217), **completed successfully**, verified again while writing this handoff. `docs/DEPLOYMENT.md` still says this run was pending at the earlier snapshot; this handoff supersedes that line.
- Baseline local results: 278 unit tests, 55 browser scenarios, typecheck, lint, production build, isolated database/advisor checks, configuration checks and actual render fixture passed.
- Prior media fix full Checks: [Actions 36747885316](https://github.com/AaronPilk/side-quest-me/actions/runs/36747885316), successful.
- Live brand assets and manifest were checked against committed bytes; mobile navigation/console/overflow checked. This does not verify every current audit feature.

### Actual production media proof from the prior release

A full three-part, 45-second synthetic test reel rendered on its first attempt in about **90.4 seconds** on the selected Container. Download was HTTP 200, 11,702,906 bytes, duration 45.021333 seconds, 1080×1920 H.264/AAC. Byte/hash comparison and independent FFmpeg decoding passed. Another account was denied access. Temporary Auth accounts and R2 media were removed through the application deletion flow at 17:05:34 UTC; synthetic testing earned no rewards.

SHA-256 of that historical proof: `88d9b0aa1080000e4f07670516f5ebef84e39987dc7b276ca06e6c79b516c8ea`.

Local historical proof artifacts are under `.local/production-smoke-success-report.json` and `.local/production-smoke-render.mp4`. Older failed smoke artifacts also exist; do not confuse them with the successful report. They are excluded from the handoff archive along with all `.local` runtime data.

### What passed during the current audit, before final integration

| Check | Observed result | Limit |
| --- | --- | --- |
| `npm test` | 281 tests / 25 files passed at an intermediate checkpoint | Some subsequent edits/new Worker tests were not covered by that run |
| `npm run typecheck` and `npm run lint` | Passed at intermediate checkpoints | Re-run on the exact final tree |
| `npm run test:db:advisors` | Passed with all ten local migrations and 1,113 variants, including new feed behavior | Isolated local DB, not a production migration |
| Capture focused units | 13 tests / 3 files passed (`story-review`, `capture-session`, `media-client`) | Last share-link endpoint changes were later and unverified |
| Capture targeted browser subset | Four scenarios passed, including real upload/later trim/selection preview/cancel/edit/coaching and draft/camera checks | Public-link test stalled and was interrupted; final abandon/journal tests did not run |
| Business focused subset | Four new tests passed together; corrected registration/rejection/resubmission/approval test passed separately, confirmed by result file | No clean combined five-test run; broader suite interrupted |
| Consumer focused subset | All 14 new tests and 6 existing create-recovery tests observed passing in a 34-test run | No final aggregate result; two later legacy profile route expectations failed |
| Manual local Discover | Loaded at 390px, actual fixture media visible, layout issue identified | This was not complete every-button verification |

### Exact root browser failures preserved for continuation

Command started during the audit:

```sh
npm run test:browser -- tests/discovery-audit-browser.spec.ts tests/discover-pagination-browser.spec.ts tests/reel-identity-browser.spec.ts
```

The command's final console output was not recovered after the session changed. Its retained artifacts report failures; therefore this suite is **not** a pass. Trace error events inspected during handoff show:

1. `tests/discovery-audit-browser.spec.ts:38`: Following/search test expected heading `No matching stories yet.` after a nonmatching query; not found. Determine whether empty-state precedence/copy or behavior is wrong; do not simply remove the expectation.
2. `tests/discovery-audit-browser.spec.ts:144`: Activity fixture tries setting `.activity` on `null` because `sidequest-community-demo-v1` was not yet persisted. Demo reads can return a default without writing storage; initialize the fixture through a valid mutation or explicit fixture state before editing it.
3. `tests/discovery-audit-browser.spec.ts:185`: mocked auth test did not find `Could not check your sign-in`. Inspect module interception, actual configured/demo branch and auth state sequencing before classifying it as a product defect.
4. `tests/reel-identity-browser.spec.ts:153`: public playback while viewer read is pending timed out expecting `true`, got `false`. Renderer/browser-server lifecycle contention may be relevant, but causation is **not proven**. Rerun with stable servers and inspect the real playback/network path.
5. `tests/profile-browser.spec.ts:32` and `:70` in the consumer run: expected final `/create`, received `/`. Both routes currently show Create, but the redirect contract changed. Resolve deliberately and preserve explicit selected quest/inspiration/Series return URLs.

Artifacts were under `test-results/` and `.local/consumer-audit-results/`. Some agents used `.local/test-results/` for isolated outputs. These runtime directories are not included in the source ZIP. Error descriptions are retained here so another machine can reproduce them.

### Testing infrastructure pitfall

Several browser suites ran concurrently against the same Vite port **5173** and renderer **8789**. A Playwright invocation could own the renderer and stop it while another suite still needed it. Default `test-results` cleanup could also remove another run's artifacts. This makes some interrupted media failures inconclusive.

For the continuation: keep Vite and renderer in dedicated persistent terminals and run **one browser suite at a time**, with a unique `--output` if doing focused runs. Existing Playwright config itself uses one worker; the problem was multiple independent invocations, not `workers` inside one run. Do not label all failures environmental without reproducing them.

At the last process inspection, only an existing demo Vite server remained; no renderer or Playwright process remained. Recheck ports/processes rather than relying on historical PIDs.

### Still required before claiming this audit complete

- Full final-tree unit/typecheck/lint/build/config checks.
- One clean integrated browser run, fixing all failures, followed by manual mobile/desktop verification of distinct actions and persistence.
- New share-link listing/revocation ownership and refresh checks, preferably focused Worker/API tests as well as UI.
- Update hosted media browser fixtures for the new `/api/quest-runs/:id/share-links` request. Decide whether the active-link list needs an explicit application limit/pagination.
- Resolve auth mock/real auth error behavior, Activity fixture setup, search empty state, onboarding return contract, and public playback case above.
- Real rendered media plus download/refresh/revoke/delete, not just placeholder cards.
- Narrow-screen/200% text/reduced-motion/keyboard checks; Discover header density/overflow polish.
- Physical iPhone/Android/Safari camera, backgrounding, microphone, interrupted take recovery and device file formats. Chromium fake camera tests are not device proof.
- Configured production/staging smoke for changed paths after applying the migration, with controlled test identities and cleanup.
- Document an honest feature/action coverage matrix. Do not say “every feature/button tested” until the actual inventory supports it.

## 11. Suggested continuation order

This is a technical continuation plan, not an instruction to replace the user's next request.

1. Inspect current instructions, branch, diff, and audit notes. Preserve dirty files. Establish whether anything changed after this handoff.
2. Start stable demo/renderer servers. Run the new focused suites sequentially and resolve the documented failures first.
3. Review all new state/error/idempotency code, including account/persona switches, async stale responses and repeat mutations.
4. Verify the pending share-link endpoint and its owner-only DTO. Ensure old links can be revoked after refresh and no raw token leaks.
5. Finish the social UX polish: video-first Discover, usable filters/search/follows, clear next actions, fewer stacked utility controls. Retain Create-first navigation and working public quest/inspiration flow.
6. Complete an action-level audit of all route families below, correcting real issues. Avoid implementing a large unrelated feature only because a competitor has it.
7. Run all final checks and the integrated browser suite. Re-run tests after meaningful fixes, not to manufacture a green result without resolving behavior.
8. Update audit/README/deployment docs to the final truth, including what remains manual/unconfigured.
9. Only then prepare a reviewable commit/release. If continuing the previously authorized deployment, inspect the exact production target, apply the new additive migration through a controlled path, push, wait for Checks, run manual deployment, and verify live behavior. Do not run production testing that awards real rewards or licenses real user content.

### Action-level audit checklist to finish

The list below is required coverage to map against actual tests; it is **not** a claim each item was already completed.

| Journey | Actions/states to exercise |
| --- | --- |
| Shell/auth | Every nav/menu/compatibility link, signed out/protected deep link, sign-in error/retry/callback/sign-out, account switch, unknown route |
| Profile | All ten questions, sequential typing spaces, skip/preserve/reset, direct review edit, legacy unknown, save/error/retry/refresh, summary edit/remove independent of confirmed answers |
| Create | Each scene/intensity/group/budget/time/setting, blank/zero editing, back/review/edit, refresh, selected/inspired quest return, no-match reasons and explicit recovery, boundaries, More ideas, active-run resume |
| Nearby | Location allowed/denied/unavailable, manual coarse area, configured/unconfigured Maps, search/selection/clear/directions, event no-results/error/provider absence, Eventbrite link clarity |
| Quest detail | Required people/time/cost/arrangements agree with actual selection, actual filming prompts, share, accept retry/duplicate/stale/unavailable, Series identity |
| Capture | Permission allow/deny, record/stop/add/finish, cancel, flip where supported, upload formats, replace, trim later-in-source, preview selected range, caption/mute/fit, refresh/identity isolation, abandon |
| Completion/media | Required confirmations, review-needed/finalized, reward nonduplication, real render progress/failure/retry, edit rerender, download/playback, share/create/copy/list/revoke/expiry, deletion and failure feedback |
| Community | Keep private, publish consent/caption/inquiry option, public playback, owner edit/unpublish, stale/duplicate submit, Try this quest with own constraints, related attempts, pagination/filter/search/follow/error |
| Profiles/social | Photo validation/removal, username collision, bio/name, counts, follow/unfollow/block/unblock persistence, share fallback, tabs, private owner-only data, deleted/unavailable identity |
| Activity | Each event links to relevant entity, mark shown/read, unread/category filter, refresh, partial mutation failure, no events |
| Original quests | New/save/reopen/edit/submit/reject/revise/approve, operator independence, published version immutable, title/cost/requirements/filming fields |
| Series | New/edit/search/add/remove/reorder/prerequisite, draft/publish/follow, finite/ongoing, previous/next parts, personal progress, unavailable part, alternative standalone quest, refresh, author/participant identity isolation |
| Brand/license | Registration/review/reject/resubmit/approve, discovery opt-ins, exact asset, offer create/counter/accept/decline/withdraw/stale/duplicate, pending versus paid, verified fulfillment, time-window download, suspension |
| Rewards/operators | Demo nonredeemability, real funded eligibility, reservation retry/token failure/retry/cancel/expiry, scoped consume/replay/refund, stock/funding guards, campaign disclosure/pause, nonstaff denial |
| Accessibility/layout | 320/390/768/1440 widths, 200% text, keyboard/focus labels, reduced motion, one video at a time, empty/loading/offline/permission/error states, no nav overlap |

## 12. Local development and verification commands

Prerequisites: Node 22.12+ (Node 24 used in CI), npm, FFmpeg/ffprobe, PostgreSQL 17 tools including `pg_config`, `initdb`, `pg_ctl`, `psql`. Supabase CLI and OpenSSL are needed for advisor mode. Docker is not installed/required for the local renderer on this Mac.

```sh
cd "/Users/pilksclaes/Side Quest Me"
git status --short
git diff --stat
npm ci
```

Do not run `npm ci` unnecessarily if dependencies already match and another process is using them.

Dedicated terminal 1:

```sh
cd "/Users/pilksclaes/Side Quest Me"
npm run render:dev
```

Dedicated terminal 2 (first check whether port 5173 is already running the correct demo):

```sh
cd "/Users/pilksclaes/Side Quest Me"
npm run dev:demo
```

Verification terminal:

```sh
cd "/Users/pilksclaes/Side Quest Me"
npm run render:fixtures
npm run typecheck
npm run lint
npm test
npm run test:db:advisors
node scripts/config-smoke.mjs
npm run test:browser -- --output=.local/claude-browser-results
npm run build
git diff --check
```

`render:fixtures` generates actual labeled synthetic media and verifies encoding/decoding, orientation, audio/silence, replacement/retry behavior, bytes and checksum. A fixture is not proof of a real person completing a quest and must not earn real rewards.

`test:db` creates a fresh temporary isolated PostgreSQL cluster, applies all migrations and the seed, runs RLS/concurrency/state tests, then stops/removes it. It does not touch an existing database. CLI wording about connecting to a database in advisor mode refers to the loopback temporary instance, not the hosted project.

`npm run cf:types` refreshes Worker bindings. `npm run db:types` reconstructs the isolated DB and regenerates types when needed. `npm run test:api` exists; read `scripts/api-smoke.mjs` for required server/configuration rather than assuming the demo browser setup is its target.

`npm run dev` is configured Worker development; `npm run dev:demo` deliberately isolates local personas and progress. Do not confuse a passing demo with production authorization, persistence or economics.

The first browser run may need the configured Chrome or `npx playwright install chromium`. CI installs Chromium with OS dependencies. Local config prefers installed Google Chrome if available. Browsers use fake media flags; physical-device testing is separate.

### Local demo walkthroughs

Start with the Demo banner and Settings → Demo tools. Available personas include Creator, Second creator, Brand, Operator. They are isolated fixtures, not actual users or production role grants.

- **Consumer:** Create → choose own outing → accept → record/upload three parts → complete/render → keep private or publish deliberately.
- **Public attempt:** Discover fixture → Try this quest → own constraints → separate run; verify source attribution and no inherited permissions.
- **License:** Brand → opted-in reel → Request to use video → enter explicit terms; Second creator → Rewards/Activity → review/counter/accept; other party accepts counter; Operator → Admin → verify manual fulfillment. Only completed authorized usage unlocks commercial download.
- **Original:** Create → Draft an original quest → save/submit; Operator → Admin review; published version becomes available through normal eligibility.
- **Series:** Create → Start a series → reviewed parts → finite/ongoing → save/publish; another persona follows/attempts parts using its own constraints.

The existing demo storage can be absent until a write. Tests should not assume reading the seeded feed necessarily persists the serialized fixture to `localStorage`.

## 13. Production infrastructure — already created, do not recreate

The user explicitly approved using the existing **“Side quest Me”** Supabase project inside **“TRACT Mortgage”**. They originally considered a separate organization, then chose this project. Do not ask that same question again or create a replacement by assumption.

| Resource | Identifier |
| --- | --- |
| GitHub repository | `AaronPilk/side-quest-me` |
| GitHub environment | `production` |
| Cloudflare account | `9c332c75b96cc642621dad5d86d4bf18` — Aaron@skyway.media's Account |
| Worker | `sidequest-me` |
| Live origin | `https://sidequest-me.aaron-9c3.workers.dev` |
| R2 bucket | `sidequest-me-media` — private; public `r2.dev` disabled |
| Queue | `sidequest-me-renders` |
| Queue ID | `e49efdb505da4b0082f13c5ad46c8d6b` |
| Container application | `sidequest-me-sidequestrenderer` |
| Container application ID | `a03d6371-8f84-4b87-82dc-82ceb4f8051b` |
| Supabase project ref | `fpwpsxerogbwlnrvuurm` |
| Supabase project name | `Side quest Me` |
| Supabase organization | `TRACT Mortgage` — intentionally selected by owner |
| Current launch area | `Sidequest pilot` |
| Pilot currency | USD |

The renderer configuration is **2 vCPU, 6,144 MiB memory, 4,000 MB disk, max one instance**, queue concurrency one. Five-minute recovery/cleanup schedule is installed. A smaller 0.25-vCPU configuration failed the full-length processing budget; do not silently downgrade it. No billing plan change was made. Reassess capacity/cost with measured load, not unsupported throughput claims.

Worker bindings include `MEDIA`, `RENDER_QUEUE`, `RENDERER`, `API_RATE_LIMITER`.

### Secret names only

Six installed Worker secrets:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
RENDERER_INTERNAL_TOKEN
REDEMPTION_SIGNING_KEY
SHARE_SIGNING_KEY
```

GitHub production environment secret:

```text
CLOUDFLARE_API_TOKEN
```

The user has already corrected/saved this token and added **Workers Containers Write/Edit**. It also has Workers Scripts Edit, Workers R2 Storage Edit and Queues Edit. Successful deployments prove the prior token issue was resolved. Do not tell the owner again that the token is missing or needs replacing without new evidence.

Eight GitHub environment variables:

```text
CLOUDFLARE_ACCOUNT_ID
SIDEQUEST_WORKER
SIDEQUEST_BUCKET
SIDEQUEST_QUEUE
SIDEQUEST_ORIGIN
SIDEQUEST_AREA
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Browser public configuration is `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; these are supplied from environment variables during build. Do not put `SUPABASE_SECRET_KEY`, signing keys or renderer authentication in a browser-prefixed variable. Apple's domain-restricted JS token is public by design; its private signing key is not.

There are ignored restricted local recovery files, including `.local/sidequest-production-secrets.json`, Auth/key backups and smoke session state. **Do not print, copy into source, include in the handoff archive, upload to Claude, or commit their contents.** The handoff contains configuration names and resource IDs, not secret values. Reuse installed credentials through authorized local tools if needed.

### Deployment mechanics

Checks runs on push/PR. Production deployment is manual from `main` using `.github/workflows/deploy.yml`. It validates inputs/token access, typechecks/lints/tests, generates an explicit target config, builds with public Supabase config, and deploys through GitHub's Ubuntu/Docker environment.

```sh
gh workflow run deploy.yml --repo AaronPilk/side-quest-me --ref main -f environment=production
gh run list --repo AaronPilk/side-quest-me --workflow deploy.yml --limit 1
```

These are release commands, not steps to execute while merely reading the handoff. First commit/push verified intended changes and wait for full Checks. The deployment workflow's own shorter validation does not substitute for the full browser/database checks.

`scripts/configure-environment.mjs` creates ignored `.local/wrangler.target.json` from explicit `SIDEQUEST_*` values. Default repository Wrangler names are development resources. **Do not run a bare `npm run deploy` against those defaults and assume it updates this production app.** Use the established workflow. Local Docker is unavailable, and local Wrangler OAuth previously lacked the needed Containers scope; the working GitHub account token is the reliable deployment path.

Do not enable a second Cloudflare Git auto-deployment pipeline. Do not recreate the bucket/queue/project/container because README's fresh staging instructions list creation commands.

### Database release state

Nine migrations are applied live:

```text
20260927151042_sidequest_core.sql
20260929190728_preserve_unknown_profile_role.sql
20260929191623_community_creator_licensing.sql
20260929225944_community_feed_cursor.sql
20260929230346_curated_small_group_quests.sql
20260929233306_creator_social_profiles.sql
20260929233446_authored_quest_series.sql
20260930152404_restrict_dashboard_rls_helper.sql
20260930160717_expanded_activity_catalog.sql
```

Tenth, local and unapplied:

```text
20260930182548_social_discovery_following_search.sql
```

Inspect target project and remote history before migration. Do not use `db reset` on a hosted database or rewrite an applied migration. Read `docs/DATABASE.md` for role provisioning and deployment operations. The new function migration is locally tested and compatible, but remote application and live validation remain undone.

## 14. Remaining configuration and operational setup

### Email

Supabase Site URL and exact `/auth/callback` allowlist match the live origin. Email sign-in/confirmation are enabled. Custom SMTP and a verified sender domain still need configuration for ordinary public users; the default sender is restricted to project-team addresses. [Project SMTP settings](https://supabase.com/dashboard/project/fpwpsxerogbwlnrvuurm/auth/smtp), [Supabase SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp).

Provide the provider's host, port, username/password and verified From address through provider configuration. Keep confirmation enabled. No transactional email provider was secretly selected or purchased.

### Apple Maps and events

- Install `APPLE_MAPS_TOKEN`, a domain-restricted public MapKit JS token, to enable in-app place search. Never ship Apple's `.p8` private key.
- Install server-only `TICKETMASTER_API_KEY` for the implemented Discovery integration covering supported Ticketmaster/Universe/Front Gate listings.
- Current geolocation/coarse-area controls and external links remain usable without provider keys; the UI must say when in-app search is unconfigured.
- **Eventbrite is external browsing only.** No scraping, data partnership, bulk event feed or API access was configured. Do not claim automatic scanning of all nearby events.
- Real events/venues require provider data, timestamps, source/availability handling and appropriate integration access. Do not invent operating hours, tickets, reservations, sponsored relationships or admission prices.
- Selecting a place does not override the quest's budget, requirements, permissions or group constraints.
- See `docs/MAPS.md` for exact implementation/configuration.

### AI

No automated profile parser, transcript service, video-understanding model or prediction provider is wired into the app. A key alone will not activate those features. For profile extraction, implement a server-side provider, strict proposal schema, supporting quoted excerpts, edits/rejection and explicit confirmation before matching. Test negation, uncertainty, entertainment preferences and product-design context.

For future creation coaching, clearly separate measurable metadata, user-entered context and actual model-observed evidence. Any score or forecast needs its own validation and honest limits. Current “Shape your story” is authored guidance plus metadata only.

### Business and money

No real production operator, verified merchant inventory, reward funding, wallet credits or campaign inventory were seeded. Provision an operator out of band using the documented protected membership process; do not expose a role-granting UI. Choose the real pilot area before area-scoped offers.

The current licensing workflow records manual payment/permission evidence; it does not transfer money. No Stripe/Connect, checkout, escrow, automatic payouts, subscriptions, Meta Partnership Ads, Shopify attribution or direct social publishing is integrated. No production transaction fee rate was selected. Grand prizes/drawings remain disabled/deferred.

Real agreements, permissions, brand onboarding and fulfillment operations must be handled deliberately before a public commercial pilot. Do not populate fake deals, creator statistics or verified earnings to make the dashboard look active.

### Optional custom domain

No custom domain is needed for the existing live URL. If adding one, update `SIDEQUEST_ORIGIN`, Supabase Site URL/exact callback, Apple token allowlist and build configuration together. Do not point a preview at production reward inventory accidentally.

## 15. Documentation and original source material

Read these in order for a fresh continuation:

1. This handoff and `git status`/`git diff`.
2. `docs/audit-consumer.md`, `docs/audit-capture.md`, `docs/audit-business.md` for the interrupted latest work.
3. `README.md` for local operation and routes.
4. `docs/DEPLOYMENT.md` for live infrastructure; note its older pending-CI sentence is superseded by the successful result recorded here.
5. `docs/PROFILES.md`, `ACTIVITY_CATALOG.md`, `MAPS.md` for preferences/matching/nearby.
6. `docs/MEDIA.md`, `DATABASE.md`, `COMMUNITY.md`, `CREATOR_SERIES.md` for contracts and invariants.
7. `docs/BRAND.md`, `DESIGN.md`, `DECISIONS.md`, `LICENSES.md`.
8. `docs/BUILD_STATUS.md` for historical milestones; do not mistake older local-only notes for current deployment status.

Original user-provided files on this Mac:

```text
/Users/pilksclaes/Sidequest-Product-Handoff.pdf
/Users/pilksclaes/sidequest-brand-spec.json
/Users/pilksclaes/sidequest-violet-brand-sheet.png
/Users/pilksclaes/.codex/attachments/276ccf00-7696-49b9-9ab2-43b2ebb39468/pasted-text.txt
/Users/pilksclaes/.codex/attachments/ffc84854-d7c1-46f2-a4d9-d73dc32328ab/pasted-text.txt
/Users/pilksclaes/.codex/attachments/3a5e2c46-4506-4e50-b7c7-1b6a5f77b6c0/pasted-text.txt
```

The bundle includes copies with descriptive names under `references/`. The PDF contains the creator/Series direction and concept imagery, not evidence that every illustrated capability was live. Earlier requests that said “keep this pass local” were followed by explicit owner requests to push/deploy; retain the chronology and scope. Latest immediate task is this handoff, so the interrupted audit was left local.

Historical screenshots showed old blue/flag branding, stuck budget zero, old time choices, no-match recovery, travel USD and generic arrangements. Those screenshots are useful bug context but are not the current design specification. The approved violet brand supersedes them. User complaint details are preserved in section 3.

## 16. Handoff package contents and handling

The delivered package is under `/Users/pilksclaes/Sidequest-Claude-Handoff/`:

- `CLAUDE_HANDOFF.md` — this full narrative/status/continuation document.
- `START_HERE.txt` — short instructions for Claude Code or Claude chat.
- `Sidequest-Claude-Source.zip` — current tracked and nonignored untracked source, including dirty audit files, tests, migrations and docs; plus user-provided references and a metadata snapshot.
- `manifest.json` — source file list and checksums for the archive snapshot.

The source archive intentionally excludes `.git`, `node_modules`, builds, `.local`, `.wrangler`, actual environment files, credentials, private media, browser storage, test traces and runtime logs. Example environment templates are included. It contains current file contents, not Git history. Clone the GitHub repository if history is needed, then merge this snapshot deliberately; do not discard unrelated newer changes.

No file was sent to Claude automatically. The owner can attach the Markdown and ZIP to Claude or point Claude Code at the existing repository. Installed local/cloud credentials are not transferred in this package.

## 17. Final cautions for the next developer

- Preserve the user's existing app and local changes. Do not `git reset --hard`, clean untracked source, rewrite migrations, or replace it with a newly generated app.
- Do not claim the current audit passed every button. It stopped with specific tests failing and several integrations unconfigured.
- Do not merge live-baseline evidence with current working-tree evidence. Their dates/commits differ.
- Do not repeatedly ask the owner to replace the Cloudflare token or choose a Supabase project; both were resolved.
- Do not expose secret files or source videos when handing work between tools.
- Do not weaken filtering/permissions/reward/role checks to eliminate a UI error.
- Do not equate public posting, licensing permission, verified payment, or social-account advertising access.
- Do not infer real-world preferences from unconfirmed imported prose or claim analysis of unseen video.
- Do not create thousands of near-duplicate labels and describe them as thousands of unique real events.
- Test persistence after refresh and identity changes, repeated clicks, failure/retry and stale responses. These are where several actual defects were found.
- Finish with concrete evidence and a useful next-step/configuration list. The owner wants a working consumer product and business, not only an attractive screen or another architecture proposal.
