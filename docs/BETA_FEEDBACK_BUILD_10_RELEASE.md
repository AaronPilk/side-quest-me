# Build 10 profile, private journal and open-quest navigation — 2026-10-02

Build **1.0.0 (10)** is **VALID** and **IN_BETA_TESTING** in Sidequest Internal, verified at `2026-10-02T17:43:07.428Z`. This update responds to the profile/settings screenshots and the difficulty finding an accepted quest. No database migration is required.

## Changes

- Discover, Activity and Create show a prominent Resume quest card for the signed-in user's accepted or in-progress run. Finished/abandoned runs are excluded. Run-read failures offer recovery without inventing a current quest. A journal progress-filter link survives refresh.
- Profile's Private tab contains only private journal entries. Preferences, original drafting and submissions were removed from that tab. Preferences remain accessible from the own profile and Settings; original records/routes are retained.
- Edit profile previously toggled a form below preferences and milestones, outside the visible phone viewport. It now opens a focused editor with keyboard-safe scrolling and visible Save/Cancel/error handling. Public profile saves and ownership/version checks remain unchanged.
- Settings has compact groups, inset violet icon tiles, aligned rows and shorter descriptions while preserving account security, deletion, preferences, journal, business/operator gates and read/error recovery.

## Verification and delivery

- Open-quest browser checks: 11 pass, covering both open statuses, three entry points, finished-state exclusion, refresh, recovery and 320/390/430px enlarged-text layouts.
- Settings browser checks: 10 pass, covering mobile/enlarged text, routes, account roles, retry and block/unblock persistence.
- Profile/editor and related social/privacy/recovery checks: 21 pass. This includes photo updates retaining unsaved text, failed saves, old-WebView fallback focus, keyboard-height scrolling, Cancel/Escape focus restoration and 320/393/430px enlarged-text layouts.
- Full local checks passed: 698 unit tests in 63 files, lint, typecheck and production build. Full GitHub checks [37040185334](https://github.com/AaronPilk/side-quest-me/actions/runs/37040185334) passed: 698 unit tests, all 246 browser scenarios (16.6 minutes), isolated database checks, lint/typecheck and build. Evidence: `.local/beta10-github-checks.log`.
- Final native iPhone 17 / iOS 26.4 demo walkthrough passed: Resume from Discover, the same run visible on Activity/Create, public profile save/reopen/restore, software keyboard visibility, Cancel, journal-only Private tab, journal-entry navigation and Settings alignment. Evidence: `.local/beta10-native-verification.json` and three native screenshots.
- Production deployment [37040244355](https://github.com/AaronPilk/side-quest-me/actions/runs/37040244355) passed. Worker version `94c6bcbe-ce96-4ef6-ae88-4d216394464b`; deployed lazy assets contain Resume quest, the modal editor and Settings styling. Evidence: `.local/beta10-worker-asset-verification.json`.
- Signed archive/export, arm64 architecture, distribution entitlements and packaged production release guard passed. Apple validation succeeded without errors at 13:27:27 EDT; upload accepted at 13:29:16 EDT, delivery UUID `5ad995c2-9dc6-4d66-b7cc-bb09085b2376`. Apple processing is VALID; existing Sidequest Internal group membership and IN_BETA_TESTING state are verified. Exact English-note readback passed. Evidence: `.local/beta10-delivery-verification.json`.
- Source: `409103a273d790c8d30e2e091541787b493fcec2`. Archive: `.local/Sidequest-build10-delivery.xcarchive`; IPA: `.local/ios-production-export-build10-delivery/App.ipa`; logs: `.local/beta10-apple-validation.log`, `.local/beta10-apple-upload.log`.

## Limits

No AI/recommendation/database behavior changed in this follow-up. The build retains the camera checks/recovery from build 9. Simulator and browser success do not verify physical iPhone camera or microphone audio.
