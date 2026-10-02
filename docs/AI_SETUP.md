# Sidequest AI setup — build 6, 2026-10-02

Sidequest can use **xAI/Grok, OpenAI or Anthropic/Claude** through a server-only
provider adapter. The current implementation supports three consented flows:

- **Find my quests**, the normal Create journey, generates a private, playable experience from the outing, confirmed preferences, and optional nearby Apple Maps listings. One call compares three concepts and writes the selected plan; a second call independently reviews it. Conditional booking requirements are shown after the suggestion; unknown prices are never described as free. Accepted generated experiences can be filmed and explicitly published as a story, and their author can grow them into a series. They do not enter the public quest catalog or award XP/points. A deliberate reroll can include the user's previous proposals. Retrying an interrupted request retains its exact payload and idempotency key, so a completed result can be replayed without duplicate generation.

- **Draft with AI**, linked from Create, turns a short brief and reviewed outing
  into an original quest proposal. The user previews it, chooses **Use editable
  draft**, edits the existing original form and explicitly saves. Saving does
  not publish it, make it runnable or award points. The ordinary operator review
  remains required before it enters the quest catalog.
- **Get AI filming ideas** on a fitting published/active quest proposes a concrete
  opening hook, camera shots/captions and a loop. The canonical quest mechanics,
  eligibility and rewards remain unchanged.

The imported-summary review remains manual. Browsing the published catalog stays deterministic, while normal Create now uses experience discovery when the configured provider is available. The iPhone can retrieve live Apple Maps listings across multiple activity categories; listing presence does not establish opening hours, ticket inventory, current prices, or permission. Live event inventory is not configured. Model output
requires review; schema and metadata checks do not establish that a model's text
is accurate or that it has honestly labeled every possible conflict.

## Provider choice

The default for an explicitly selected provider is:

| `AI_QUEST_PROVIDER` | Default model     | Required Worker secret | API                                  |
| ------------------- | ----------------- | ---------------------- | ------------------------------------ |
| `xai`               | `grok-4.7`        | `XAI_API_KEY`          | Chat Completions with JSON Schema    |
| `openai`            | `gpt-6-astra`     | `OPENAI_API_KEY`       | Responses with JSON Schema           |
| `anthropic`         | `claude-opus-5-5` | `ANTHROPIC_API_KEY`    | Messages with `output_config.format` |

These current model identifiers were checked against the providers' documentation
on October 1, 2026. They are configurable defaults, not a benchmark showing one
provider is best for Sidequest. The owner has now selected **OpenAI / GPT-6 Astra**.
The existing server key is configured in ignored local `.dev.vars` (mode 0600)
and as a secret on the production `sidequest-me` Worker. Model access was verified
against OpenAI with synthetic briefs. On October 1, 2026, the reviewed integration
was deployed with **TestFlight 1.0.0 (2)**. This is API billing, not pooled ChatGPT
subscription usage. See `RELEASE_REVIEW_2026-10-01.md` for delivery evidence.

If `AI_QUEST_PROVIDER` is omitted, existing OpenAI configurations continue to work.
`AI_QUEST_MODEL` overrides the selected provider's default; existing
`OPENAI_QUEST_MODEL` is also honored for OpenAI when the common override is empty.
No key is reused for another provider, and there is no silent fallback to a
provider to which the user did not consent. Unknown providers, invalid model
settings, missing selected keys or missing rate limiter bindings report AI as
unconfigured. Configuration reports readiness, not a live credential health test.

References: [Grok models](https://docs.x.ai/developers/models),
[Grok structured outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs),
[Grok Chat API](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions),
[OpenAI models](https://developers.openai.com/api/docs/models),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Claude models](https://platform.claude.com/docs/en/models/overview),
[Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Connect OpenAI

Build 6 source `c416fcd` is deployed successfully in run `37023079638`, Worker
version `5f1cb462-b93e-44d8-812b-87aec2098c01`. Authenticated production testing
passed initial OpenAI generation and a history-aware reroll (56.6 and 55.6 seconds),
exact replays, owner isolation, relevant preflight and temporary-account cleanup.
Signed iPhone build 1.0.0 (6) is VALID and IN_BETA_TESTING in Sidequest Internal.
See [build-6 release evidence](BETA_FEEDBACK_BUILD_6_RELEASE.md). The following
deployment evidence belongs to build 5.

The production Worker reports OpenAI / GPT-6 Astra as configured. Its server-only
secret, provider/model variables and separate AI rate limiter are deployed.
For build 5, deployment `36935884932` of backend `3422cbc` passed authenticated
normal-discovery smoke with real OpenAI generation, exact outing preservation,
same-key replay, owner isolation, relevant preflight and immutable zero-award
acceptance. Temporary accounts were cleaned up; no media, completion or public
posts were produced. See [build-5 evidence](BETA_FEEDBACK_BUILD_5_RELEASE.md) and
`.local/beta5-production-smoke-final.log`.

Build **1.0.0 (5)** is now `VALID` and `IN_BETA_TESTING` in Sidequest Internal,
verified at `2026-10-01T23:07:51Z` with exact testing-note readback. The full local
browser suite passes **209/209**, and 652 unit tests pass. Test-only fixture fix
`1756a3f` changes neither the iOS binary nor deployed backend. Follow-up GitHub
CI [36938154871](https://github.com/AaronPilk/side-quest-me/actions/runs/36938154871)
completed successfully, verified October 2. These are historical build-5 results.

Earlier build-2 smoke verified authentication and consent without paid generation;
the later synthetic evaluations called the generator directly. These are distinct
from the final production normal-discovery result. Configuration readiness alone
is still not a provider health test, and the complete signed-in physical-iPhone
generation flow remains a TestFlight check.

The following instructions are retained for credential rotation or another
environment; production steps 3–5 were completed for build 2.

1. Use a Sidequest API key from the [OpenAI API dashboard](https://platform.openai.com/api-keys).
   Set project spending controls there. Never put a key in chat, GitHub source,
   a `VITE_` variable, the iOS bundle or a screenshot.
2. For local authenticated Worker development, add these settings to ignored
   `.dev.vars`, preserving its existing Supabase and other settings. If the file
   does not exist, create it from `.dev.vars.example` first:

   ```dotenv
   AI_QUEST_PROVIDER=openai
   AI_QUEST_MODEL=gpt-6-astra
   OPENAI_API_KEY=YOUR_SERVER_ONLY_KEY
   ```

   Use `npm run dev`, with the existing Supabase development settings. The
   isolated demo (`npm run dev:demo` or the demo iOS bundle) never calls a real AI
   provider; it offers a manual original draft when AI is unavailable.

3. Add or rotate `OPENAI_API_KEY` as a **Secret**
   on the existing **sidequest-me** Cloudflare Worker. In the correct authenticated
   Cloudflare account, this can also be done through Wrangler's hidden prompt:

   ```sh
   npx wrangler secret put OPENAI_API_KEY --name sidequest-me
   ```

   Paste only the raw key at that prompt. Do not deploy the development Wrangler
   configuration over production.

4. In GitHub, under `AaronPilk/side-quest-me` → Settings → Environments →
   `production` → **Environment variables**, add:
   `AI_QUEST_PROVIDER` = `openai` and `AI_QUEST_MODEL` = `gpt-6-astra`.
   The deployment workflow passes these into `scripts/configure-environment.mjs`,
   which validates and carries them into the explicit production target.
   The provider API key stays a Cloudflare Worker secret.
5. Finish the reviewed application/database release through the existing workflow.
   Apply pending compatible migrations before deploying a Worker that depends on
   them: the account-intent migration, then
   `20261001173049_link_existing_run_to_series.sql`, then
   `20261001173101_series_grow_from_quest.sql` (an author filming Part 2 of their
   own private series needs it; without it the Worker's "Create Part N" flow is
   refused as `series_unavailable`). The existing separate AI rate limiter
   remains part of deployment config.
6. On a signed-in iPhone, open **Create → Draft with AI**, provide a brief, review
   the plan and explicitly consent to **OpenAI**. Generate, preview and use an
   editable draft. Confirm that the two-person/selected-intensity plan is retained,
   saving survives reopening and publishing still requires review. Also exercise
   filming assistance on a fitting published quest and verify its original steps,
   budget, group size and rewards stay intact.

For xAI or Anthropic, use the corresponding provider variable and secret from
the table, and update `AI_QUEST_MODEL` to that provider's model or remove the
override to use its default. Do not retain another provider’s model when switching providers.
The consent names the actual selected provider. An old client that
only consented to OpenAI cannot send data to Grok/Claude without updated consent.

## ChatGPT subscription access

OpenAI now documents **Sign in with ChatGPT** and subscription-backed inference
for eligible approved applications. It is possible; it is not the same as using
an API key. Commercial applications such as Sidequest currently need an approved,
registered client ID through the partner/preview process. The app has no approved
client ID configured, so it does not display a working subscription connection.

Each user connects their own eligible ChatGPT/Codex plan and uses that plan's
limits. The owner's existing subscription cannot be pooled to pay for every
Sidequest user's requests. Until Sidequest receives approval, the implemented
provider adapters use separately billed API credentials. Never copy cached Codex
OAuth tokens or CLI `auth.json` into the app to bypass client registration.

Once an approved client ID is available, add the documented authorization/PKCE,
secure token storage, per-user inference and disconnect flow as a separate reviewed
integration. A change of a provider/model environment variable does not enable it.
See [Sign in with ChatGPT](https://learn.chatgpt.com/docs/sign-in-with-chatgpt),
[request a commercial client ID](https://developers.openai.com/siwc/request-client-id),
[subscription inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
and [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Quest quality pipeline

Normal Create experience discovery uses two bounded provider calls with GPT-6
Astra at low reasoning effort:

1. Compare three materially different, scored concepts and return the complete
   selected proposal in the same structured response. `selectedConceptId` must
   identify one of the three distinct concepts. The selected concept must pass
   the existing feasibility and playability, goal and audience/intensity
   thresholds; subjective score ties do not introduce an additional rejection.
   The response schema fixes the outing's category, intensity, group, participant
   range and setting, and bounds activity time by the time remaining after travel.
2. Independently review the selected instructions using the unchanged quality
   gates. This checks coherence, concrete intensity, completeness, hidden
   requirements, boundaries, unsupported place facts, filming compatibility and
   whether a reroll merely renames a previous activity. A weak or contradictory
   proposal is withheld; a fallback remains explicitly labeled.

The total deadline is **90 seconds**, with up to **60 seconds** for comparison
and proposal and up to **30 seconds** for review, both bounded by the remaining
overall time. Combining comparison and expansion removes a provider round trip;
it does not lower quality scores or remove independent review. There is no
automatic paid retry of the full generation and no silent provider switch.

The separate **Draft with AI** original-draft flow retains three bounded stages:

1. Brainstorm three materially different playable concepts using a concise shortlist at **low reasoning effort**.
   Compare concrete actions, achievable payoff, originality, participant/energy fit
   and an observable filming story. Choose a concept using the explicit rubric.
2. Expand the selected concept into the existing strict quest structure at low
   reasoning effort. The server checks the actual outing constraints, confirmed
   preferences, budget including travel, time including preparation, and exclusions.
3. Independently review the expanded instructions for coherence, missing steps,
   hidden people/costs/requirements, generic filler, false location claims and
   filming advice that disagrees with the activity. A weak or contradictory proposal
   is withheld. There is no unbounded retry or silent switch to another model.

Winning and completing a quest are separate: the activity can have a score or
challenge to beat, while the app's completion requirements recognize a genuine
attempt and honest outcome. A failed attempt permitted by the fallback must not
force the user to attest that they won. Human review caught this mismatch in two
initially approved live outputs; the generation and review prompts now explicitly
check that contract.

There are at most three provider calls per original draft, a 90-second overall
budget and a 60-second maximum per call (the final review has a 30-second cap).
Astra remains the higher-capability model; low reasoning effort here limits latency,
while the separate planning and review stages provide the quality process.
Medium-effort concept generation timed out during initial live trials. The app shows an honest waiting state;
no made-up percentage or stage completion. Filming help stays a single low-effort
call with a 3,000-token ceiling and 30-second timeout. The model is still fallible:
structured checks and an AI critique help, but do not certify truth or originality.
The existing explicit user editing/save and operator publication review remain.

References: [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra),
[model prompting guidance](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra#prompting-best-practices).

## Data, validation and recovery

Generation requires an authenticated permanent account and explicit named-provider
consent. Raw imported summaries, profile identity, unconfirmed/legacy defaults,
free-form private preference notes and exact coordinates are excluded. Normal
discovery may send the explicitly supplied nearby listings, including their IDs,
names, addresses and categories; consent names this sharing. These are unverified
listings, not evidence of opening hours, current prices or availability. The
original draft sends the user-written brief, structured plan and confirmed
preferences without area or Apple place IDs. Filming assistance may additionally
send a matching place's coarse category, such as `Park`, but no live place facts.
Users should keep private details out of their brief.

Discovery accepts up to five optional, unique `previousProposalIds`. The server
resolves these against the authenticated owner's private proposals and unpublished
templates before any generation. Missing, invalid or other-owner history is
rejected. Only bounded summaries of previous titles, actions and mechanics reach
the model; prior proposal IDs, identity and stored location details do not. An
exact previous title is rejected locally, and independent review checks for a
renamed repeat. The curated fallback skips exact prior titles when another fitting
option exists. This improves variety without promising every reroll is novel.

The client keeps the exact payload and idempotency key for a transport retry.
Choosing **Find another experience** starts a new request with recent proposal
history; changing the outing clears that history. The server's existing lease and
cached response preserve replay behavior. The history field is optional without a
default, so older clients retain their original request/hash shape. Build 6 needs
no database migration.

The server resolves published templates and rechecks boundaries/outing before
filming help. Original proposals are validated against the strict quest contract,
assigned the app's own identity, intensity-based rewards and cooldown policy, and
checked against the same eligibility rules for time, group, setting, budget and
exclusions. An unresolved custom boundary stops generation before sharing. Rewards
and identity cannot be supplied by the model. Original drafts require explicit
save; normal discovery persists an owner-bound private proposal for later
acceptance. Nothing is automatically published, accepted or rewarded, and private
generated quests grant zero XP/points. Full Send does not change selected participant
count or override boundaries. Unknown participation is never presented as confirmed.

All providers share the existing AI guard of three requests per minute per user
per Cloudflare location. This is not an exact global spending ledger; use provider
spending controls. Normal discovery uses at most two provider calls; each original
draft can consume up to three.
Responses are bounded to 64 KiB and the deadlines above apply. Incomplete, refused,
extra-field, invalid or quality-rejected output is rejected. Failure preserves the
original quest/draft and provides retry/manual paths. Upstream bodies, submitted
private data and keys are never returned or logged. OpenAI requests use
`store: false`; no adapter setting promises zero retention beyond the provider's
applicable account policy. Claude receives a compatible reduced JSON Schema while
the server validates every original length, count and numeric constraint.

Diagnostics use fixed stage/failure labels, elapsed times, allowlisted validation
codes and numeric HTTP status. Explicit provider truncation, refusal and incomplete
responses are classified separately. Raw provider bodies, prompts, location data,
account data, credentials and error messages are not diagnostic fields.

Reference: [Cloudflare rate limiter locality and accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Verification

Full GitHub checks [37022868847](https://github.com/AaronPilk/side-quest-me/actions/runs/37022868847) pass **686 unit tests and 214 browser tests**, database checks, lint, typecheck and build.

Build 6 local verification passes **686 unit tests across 61 files**, **13 focused
discovery/native-layout browser checks**, typecheck, full lint and production
build. A native Simulator walkthrough verified the results **Edit plans** pill,
restoration of all six answers, and preservation of an existing active quest card.
One bounded synthetic Late Night / Full Send reroll for five friends produced an
approved karting championship after a previous escape-room idea in **64.8 seconds**.
This is one checked result, not a reliability guarantee. See the
[build-6 release note](BETA_FEEDBACK_BUILD_6_RELEASE.md) for its constraints,
verified production/TestFlight delivery and remaining physical-device checks.

Local automated coverage exercises all provider transports and malformed responses,
selected-provider keys/no fallback, old/new consent boundaries, authentication,
shared quota, confirmed/legacy input privacy, original identity/reward policy,
wrong group/intensity/setting/time/budget/exclusions, and provider timeout/refusal.
Browser coverage uses explicitly mocked provider output to verify named consent,
proposal preview, manual fallback, retry and editable draft save/reload. These
checks verify integration behavior. The separate paid evaluation command below uses
synthetic briefs and the real OpenAI transport/generator; it never runs in normal
unit tests or CI. Human inspection of the saved outputs remains essential.

```sh
npm run test:ai:live
# Optional: only one scenario
SIDEQUEST_AI_EVAL_CASE=outdoor-full-send-couple npm run test:ai:live
```

The five scenarios cover Full Send for five friends at a venue, Full Send for two outdoors, a free solo home activity,
a short outing with per-person budget/travel, and the previously nonsensical
“first time you laughed together” premise. Reports go only to ignored
`.local/ai-eval/`, with model, synthetic inputs, proposed concepts, quest, critique,
usage and latency. They exclude credentials and upstream error bodies. Each
scenario makes no more than three calls; there are no automatic retries.

See `docs/OPENAI_QUALITY_CHECK_2026-10-01.md` for this activation’s measured results
and remaining native/production checks.

## Experience routing — October 1 beta 4

Build 4 changes build one structured `experience_routing` brief for all three
original-draft stages. It connects confirmed interests, skills, humor, participation,
role and preparation with the current outing's exact group, intensity, available
time and remaining budget. Current outing choices override usual profile choices;
unknown answers do not become permissions. Retained exclusions remain restrictions.
Food challenges and being the target of a surprise stay narrower than ordinary
food activities or a confirmed organizer/camera role in a surprise.

Full Send now requires a substantial experience for the actual group. The prompts
explicitly reject an ordinary open mic, observation exercise, craft or extra rounds
as sufficient intensity. Friends can receive rowdy adult experiences; couples can
also choose ambitious Full Send activities. Concepts must describe their concrete
intensity mechanic, and the independent review must affirm audience/experience fit
from the actual instructions. A weak shortlist stops before expansion with
`ai_quality_retry`; it does not quietly lower intensity or change the outing.

The AI draft plan exposes existing venue age eligibility, venue permission and
optional adult-nightlife controls. These are outing-specific self-declarations,
not DOB collection, age verification or proof that everyone is 21+. Changing the
group, headcount or setting clears inherited eligibility, permissions, arrangements
and venue charges. Boundaries still apply. Adult atmosphere and irreverent humor
are allowed; mandatory intoxication or drinking before physical activities is not
a quest mechanic.

The live `five-friends-full-send` test **did not produce an acceptable quest**.
GPT-6 Astra returned three private-party/improv concepts with audience/intensity
scores of 2, 3 and 3. The first-stage threshold correctly rejected all of them
after one successful provider call (about 37 seconds). This is evidence that the
rejection works, not evidence that the desired quality has been achieved. Report:
`.local/ai-eval/gpt-6-astra/five-friends-full-send.json`.

Historical build-4 behavior (superseded by build 5): that change only affected **Draft with AI**. Ordinary Create recommendations still
come from the published catalog. The remaining product work is to connect that
journey to verified local activities/events and route those facts into generation,
while keeping availability, booking costs and creative suggestions distinct.
This release adds no live place/event data source. The reviewed follow-up
is now deployed with **TestFlight 1.0.0 (4)** and the matching production Worker;
see `EXPERIENCE_ROUTING_RELEASE_2026-10-01.md` for delivery evidence.

Verification: 624 unit tests and all 10 focused AI draft browser scenarios pass;
typecheck, lint and production build pass. Browser provider responses are mocked.
The iPhone 17 / iOS 26.4 Simulator build compiled, installed and launched with
production configuration. A follow-up native walkthrough reached the welcome
screen's email sign-in form using keyboard scrolling. There is no visible guest
path into Create; the new adult-option form still requires an authenticated
native/physical-device walkthrough. Do not count it as Simulator-verified yet.
There are no database changes in this follow-up.

## Build 5 normal experience discovery

`POST /api/quests/discover` requires authentication, named-provider consent and an idempotency key. Build 5 introduced the configured OpenAI / GPT-6 Astra pipeline for concepts, a complete plan, and an independent quality review; build 6 combines its first two calls as described above. Current outing limits and confirmed exclusions remain authoritative. Nearby listing strings are untrusted data; only a supplied Apple place ID or no named place can be selected. Exact device coordinates and raw imported summary prose are excluded from the model. Listing coordinates are transient client context and stripped from persisted proposal/replay records.

Each proposal is owner-bound and unpublished. The user sees specific booking/price/permission checks before acceptance; the Worker and database recheck them. Private snapshots grant zero XP/points and cannot claim sponsorship. An author may explicitly publish the resulting video/story, then create later series episodes with fresh preflight. Unaccepted proposals expire after two days; a saved owned series can continue its already accepted quest later. Account deletion redacts generated prose and clears discovery caches.

If generation cannot produce an approved plan, the service may return a clearly labeled authored fallback (compatible karting, climbing, escape-room or dining mechanics). It never silently changes intensity, participants or budget. Weak expanded Full Send photo/observation/craft variants are retired from new recommendations; immutable historical versions remain readable for existing stories.

Two bounded live five-friend Full Send tests produced operator-run timed escape-room experiences and passed all independent review checks. The final test took 57.4 seconds and treated the unknown all-in admission charge exactly once. This is a checked example, not a guarantee that every generated idea will meet a user's taste.

The final authenticated production normal-discovery smoke also passed with
source `ai` for Demon / Full Send / four friends / $300 total / unlimited time /
venue, followed by same-key replay and owner-bound acceptance checks. Earlier
fast curated fallbacks exposed an unsupported Worker fetch redirect option;
backend `3422cbc` uses manual redirect handling and rejects all non-OK responses.
The complete production evidence and remaining physical checks are recorded in
[build-5 release evidence](BETA_FEEDBACK_BUILD_5_RELEASE.md).

Native nearby places work without a web Maps token on iOS 18+. Ticketmaster inventory still requires `TICKETMASTER_API_KEY`; Eventbrite remains an outbound resource. No fabricated live concerts, reservations or availability are supplied. Consumer access remains free. Existing brand licensing/campaign tools remain; paid destination targeting and traffic attribution are not added by this release.
