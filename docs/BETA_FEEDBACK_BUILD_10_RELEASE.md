# Build 10 profile, private journal and open-quest navigation — 2026-10-02

Delivery is pending. This update responds to the profile/settings screenshots and the difficulty finding an accepted quest. No database migration is required.

## Changes

- Discover, Activity and Create show a prominent Resume quest card for the signed-in user's accepted or in-progress run. Finished/abandoned runs are excluded. Run-read failures offer recovery without inventing a current quest. A journal progress-filter link survives refresh.
- Profile's Private tab contains only private journal entries. Preferences, original drafting and submissions were removed from that tab. Preferences remain accessible from the own profile and Settings; original records/routes are retained.
- Edit profile previously toggled a form below preferences and milestones, outside the visible phone viewport. It now opens a focused editor with keyboard-safe scrolling and visible Save/Cancel/error handling. Public profile saves and ownership/version checks remain unchanged.
- Settings has compact groups, inset violet icon tiles, aligned rows and shorter descriptions while preserving account security, deletion, preferences, journal, business/operator gates and read/error recovery.

## Verification and delivery

- Open-quest browser checks: 11 pass, covering both open statuses, three entry points, finished-state exclusion, refresh, recovery and 320/390/430px enlarged-text layouts.
- Settings browser checks: 10 pass, covering mobile/enlarged text, routes, account roles, retry and block/unblock persistence.
- Profile/editor checks, full local checks, full GitHub checks and final native Simulator walkthrough: pending.
- Production deployment, signed archive, Apple validation/processing and tester assignment: pending.

## Limits

No AI/recommendation/database behavior changed in this follow-up. The build retains the camera checks/recovery from build 9. Simulator and browser success do not verify physical iPhone camera or microphone audio.
