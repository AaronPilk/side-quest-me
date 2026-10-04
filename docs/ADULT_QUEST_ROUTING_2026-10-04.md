# Adult quest routing — October 4, 2026

Sidequest now collects an optional private age group and routes Demon / Full Send toward concrete adventures, rivalry and reveals that fit the actual outing. Normal Create uses the saved preferences and separate outing permissions to shape AI ideas and authored alternatives. **The matching Worker is deployed and Build 15 is available in internal TestFlight.** See the [release evidence](APP_STORE_PREPARATION_2026-10-04.md). No App Review submission or public release has been sent.

## Account and outing flow

- Account setup offers **Under 18**, **18–20** and **21+**, plus a way to skip or clear the answer. It collects no date of birth or ID. Only a directly saved survey answer counts; a ChatGPT summary or legacy default cannot establish age.
- Age is private and self-reported. Unknown/under-18 accounts do not qualify for adult-only ideas. An 18–20 answer does not enable alcohol or 21+ venues. Public creator and social profile responses exclude the age group.
- The current outing separately confirms the group meets venue age rules and opts into adult nightlife. Venue permission, actual admission rules, arrangements, costs and boundaries remain independent checks. A promising activity can be suggested with a clear pending booking; pending does not mean confirmed.
- When an account clears age while an outing still has adult choices, Create offers **Find ideas without adult nightlife**. This explicitly clears those choices so the person can continue. Age-related acceptance failures link back to account preferences.
- Existing named-provider consent explains that confirmed preferences can include the optional age group. Raw imported summaries, profile identity and exact device coordinates remain excluded from experience planning. The filming-copy helper retains its narrower payload without age.

## Idea selection and acceptance

`shared/quest-routing.ts` connects category and intensity with current group size, setting, available time, travel, whole-group budget and confirmed preferences. Current outing choices outrank usual interests; exclusions still constrain every route. Demon is an audacious mood rather than an age rating. Full Send must earn its intensity through the actual commitment or competition, not ordinary rounds with louder copy.

Normal discovery still uses two bounded provider calls: compare three distinct concepts and expand the selected one, then independently review its instructions. Eligible adult-nightlife requests receive three assigned experience directions so all candidates do not collapse into the same bar game. Booked professional service is distinguished from recruiting strangers. Nothing grants permission to target staff or other guests, and alcohol cannot be a quota, forfeit or prerequisite for a physical activity.

New adult proposals carry an activity age floor of 18 or 21. The server re-reads saved preferences before cached replay and acceptance; changing from 21+ to 18–20 or clearing age invalidates an incompatible stored plan. An older adult plan without an explicit age floor requires a fresh age-matched suggestion for an 18–20 account. Age failures are blocking rather than a pending checkbox the client can confirm. Published catalog and private generated acceptance share the eligibility check. Database acceptance functions remain service-role-only.

The authored fallback catalog now has 12 families, including live shows, staycations, golf, fishing, e-bike outings, a willing-group wingman challenge and age-eligible nightlife. Each option is filtered against the actual group, time, budget, setting, intensity and boundaries. Exact prior titles are excluded. A matching supplied place may ground the suggestion, but listings do not establish prices or availability. No fitting option means no invented fallback. Bar-route games and mystery orders are not labeled Full Send.

The quest activity schema allows up to 2,880 minutes so Unlimited can support an overnight experience. Finite outings retain their 720-minute cap, with travel deducted separately. The authored staycation requires Unlimited and accounts for 1,200 minutes rather than presenting a hotel stay as a short evening activity. Generated private experiences still grant no XP/points and do not enter the public quest catalog.

## Verification recorded before release

The complete unit run passed **799 tests**. Typecheck, lint, production build and database advisor checks passed. Focused browser checks passed for optional age save/clear, adult-nightlife opt-in, under-age routing, recovery from stale adult outing flags, account setup, published-quest recovery, Apple Maps/AI draft controls and privacy/consent copy. Browser provider responses are mocked; these checks do not verify physical-iPhone behavior.

Three final synthetic live GPT-6 Astra discovery samples passed generation and independent review:

| Saved age / time | Returned experience | Activity time | Observed latency |
| --- | --- | --- | --- |
| 21+ / 180-minute outing | **Book the Roast. Reveal the Traitor.** — a proposed professional roast booking with a secret selector | 150 minutes | 48.3 seconds |
| 18–20 / 180-minute outing | **Trust Nobody at This Table** — a staffed immersive mystery with group objectives | 160 minutes | 40.3 seconds |
| 21+ / Unlimited | **Let Your Friends Book Your Bad Decisions** — a mystery dinner, lounge and show itinerary | 330 minutes | 50.7 seconds |

Local evidence: `.local/ai-eval/discovery/adult-demon-nightlife.json`, `young-adult-demon.json` and `unlimited-staycation.json`. These reports use synthetic listings and remain ignored local artifacts. The Unlimited sample demonstrates a longer night out, **not a successfully booked or live-verified overnight stay**. Earlier iterations produced rejected weak ideas and mismatched requirements; the final samples are evidence of working routes, not a guarantee that every generation will pass or meet a person's taste.

## Release implications and remaining checks

**No database migration is required.** Age uses existing private preference JSON; the optional quest age floor uses existing content JSON. No stored quest rows are rewritten. The schema accepts older clients and existing content, while the server applies current age restrictions when a plan is replayed or accepted.

The matching Worker logic is deployed and the updated iOS bundle is available in internal TestFlight. The final source passed all 286 browser scenarios and 799 unit tests. Simulator interaction verified age selection and persistence; the full adult opt-in and stale-plan recovery flows are covered by browser fixtures and remain physical-iPhone checks. Production smoke verified private age persistence and public exclusion, but did not exercise production AI discovery or replay. Public privacy and AI consent copy were updated; no Apple privacy declaration, age-rating answer or submission was changed as part of this release.

Live event inventory and booking confirmation are still external. Apple Maps supplies place listings, not ticket availability, hotel rooms or current all-in prices. Generation still has bounded deadlines and can fall back or fail when no strong, compatible plan survives review.

Related documentation: [AI setup](AI_SETUP.md) and [privacy inventory](APP_PRIVACY_INVENTORY_2026-10-02.md).
