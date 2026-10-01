# Account and quest preferences review — October 1, 2026

The combined setup and editing flow is implemented locally for planned iOS
**1.0.0 (3)**. **599 unit tests, typecheck, lint and production build passed.** All 37 focused
preference/profile browser scenarios passed, including real safe-area emulation
at 390×844 and 402×874. The iPhone 17 / iOS 26.4 Simulator build passed and its
setup flow was exercised manually. All 185 browser scenarios passed across the broad run and final focused reruns.
The distribution archive passed Apple validation. Signed build 3 delivery is
pending; this document does not yet establish TestFlight availability.

## Implemented flow

- After sign-in, an incomplete real account is directed to `/onboarding` before
  entering the app, with a validated return destination. Setup, Settings and
  account security remain accessible if the setup check fails. Guest public
  browsing and the isolated demo do not require this account check.
- One guided journey covers personal or brand account intent, an optional
  private nickname, optional ChatGPT context, and eleven preference questions.
  Choosing Brand does not approve a business or grant operator permissions.
- The questions show progress and one question at a time. Single selections
  advance after a successful save; multiple selections use Continue. Failed
  writes show an error and retain the current answer for retry.
- Skip restores the question's last server-confirmed value and provenance
  without a write. An unanswered question stays unknown; a saved answer survives
  an accidental edit followed by Skip. **Reset answer to unknown** is an explicit
  immediate save. Empty reviewed selections remain distinct from unknowns.
- Finish later explains the value of preferences, then offers **Save and explore
  for now**. This saves account fields and confirmed preferences and marks setup
  visited/completed; it does not fill unanswered preferences with defaults.
  In-app reminders continue while preference answers are incomplete. No push
  notification permission or background reminder service was added.
- Profile’s prominent shortcut opens the guided journey directly. Settings and
  the Profile Private tab reach the account/preferences hub. Account details and
  summary editing are direct shortcuts into the same journey; users can edit or
  remove imported text without repeating all eleven questions. Explicit shortcut
  step parameters are consumed so a later refresh resumes current progress.

## Optional ChatGPT context

**Copy prompt and open ChatGPT** copies the existing profile-summary prompt, then
opens the fixed `https://chatgpt.com/` destination. The iOS bridge first attempts
the HTTPS universal link with `universalLinksOnly`; if iOS cannot open an
associated installed app, it opens the external system browser. It does not use
the in-app Safari sheet or an undocumented ChatGPT URL scheme. Browser builds
reserve a tab during the button gesture and sever its opener before navigation.

The user must paste and send the prompt, review ChatGPT's reply, return to
Sidequest and paste a summary. Nothing is automatically pasted, submitted,
retrieved or parsed. Only the prompt goes onto the clipboard; no summary,
profile, credential or private preference is appended to the URL. Official
[OpenAI web guidance](https://learn.chatgpt.com/docs/web) identifies
`chatgpt.com`; it does not establish a guaranteed iOS prefill contract. Whether
the installed app handles the link depends on iOS and ChatGPT's association.

Clipboard and launch failures have distinct feedback. A successful copy remains
available if launch fails, with an explicit retry and manual prompt access.
Automatic proposal extraction is not part of this flow: imported text is a
reference alongside the questions, and users confirm structured answers
themselves. Entertainment preferences, product-design requests, negation,
tentative impressions and unknowns are not converted into participation claims.

Optional backend quest drafting/filming assistance remains a separate
authenticated, named-provider consent flow; see [AI setup](AI_SETUP.md). The
ChatGPT handoff is not a subscription/API connection.

## Persistence and privacy protections

- Summary saves/removal use an explicit server write and success/error feedback.
  Removing text preserves separately confirmed preferences. Parent navigation is
  locked while summary edits are unsaved or a summary save/removal is pending;
  users can explicitly save or discard edits.
- Owner-scoped session drafts retain pending answers, summary text, question
  position and the question to resume after the ChatGPT detour. Resume positions
  are bounded integers. Draft storage is optional; storage failures show feedback
  rather than claiming the pending draft is durable.
- Each new draft records the last saved profile as its baseline. If the server
  profile changed, stale same-owner drafts are discarded with a notice so older
  answers/text cannot replace newer saves. Matching baselines preserve failed-save
  retry edits. Legacy drafts without a baseline resume only when their durable
  content agrees with the saved profile; older missing account intent cannot
  erase a current choice.
- Loading setup validates both parallel draft routes against the saved profile,
  so a later partial save cannot make a stale draft appear current and resurrect
  removed text. The regression checks both routes before and after a save.
- Successful profile writes synchronize parallel drafts, including summary text
  and baselines. Auth identity changes clear bound drafts and remount routes;
  late saves retain their captured account token and cannot retag another user's
  draft. Imported text remains separate from confirmed answers and is excluded
  from the existing backend AI requests.
- Unknown/ambiguous legacy preferences do not produce invented role or fit
  statements. Confirmed preferences improve matching; the current outing remains
  authoritative for budget, time, setting and group. Firm exclusions remain hard
  filters.

## Canonical routes

| Route                                           | Purpose                                                         |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `/onboarding?returnTo=…`                        | First signed-in setup with a validated return destination.      |
| `/preferences?returnTo=…`                       | Combined account and preference editing/resume journey.         |
| `/account`                                      | Account & quest preferences hub, reached from Profile/Settings. |
| `/preferences?step=account&returnTo=%2Faccount` | Account intent and nickname shortcut.                           |
| `/preferences?step=summary&returnTo=%2Faccount` | Copy/open ChatGPT, edit or remove summary.                      |
| `/account/security`                             | Sign-in, privacy, sign-out and account deletion.                |
| `/profile/import`                               | Compatibility redirect to the summary shortcut.                 |
| `/onboarding?preferences=1`                     | Retained legacy direct-question entry.                          |

## Verification and remaining iOS checks

The passing unit coverage includes native/browser handoff outcomes, copy versus
launch failure, draft ownership/freshness, summary synchronization and existing
profile persistence protections. These mocks do not demonstrate that the actual
ChatGPT iOS app opens. The Simulator verified Personal account → ChatGPT context → question selection
→ skip → Save & leave, with the exact answered count on Profile. The native
copy/open action launched external Safari at ChatGPT and returned to the same
setup screen; ChatGPT itself is not installed in the Simulator. Native evidence
is saved locally at `.local/ios-evidence/preferences-chatgpt-build3.png`.
The focused browser cases also cover failed writes, summary removal after
refresh, stale-draft recovery, question resume, large text and reduced motion.

On the signed build, test fresh sign-in and saved skip, Profile/Settings entry
points, save errors/retry, summary edit/removal after reopening, and question
resumption after leaving for ChatGPT. On a physical iPhone, test ChatGPT installed
and absent, clipboard permission/error behavior, external browser fallback,
background/foreground and return with a pasted summary. Unsaved session drafts
are not a promise of survival after app termination; confirmed server saves
must persist. Camera, Photos, mail callbacks and actual device interruptions
remain separate physical-device acceptance checks in [iOS release](IOS_RELEASE.md).

## Build candidate

Final native source compiled successfully in the iPhone Simulator and as an
arm64 distribution archive at `.local/Sidequest-build3-release.xcarchive`.
The exported `.local/ios-production-export-build3-release/App.ipa` is
`com.aaronpilk.sidequest`, version `1.0.0`, build `3`, with `get-task-allow=false`
and `beta-reports-active=true`. Its SHA-256 is
`9f1e511c5b4a18eeca178d232ff83f9617688513ce477568c959bf4f05277a77`.
Apple validation reported no errors. No database migration is required.

The 185 passing browser scenarios are the union of the 159-case broad run
(after correcting four outdated identity fixtures and rerunning them), the
25 updated legacy-flow cases, and one added stale-draft regression. All 44
final affected cases passed after the parallel-draft fix; all 599 unit tests
were also rerun successfully. Logs remain in ignored `.local/combined-*` and
`.local/preferences-*` files.
