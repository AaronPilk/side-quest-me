# OpenAI activation and quest quality — October 1, 2026

This is a **local, unshipped** update in `/Users/pilksclaes/Side Quest Me`.
Existing Claude/Series/UI work was preserved. No GitHub push, Cloudflare
deployment, hosted migration or TestFlight upload was performed.

## Implemented behavior

The owner selected OpenAI and a higher-capability model. The existing OpenAI API
key is now configured in ignored `.dev.vars` (0600), with `AI_QUEST_PROVIDER=openai`
and `AI_QUEST_MODEL=gpt-6-astra`. Model access and real Responses requests succeeded.
This uses separately billed API access, not the owner's ChatGPT subscription.

**Create → Draft with AI** uses the backend to:

1. Develop three distinct compact concepts and compare playability, a clear goal,
   originality, fit for the actual participants/intensity, and filming potential.
2. Discard concepts whose declared costs/time already exceed the plan, then expand
   the strongest eligible concept into concrete steps, rules, attempts, finish,
   fallback and matching filming guidance.
3. Apply the canonical hard filters and separately critique the actual prose for
   contradictions, misleading metadata, missing rules and invented local facts.
   Withhold a rejected proposal and preserve the existing draft.

The critique does not receive the concept's earlier scores. Nevertheless, it is
another call to the same model, not independent human judgment or a guarantee.
Ordinary catalog recommendations remain deterministic. This optional original
authoring flow still requires explicit preview/edit/save and operator review
before a quest enters the runnable catalog. Filming assistance for published
quests remains a separate single-call helper that cannot rewrite canonical rules.

Current outing inputs remain authoritative. Confirmed structured preferences can
shape the idea; unknown/legacy preferences, raw imported summaries, identity,
private free-form preference notes, area/coordinates and place IDs are omitted.
The shared brief is explicit. No live venue/event search is performed. Permanent
account authentication, named-provider consent, rate limiting and app-assigned
identity/rewards remain in place.

At most three provider calls run per original proposal, within one 90-second
deadline. Each call is capped at 60 seconds; review is capped at 30. Astra uses
low reasoning effort here to control latency while retaining the stronger model.
There are no automatic retries or silent model/provider changes. The interface
announces the wait, prevents duplicate generation and retains retry/manual paths.

## Real model evaluation

The opt-in `npm run test:ai:live` harness calls the exact Worker generator and real
OpenAI transport with synthetic data. Only the unused Cloudflare Container base
class is mocked for Node compatibility. It does not exercise authentication,
database persistence or the installed iPhone's network route. Reports include
synthetic inputs, concepts, final quest, critique, token usage and timings; no
credentials or upstream error bodies are stored. Normal tests/CI never run it.

Four scenarios passed schema, canonical eligibility and AI quality checks. The
first two were run once more after the completion-contract correction below.
Latest results for each scenario:

| Synthetic plan                                                                                    | Returned quest                      | Total generation | Observed fit                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two people, Full Send, outside, $100 group, 180 minutes including 20-minute walk                  | The Impossible Creature             | 72.8 s           | Two people build a forced-perspective creature with an untouched landscape shape; three tests and a reveal. 45-minute activity, $0.                        |
| Solo, Chill, at home, free, 60 minutes                                                            | The Scrap Span Challenge            | 52.1 s           | Fold a scrap-paper bridge, load-test and redesign; best result can be zero. 20-minute activity.                                                            |
| Three friends, Bold, outside, $10 each, 60 minutes including 15-minute travel and $12 travel cost | The Landscape's Worst Job Interview | 81.8 s           | Six private in-group rounds with balanced judging, scoring and a tie-break. 25-minute activity; $0 activity plus $12 travel fits $30.                      |
| Two people, Full Send, outside, free, “first time you laughed together”                           | Our Completely Untrue Origin Story  | 69.6 s           | A clearly fictional ten-turn story using outdoor cues and callbacks, with three details resolved at the end. No assumed shared memory. 30-minute activity. |

The friends and memory cases used the preceding prompt revision. Their actual
completion requirements were separately inspected and did not contain the
victory/completion contradiction. Both affected cases were rerun after the fix.
Latest reports are `.local/ai-eval/gpt-6-astra/<scenario>.json`; timestamped copies
retain earlier runs. The first four passing trials are also recorded in
`.local/openai-live-*-final.log`; corrected cases are in
`.local/openai-live-*-attempts.log`.

### What the evaluations caught

- Initial medium-effort concept calls timed out at 30 and then 60 seconds. An
  earlier verbose low-effort concept format also exhausted the total deadline
  and produced cut-off concept sentences. The shortlist was reduced to a concise
  mission and goal, then full details were delegated to expansion. Failed trials
  remain evidence; the final results are not a claim of a perfect success rate.
- Human review caught a defect in two AI-approved proposals: the bridge and bank
  shot fallbacks allowed an honest failed attempt, while completion questions
  required a successful bridge or target score. Those questions become app
  requirements. Generation and critique now explicitly separate winning from
  completing a genuine attempt. The two subsequent real outputs allow an honest
  failed outcome and retain a distinct winning goal.
- A small GPT-6.1 Sol comparison produced usable output, but human review found
  weak floating-body illusion instructions in one approved result. It was not a
  controlled benchmark establishing which model is best. Astra stays selected.
- Intensity and novelty are still subjective. The ten-turn improv story is
  coherent, but may feel less adventurous to some users; photography-based ideas
  can still recur. The sample is small and generation takes roughly a minute.
  Model grades alone must not certify originality, fun, factual truth or virality.

## Verification and release boundary

- Unit coverage includes provider selection, consent/authentication, privacy,
  malformed output/refusals/timeouts, shared deadlines, concept ranking, hard
  constraints and rejecting an AI critique's blocking findings. These mocked
  semantic cases prove the rejection path, not language understanding.
- Five focused draft browser cases and three filming browser cases passed using
  explicitly mocked providers. They cover consent, preview, editable save/reload,
  fallback, delayed generation, duplicate protection and retry. Evidence:
  `.local/ai-draft-busy-browser.log`, `.local/openai-filming-browser-final.log`,
  `.local/ai-evidence/ai-draft-busy-mocked.png`.
- Typecheck, lint, production build and **569 unit tests in 54 files** passed.
  Counts are recorded in `.local/openai-unit-final.log`; static/build logs use
  `.local/openai-{typecheck,lint,build}-final.log`.
- `npm run ios:simulator -- --device=362169C5-73E9-41CA-A78A-3438BA288FE1 --demo`
  built, installed and launched on iPhone 17 / iOS 26.4. The rebuilt native app
  opened Create and Profile. Log: `.local/openai-ios-build.log`. Subsequent source
  changes affected only the backend/tests/docs. This is not a live AI phone test:
  demo AI intentionally remains disabled.
- The local Worker reported OpenAI/Astra configured, but local Supabase credentials
  are absent. This readiness flag is not proof of a live signed-in route. Real
  authenticated generation, save/reopen and physical-iPhone behavior remain to be
  verified in a configured non-demo environment before release.
- Both available provider keys were checked against 167 client/native bundle files;
  neither appeared. `.dev.vars` and evaluation reports remain ignored and untracked.
- This activation adds no database migration. Earlier account-intent and Series
  migrations are still part of the pending reviewed application release.

See `docs/AI_SETUP.md` for production secret/variable setup and
`docs/CLAUDE_REVIEW_PROMPT.md` for the requested pre-release Claude review. The
installed production/TestFlight app has not received these changes.

References: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
