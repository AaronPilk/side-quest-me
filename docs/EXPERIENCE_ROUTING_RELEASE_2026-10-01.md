# Experience routing — iPhone beta 4

Source commit: `cde77f5384b06ecd0b46a632febf95106afd1ded`.
Version: **1.0.0 (4)**, bundle `com.aaronpilk.sidequest`.

## Scope

The optional **Create → Draft with AI** flow now builds one structured experience
brief from confirmed preferences and the current outing for concept generation,
expansion and independent review. Current group/headcount, intensity, time and
budget remain authoritative. Full Send needs a substantial experience rather
than an ordinary open mic, observation task, craft or extra rounds. The reviewer
must assess the actual activity's audience/experience fit.

The venue plan exposes existing age eligibility, permission and optional adult
nightlife fields. These are self-declarations, not verified age or verified 21+
status. Changing group/headcount/setting clears inherited venue and adult
confirmations. Firm boundaries remain enforced; food challenges are distinct
from ordinary food experiences, and being surprised is distinct from an
explicitly confirmed organizer/camera role.

No database migration, public API contract, catalog publication or reward policy
changes are included. Older clients remain compatible. Live Apple Maps/event
facts are not connected to AI generation, and the normal Create flow still uses
the published catalog. The 13 beta-feedback UI/discovery items recorded in
`BETA_FEEDBACK_REVIEW_2026-10-01.md` are not all resolved by this release.

## Verification and limits

- 624 local unit tests, typecheck, lint and production build pass.
- All 10 focused AI draft browser tests pass with mocked provider responses.
- Independent release review found no blocking regression; 67 focused
  routing/quality/AI tests passed again.
- A live GPT-6 Astra five-friends Full Send test returned three concepts with
  insufficient audience/intensity scores. All were rejected after the first
  provider call. This validates rejection, not successful creative quality.
- Production-configured iPhone 17 / iOS 26.4 Simulator compiled, installed and
  launched. Native welcome and sign-in rendering were inspected. The changed AI
  form was not reached because the production welcome requires sign-in; it
  still needs authenticated physical-device testing.
- The final Release archive passed production-bundle validation and code-signature
  verification. Apple validation and upload both succeeded with no errors.

Archive: `.local/Sidequest-build4-release.xcarchive`.
Export: `.local/ios-production-export-build4-release/App.ipa`.
IPA SHA-256: `164290c1580dd6936dee85143f493d3764348f26b7d16ab3e2b5d9e8331c4d36`.
Apple delivery/build ID: `dd0a5d1d-a82a-49e1-9635-47f1c5b7633f`.
Apple processing state: `VALID`.
Saved English testing notes match `docs/TESTFLIGHT_NOTES.md`.

## Delivery status

The [exact-source Checks run](https://github.com/AaronPilk/side-quest-me/actions/runs/36921110885)
passed: lint, typecheck, 624 unit tests, isolated PostgreSQL checks, render fixtures,
all 190 browser tests (13.2 minutes), and production build. The runner's dependency
installation took 7m 41s; that delay was unrelated to an application failure.

The matching [production deployment](https://github.com/AaronPilk/side-quest-me/actions/runs/36924031497)
succeeded, Worker version `6f623382-7191-40da-b6fa-805f87ebddc1`. Health reports
production mode, database and renderer configured, and demo mode off. The AI
configuration reports OpenAI / GPT-6 Astra ready. The draft entry and shipped
application asset return HTTP 200. Event configuration remains false.

Apple reports **VALID** and **IN_BETA_TESTING**, and build 4 is assigned to the
existing **Sidequest Internal** group. No new tester or external beta review was
created. Testing notes were saved and read back against the local notes file.
Existing testers can update to **Sidequest Me 1.0.0 (4)** in TestFlight. Physical
installation and the authenticated phone walkthrough remain tester checks.
