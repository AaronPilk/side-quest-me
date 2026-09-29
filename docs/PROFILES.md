# Confirmed preferences and imported context

New profiles use preference version 2. A `null` answer is unknown; `[]` on exclusions is an explicit choice of no listed boundaries. Free-text fields use an empty string for absence. Continuing or skipping a question never creates an answer or removes a previous choice. The reset action clears the value and its source. The survey still has ten questions, with interests and usable skills separated within question eight.

Historical profiles remain readable. Old default scalar values (`rotate`, `depends`, `varies`, `decide_later`) cannot reveal whether the user chose them, so normalization leaves those fields unknown and records `legacyUnconfirmed` for an honest review notice. Non-default answers and existing firm boundaries survive. Invalid fields do not erase valid answers elsewhere. Explicit version-2 answers, including role rotation, are retained. Accepted historical quest snapshots and roles are never rewritten; new unanswered roles are nullable.

## Import and editing

`/profile/import` is available from account settings without repeating onboarding. Summary text and structured preferences have separate save actions. **Remove saved summary** immediately persists an empty summary, reports success or failure, and does not erase confirmed answers. Narrow profile patches also synchronize only affected fields in an existing onboarding draft, preventing deleted text from returning while preserving other unsaved answers.

There is no configured application AI parser. The flow is explicitly manual: the summary remains visible beside interest, skill, willingness, participation, and boundary controls. Unknowns and tentative impressions remain text, with guidance to leave their controls unanswered. Saved text alone has no effect on recommendations. Watching entertainment, negation, guesses, and product-design requests are never converted through keyword matching. Each chosen answer records `survey` or `summary_review` provenance; removing the source text leaves separately confirmed answers intact.

Automated parsing would require an application-integrated server-side provider, a structured proposal schema with verbatim supporting excerpts, a review UI for edits/rejections, and confirmation before any proposal enters matching. Merely setting a provider key does not enable extraction in this build.

## Recommendation audit

Eligibility filters run before ranking. All ranking reasons are generated from the same factors that add score; unknowns and flexible answers do not generate invented fit claims. The current outing controls category, intensity, budget, time, setting, permissions, and group size.

| Collected preference                          | Current use                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicit activity willingness                 | Matching quest tags add 5 per match. A spontaneous choice requires a start-now quest with no arrangement. Open-mic practice is described as practice.                                                                                |
| Useful skills                                 | Matching skill tags add 4 per match. “No special skill” is neutral.                                                                                                                                                                  |
| Personal interests                            | Matching interest tags add 3 per match; enjoyment is distinct from skill or willingness.                                                                                                                                             |
| Humor                                         | Matching humor tags add 2 per match. Entertainment examples stay text.                                                                                                                                                               |
| Participation role                            | Adds 2 only when the quest supports the confirmed role; otherwise selected role remains unknown.                                                                                                                                     |
| Preparation                                   | Matching preparation adds 2. “Varies” remains neutral.                                                                                                                                                                               |
| Approaching people                            | Confirmed group-only participation excludes required stranger interactions outside home; matching group/invitation/conversation preferences add 2.                                                                                   |
| Firm exclusions                               | Hard filters, with existing context-specific exceptions (a home practice is not public performance; a supported organizer/camera role is not the surprise target). Custom boundary prose pauses recommendations for explicit review. |
| Category and usual intensity                  | Retained for review; current outing choices determine eligibility. They do not add redundant ranking claims.                                                                                                                         |
| Sharing preference                            | Retained privately. Never authorizes publication, a hosted share link, or advertising use.                                                                                                                                           |
| Other skill, humor examples, imported summary | Retained as reviewed text. No automatic interpretation or unsupported ranking claims.                                                                                                                                                |

Previously attempted families receive the existing novelty penalty; reward eligibility remains independently evaluated. Reviewed original quests go through the same schema, filters, ranking, and acceptance checks as authored catalog quests.

Focused model/client/domain tests cover unknowns, provenance, ambiguous legacy data, persistence/failures, neutral unsupported answers, positive recommendation changes, and hard exclusions. Browser regressions cover skipping, preserving an answered question, explicit reset, manual confirmation, and immediate summary removal after refresh.
