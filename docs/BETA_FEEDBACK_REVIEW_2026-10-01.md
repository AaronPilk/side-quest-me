# TestFlight feedback review — October 1, 2026

Initial review covered all **13 screenshot feedback submissions** then returned by App
Store Connect for Sidequest Me. Every submission is associated with **1.0.0 (3)**,
build `6d4968d2-0e57-4ca0-9fa2-c1d964f57c04`. Feedback was submitted from
3:30–3:43 p.m. America/New_York on October 1. The reported device runs iOS 18.7.3
with a 393 × 852-point screen. Apple returned **zero crash feedback submissions**;
that is not proof that no crash occurred. A second fetch confirmed 13 total with
no additional page or new entries.

All comments and screenshots were inspected. Raw feedback and screenshot evidence
are retained in ignored `.local/beta-feedback-2026-10-01/`; emails and expiring
asset URLs are intentionally excluded from this report. This is an inspection
and prioritized change list. The build-5 implementation status below supersedes these historical findings.

## Follow-up review: seven more submissions

A fresh App Store Connect fetch returned **20 screenshot submissions total**,
including **seven new reports from 4:53–4:57 p.m. America/New_York** on October 1.
All 20 are associated with **1.0.0 (3)**. There are no build-4 feedback submissions
in this response. A second fetch confirmed the same 20, with no next page or
additional entries. The crash-feedback endpoint still returned zero submissions.

All seven new comments and full screenshots were inspected. Private evidence is
in ignored `.local/beta-feedback-2026-10-01-followup/manifest.json` and adjacent
images. Numbers continue the original inventory; each batch is newest first.

| #   | New feedback                                                                                                               | Finding                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | The app keeps saying the profile could not be updated even though it has been.                                             | Screenshot shows the **Retry profile details** banner and missing follower/following counts. This is a social-profile **read failure** mislabeled as an update failure. A prior read error can also remain after a successful save. The underlying failed RPC is not yet diagnosed.                                                                      |
| 15  | Removing the selected location still produces no quest.                                                                    | Screenshot still shows zero results and the same missing cost, permission and arrangement requirements. Clearing a specific place does not clear the venue setting; changing the place also resets those confirmations.                                                                                                                                  |
| 16  | Remove the More options section.                                                                                           | Screenshot shows arrangement, venue permission, cost and adult-context controls before the user has a quest. All checkboxes shown are checked, while venue cost remains unknown. Relevant confirmations should belong to a concrete quest/booking flow, rather than appear as an optional generic form that can determine whether anything is suggested. |
| 17  | These answers should not produce no available quest.                                                                       | Exact visible plan: **Demon · Full Send · Friends / 4 people · $300 total · Unlimited time · At a venue**, with The Mandarin Hide selected in Saint Petersburg. Local catalog reproduction explains the failure below.                                                                                                                                   |
| 18  | Why does nothing fit when AI is supposed to create the quest?                                                              | Confirmed product-routing gap: normal **Find my quests** never invokes AI. It filters the published catalog. Empty results do not continue into AI generation.                                                                                                                                                                                           |
| 19  | Let the app pick a nearby destination; choosing an exact place should be for users who already know where they want to go. | Screenshot shows a user-entered Bar search and real local Apple Maps results. Place lookup works in this example, but area-based activity discovery and destination selection are still absent. This reinforces original reports #4–5.                                                                                                                   |
| 20  | Replace Getting there dropdown with visible choices.                                                                       | Screenshot confirms the unchanged native transport select. Duplicate of original report #6, still open.                                                                                                                                                                                                                                                  |

### Confirmed causes and remaining uncertainty

**Empty results:** `src/pages/Quest.tsx:146` invokes catalog recommendations and
then viability; `worker/index.ts:383` handles that catalog route. The separate
AI entry appears on the first wizard step (`src/components/QuestWizard.tsx:775`),
not on the empty-result screen (`src/components/QuestFit.tsx:129`). That AI path
also creates an editorial draft awaiting review; it is not a spontaneous,
immediately playable generated quest.

An in-memory reproduction using the screenshot-visible outing and default
preferences returned **zero choices** and the exact **Your Friends Wrote Your
Set** recovery text. The local catalog contains 74 Demon / Full Send variants:
72 support home/outside, one needs 5–10 people, and the remaining venue quest
supports 3–8 people but requires confirmed venue cost, permission and arrangements
(`shared/catalog.ts:1023`, `:1123`; `shared/recommend.ts:130`). Supplying those
three confirmations hypothetically yields that one quest. No user answers were
changed. This demonstrates a catalog-coverage and planning-flow problem, not
that there are no suitable real-world activities for this outing.

Place context contributes ranking after eligibility filtering
(`shared/recommend.ts:276`). The place-picker callback explicitly clears venue
cost, permission, arrangement and adult confirmations
(`src/components/QuestWizard.tsx:546`). That explains why removing a place does
not solve the missing requirements and can reintroduce them. The actual private
profile, submitted request and production catalog were not retrieved, so the
local reproduction is not a reconstruction of every production input.

**Profile banner:** `src/pages/Creator.tsx:74–80` catches a failed
`socialApi.read()` into `socialError`; `:220–229` renders the photographed banner.
`worker/social.ts:44–46` maps unrecognized RPC failures, including the read call
at `:149–154`, to an update-failure message. Visible account details come from
separate requests, so they can load successfully while social details fail.
Furthermore, a successful mutation at `Creator.tsx:118–121` does not clear the
old `socialError`. This confirms misleading classification and stale-error
handling, but does not establish why the underlying read RPC failed.

### Build 4 comparison and priorities

Build 4 partially addresses original #1–2 only in **optional Draft with AI**
through stronger audience/intensity routing and rejection. Normal Create still
uses the catalog. None of the original 12 negative submissions can be considered
fully resolved by that release; #3 was positive feedback. The seven new reports
also concern paths unchanged by build 4. Updating TestFlight alone is therefore
not a resolution of this feedback.

1. Connect the normal Create journey to location-aware experience generation,
   with explicit handling for unknown availability/cost. Preserve the chosen
   group, budget and intensity. Suggestions should lead into relevant booking
   checks instead of requiring a booking before suggesting an idea.
2. Make current area the discovery input; exact venue selection is optional.
   Offer varied destinations and activities without requiring a café/bar keyword.
3. Diagnose the social-profile read failure; distinguish load errors from save
   errors and clear stale load errors after successful replacement data arrives.
4. Replace transport/budget dropdowns and move generic More options requirements
   into the relevant quest step, alongside the previously logged mobile layouts.

Focused verification should reproduce this exact four-friend outing with and
without a selected venue, cover unknown versus confirmed costs, and check that
the user has a useful next step without changing their answers. For the profile,
test a failed social read alongside successful account/community reads, followed
by a successful save: the read error must be accurate and then clear.

This follow-up performed fresh API reads, seven screenshot inspections, source
tracing and a local recommendation reproduction. No app code, account data,
production configuration or TestFlight build was changed.

## Initial feedback inventory

Numbers correspond to the local manifest, newest first. Comments are paraphrased.

| #   | Feedback                                                                                                                                                                                                | Review finding / desired result                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The sound-map quest is boring, unclear, and difficult to turn into a social video.                                                                                                                      | **Map What You Can Hear: a rhythm that repeats irregularly**, shown as Daytime · Full Send, 55 minutes, $0. Needs a clear entertaining premise and visible payoff; do not assume a filming template makes an unappealing activity compelling.                                               |
| 2   | The gray-color quest is far below the expected Full Send energy.                                                                                                                                        | **A Tiny Color Atlas: six shades hiding inside what looked like gray**, also Daytime · Full Send, 55 minutes, $0. Full Send must have meaningfully different challenge mechanics, not simply more rounds.                                                                                   |
| 3   | This quest is “actually not terrible.”                                                                                                                                                                  | **The Nearby Alphabet: your initials found in unexpected shapes.** Preserve this as a modest positive example: concrete scavenger-hunt objective and recognizable result. It is not blanket approval of the Full Send catalog.                                                              |
| 4   | Suggest adventures and destinations without requiring users to know where to go. Specific venue selection should be optional. Keep consumer use free; monetize brand UGC and business-sponsored quests. | Current implementation is a search helper, not destination discovery. An area should produce varied activity/location suggestions without a typed category. The requested paid destination distribution is a separate product capability; existing campaign attachment does not provide it. |
| 5   | Current location appears to autofill café.                                                                                                                                                              | Confirmed: venue query defaults to `cafés`; outdoor query defaults to `parks`. Current location executes that query. Remove the single-category assumption from automatic discovery.                                                                                                        |
| 6   | Remove this dropdown too.                                                                                                                                                                               | Screenshot is the transport selector. Replace native select with visible choices that retain accessible selection state.                                                                                                                                                                    |
| 7   | Fix Enter exact amount and replace the two-option budget dropdown with buttons.                                                                                                                         | Use a clear exact-amount control and visible Whole group / Each person selection. Keep slider, typed decimal amount and total synchronized.                                                                                                                                                 |
| 8   | This question should fit without scrolling.                                                                                                                                                             | Oversized intensity cards and spacing push content toward/under bottom navigation. Fit ordinary question content above a consistent action region without shrinking touch targets.                                                                                                          |
| 9   | Continue should always be at the bottom; questions should fit the screen.                                                                                                                               | Preference footer is ordinary document flow and leaves inconsistent empty space. Use a viewport-based layout with bottom-aligned actions and safe-area clearance.                                                                                                                           |
| 10  | GPT summary button is awkward and repeated on every question.                                                                                                                                           | Every question renders it; saved text adds another summary-reference disclosure. Keep summary import/editing in its dedicated step or account shortcut.                                                                                                                                     |
| 11  | Simplify this screen to a paste box and Continue; remove manual-copy clutter.                                                                                                                           | The large prompt card dominates while the paste editor is hidden in a disclosure. Show the summary paste field immediately; Continue should save successfully before advancing and retain text on errors. Distinguish copying the prompt to ChatGPT from pasting its returned summary.      |
| 12  | Button opens ChatGPT in the browser even though the app is installed.                                                                                                                                   | Physical-device feedback demonstrates the browser fallback. Investigate the app-launch path and verify with installed ChatGPT; do not treat a mocked universal-link success as proof. Browser fallback remains appropriate when app launch is unavailable.                                  |
| 13  | Account setup should fit the screen; remove the contrasting top block.                                                                                                                                  | Large title, choice cards, nickname and secondary actions overflow. A flat native status-bar surface breaks the surrounding background. Compact layout and continuous top treatment are needed.                                                                                             |

## Source findings

### Question layout and ChatGPT step

- `src/pages/preferences-wizard.css:102` makes the guided survey footer
  `position: static`. `src/pages/Onboarding.tsx:835` renders its actions in
  content flow. This explains the inconsistent Continue placement.
- `src/pages/Onboarding.tsx:717` and `:755` render the repeated ChatGPT summary
  controls. `src/components/ChatGPTPrompt.tsx:73` adds manual-copy disclosure;
  `src/components/SummaryReview.tsx:54` and `:112` control the collapsed editor.
- `src/components/QuestWizard.tsx:432` and `:860` contain the budget controls;
  `:518` contains the transport select. Intensity spacing is also controlled by
  `src/design.css:1292` and `src/glass-design.css:357`.
- `src/pages/Onboarding.tsx:643` and
  `src/components/account-type-choice.css:13` contribute to account-step height.
  `src/native-design.css:64` and `ios/App/App/SidequestPlacesPlugin.swift:66`
  contribute to the separate flat status strip.
- `ios/App/App/SidequestPlacesPlugin.swift:120` tries the fixed
  `https://chatgpt.com/` universal link, then opens an external browser. The
  screenshot/comment show that the fallback occurred on this physical iPhone;
  they do not establish why iOS declined the app association.

### Quest quality, locations and AI

- Rejected recipe definitions are in `shared/activity-recipes.ts:257` and
  `:347`; the alphabet hunt is at `:329`.
- Generic Full Send treatment at `shared/activity-recipes.ts:1155` increases
  rounds/time. Unconstrained recipes expand across all three intensities at
  `:1472`; generic expanded instructions at `:1488` and common hooks at `:1517`
  do not establish stronger adventure or entertainment value.
- `shared/recommend.ts:276` enforces eligibility and scores declared preferences.
  It does not evaluate whether a Full Send premise is adventurous or whether its
  video payoff is compelling. A correct intensity label is insufficient.
- `src/components/ApplePlaces.tsx:166` supplies the café/park default; `:203`
  clears results on changes, `:211` rejects empty searches, `:236` searches
  after geolocation, and `:310` disables search without a term.
- Coordinates are local to that picker. `src/pages/Quest.tsx:152` only supplies
  context for an explicitly selected place; `src/lib/place-context.ts:30` and
  `shared/place-matching.ts:79` use a POI category for a limited ranking bonus.
- Ordinary recommendations read published templates through
  `worker/catalog.ts:11` and `worker/index.ts:370`, then use deterministic
  matching. They are **not generated by OpenAI**. Imported summary prose is also
  not directly consumed by the ranker; structured confirmed answers are.
- AI remains separately invoked in `src/pages/OriginalQuest.tsx:496` for drafts
  and `src/pages/Quest.tsx:318` for filming assistance. The latter preserves the
  existing quest mechanics, so it cannot repair a weak activity premise by itself.

### Business direction captured

The feedback describes free consumer use, revenue from brand UGC, and businesses
paying for eligible quests that lead users to their locations. The Target example
is a proposed distribution model, not an existing agreement or revenue claim.

`worker/index.ts:408` and `:1123` attach matching funded campaigns after ranking.
They do not implement destination discovery or a requested percentage increase
in traffic to a particular business. That capability would require real business
locations, relevant quest concepts, explicit campaign distribution controls and
measurement of exposure, acceptance, completion and UGC. Paid placement should
be identifiable and still respect the user's outing and boundaries.

## Priority and acceptance criteria

1. **Core experience:** replace mechanically inflated Full Send variants with
   activities whose premise, challenge and reveal make the intensity credible.
   Use the two rejected examples as negative review fixtures and the alphabet
   hunt as a modest positive. Show enough action in the card to explain why
   someone would do it and film it.
2. **Discovery from an area:** a user who is bored at home can supply current
   location or a town and receive varied quest/destination suggestions. A
   specific venue is optional. Avoid mandatory café/gym keywords and keep actual
   place facts distinct from creative quest suggestions.
3. **Phone layouts:** consistent bottom Continue, compact ordinary question
   screens, visible choice buttons and continuous status-area appearance. Verify
   393 × 852 points with native safe areas. Preserve scrolling when required for
   keyboard use or larger accessibility text; do not clip content to satisfy a
   no-scroll assertion.
4. **ChatGPT journey:** one clear copy/open action, an immediately visible return
   paste field, and Continue that saves before advancing. Remove repeated summary
   controls from every question. Validate installed-app launch on a physical
   iPhone and preserve entered text on handoff/save failures.

Existing layout tests such as `tests/preferences-wizard-browser.spec.ts:677`
check visible controls and horizontal overflow. They do not enforce consistent
bottom alignment or zero unnecessary vertical overflow. Extend those assertions
and verify the revised native screens; the prior green test suite does not
invalidate the screenshots.

No application code, production data, campaigns or release artifacts were changed
as part of this review. No new TestFlight build was uploaded.

## Product direction clarified after the review

The owner clarified that a Sidequest should be a real experience someone wants
to tell friends about, with an entertaining premise and an uncertain outcome.
Examples include jet-ski outings, a bartender choosing a surprise order, opting
into a comedy club's audience participation, spontaneous concert tickets, a
street talent prize and a substantial guided outdoor excursion. These are
directional examples, not verified local offerings or instructions to book them.
Quiet observation exercises and generic creative worksheets do not meet this
brief merely because the app adds rounds or filming captions.

The intended creative standard is **an appealing experience first**, with filming
that captures anticipation, the attempt and an actual reveal. It should still be
worth doing when someone decides not to film. A strong model must receive this
standard in the normal discovery path, not only in the optional original-draft
tool.

Proposed intensity contract:

- **Chill:** an easy, enjoyable departure from routine, with little preparation
  or social exposure.
- **Bold:** a competitive, spontaneous or socially unpredictable twist; users
  relinquish some control or put themselves on the spot by choice.
- **Full Send:** a substantial adventure or commitment with a strong premise and
  payoff. It may involve a major first-time experience, performance, competition
  or professional adventure activity. It must not be produced by merely adding
  time, rounds, people or cost to a Chill idea.

Time is a constraint, not an intensity score. A two-hour Full Send must fit that
window including travel and preparation; unlimited time removes only the time
ceiling. Budget, available bookings, group size, personal boundaries and chosen
participation style still apply. Never imply that an event happens tonight or
that two tickets are available without a supporting live source. Different
intensities need different mechanics, and not every activity needs all three.

The heavy-drinking-before-physical-activity examples are not suitable mechanics
to implement. Preserve the desired adrenaline through the activity itself;
do not require intoxication for jet skis, trampolines, laser tag or similar
activities. A kindness quest should let the recipient decide whether to
participate or be filmed, without making assistance contingent on a performance.

The subsequent local implementation replaces the draft generator's weak
creative-commitment definition with explicit audience/experience routing and a
review of the actual Full Send mechanic. An ordinary open-mic appearance does
not meet the clarified standard. The first live five-friends evaluation still
proposed overly mild activities and was rejected; quest quality is not solved.
See `AI_SETUP.md` under "Unreleased experience routing" for scope and evidence.

Real area/place facts remain absent from model context because the generator has
no verified live discovery inventory. Changing the model alone will not provide
the missing event/venue data or connect AI to normal recommendations. The other
13-feedback UI/discovery issues above remain open; the routing follow-up is not
a claim that the complete feedback list has been implemented.

## Build 5 implementation status

All 20 reports were rechecked before release; all belong to build 3. This section records the implemented response, while the earlier findings preserve the original evidence.

| Reports | Implemented response                                                                                                                                                                                           | Verification                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1–2     | Retired weak Full Send recipe expansions. Normal Create now generates, expands and independently reviews a substantive experience.                                                                             | Two live Full Send evaluations; hard-constraint and quality unit tests.                                                           |
| 3       | Preserved the positive alphabet-hunt feedback; no blanket removal of quieter ideas from suitable intensities.                                                                                                  | Catalog/history tests.                                                                                                            |
| 4–5, 19 | Current-area or town discovery searches several real Apple Maps categories and lets the generated plan choose a compatible stop. Exact-place selection is optional.                                            | Native iPhone Simulator retrieved 12 nearby listings for Saint Petersburg; partial failure, stale response and no-location tests. |
| 6, 20   | Visible transport choices replace the dropdown.                                                                                                                                                                | Browser and native navigation checks.                                                                                             |
| 7       | Clear exact-budget button and Whole group / Each person pills.                                                                                                                                                 | Decimal/zero/slider synchronization tests and Simulator.                                                                          |
| 8–9, 13 | Compact question/account layout, bottom actions, continuous native status/header treatment. Active quest becomes a compact resume link during Create.                                                          | Safe-area screen-fit tests across iPhone sizes and Simulator walkthrough.                                                         |
| 10–11   | One focused ChatGPT step with visible paste box; Continue saves, errors preserve text; no repeated prompt shortcut on every question.                                                                          | Summary save/retry/removal and onboarding tests; native entry/save walkthrough.                                                   |
| 12      | Supported `https://chatgpt.com/#native` universal link, then explicit browser fallback.                                                                                                                        | Native compilation and handoff tests. Installed ChatGPT behavior still needs physical-phone confirmation.                         |
| 14      | Fixed read-only RPC row-lock failure, distinguished read/save errors, cleared stale errors and ignored late stale loads.                                                                                       | Database, race/retry browser tests and production verification.                                                                   |
| 15–18   | Normal Create invokes AI and presents a conditional plan before specific booking checks; clearing a place no longer restricts suggestions to a tiny published catalog. Exact constraints remain authoritative. | Exact Demon/Full Send/friends4/$300/unlimited scenario, pending cost and acceptance tests.                                        |

The business-direction portion of report 4 is retained: consumer access stays free and existing opt-in licensing/campaign tools remain. This release does not fabricate a paid location-distribution business, traffic-lift measurement or live event inventory. Those require configured event access and separate business campaign implementation.

See `BETA_FEEDBACK_BUILD_5_RELEASE.md` for release versions and final verification evidence.
