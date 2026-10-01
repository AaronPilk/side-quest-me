# Sidequest AI setup — OpenAI activation, 2026-10-01

Sidequest can use **xAI/Grok, OpenAI or Anthropic/Claude** through a server-only
provider adapter. The current implementation supports two optional flows:

- **Draft with AI**, linked from Create, turns a short brief and reviewed outing
  into an original quest proposal. The user previews it, chooses **Use editable
  draft**, edits the existing original form and explicitly saves. Saving does
  not publish it, make it runnable or award points. The ordinary operator review
  remains required before it enters the quest catalog.
- **Get AI filming ideas** on a fitting published/active quest proposes a concrete
  opening hook, camera shots/captions and a loop. The canonical quest mechanics,
  eligibility and rewards remain unchanged.

The imported-summary review remains manual, and normal catalog recommendations
remain deterministic. These integrations do not search local events or claim to
verify locations, availability, opening hours, costs or permissions. Model output
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

The production Worker reports OpenAI / GPT-6 Astra as configured. Its server-only
secret, provider/model variables and separate AI rate limiter are deployed.
Authenticated production smoke tests verified sign-in and named-provider consent
guards without generating paid content. Readiness is not a provider health test;
earlier live synthetic evaluations called the same generator directly. The complete
signed-in physical-iPhone generation flow remains a TestFlight check.

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

Original ideas now use three bounded, server-side stages with GPT-6 Astra:

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

There are at most three provider calls per original proposal, a 90-second overall
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
consent. Imported summaries, profile identity, unconfirmed/legacy defaults,
free-form private preference notes, exact coordinates, area and Apple place IDs
are excluded. The original draft sends the user-written brief, the structured plan
and confirmed preferences. Filming assistance may additionally send a matching
place's coarse category, such as `Park`, but no live place facts. Users should
keep private details out of their brief.

The server resolves published templates and rechecks boundaries/outing before
filming help. Original proposals are validated against the strict quest contract,
assigned the app's own identity, intensity-based rewards and cooldown policy, and
checked against the same eligibility rules for time, group, setting, budget and
exclusions. An unresolved custom boundary stops generation before sharing. Rewards
and identity cannot be supplied by the model. Nothing is automatically saved,
published, accepted or rewarded. Full Send does not change selected participant
count or override boundaries. Unknown participation is never presented as confirmed.

All providers share the existing AI guard of three requests per minute per user
per Cloudflare location. This is not an exact global spending ledger; use provider
spending controls. Each original proposal can consume up to three provider calls.
Responses are bounded to 64 KiB and the deadlines above apply. Incomplete, refused,
extra-field, invalid or quality-rejected output is rejected. Failure preserves the
original quest/draft and provides retry/manual paths. Upstream bodies, submitted
private data and keys are never returned or logged. OpenAI requests use
`store: false`; no adapter setting promises zero retention beyond the provider's
applicable account policy. Claude receives a compatible reduced JSON Schema while
the server validates every original length, count and numeric constraint.

Reference: [Cloudflare rate limiter locality and accuracy](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Verification

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

## Unreleased experience routing — October 1 beta follow-up

Local changes now build one structured `experience_routing` brief for all three
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

This change only affects **Draft with AI**. Ordinary Create recommendations still
come from the published catalog. The remaining product work is to connect that
journey to verified local activities/events and route those facts into generation,
while keeping availability, booking costs and creative suggestions distinct.
No local provider search was added, no named venue facts are manufactured, and no
new TestFlight or Worker deployment has been made for this follow-up.

Verification: 624 unit tests and all 10 focused AI draft browser scenarios pass;
typecheck, lint and production build pass. Browser provider responses are mocked.
The iPhone 17 / iOS 26.4 Simulator build compiled, installed and launched with
production configuration. The native walkthrough did not reach the new form:
automated scroll/navigation remained on the welcome screen and Simulator control
was interrupted. Do not count the adult-option UI as Simulator-verified yet.
There are no database changes in this follow-up.
