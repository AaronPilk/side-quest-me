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
The existing server key has been configured only in ignored local `.dev.vars`
(mode 0600), and model access was verified against OpenAI. This is API billing,
not pooled ChatGPT subscription usage. No Cloudflare deployment, production secret
change, GitHub push or TestFlight upload is part of this activation.

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

The local Worker reports OpenAI / GPT-6 Astra as configured. This readiness flag
checks AI bindings only: this checkout still lacks local Supabase credentials, so
live authenticated app/API and physical-phone verification remain release checks.
The live evaluation uses synthetic data and calls the same generator directly.
The production Worker
still needs its own server secret and reviewed release before the installed
production iPhone app can use this implementation.

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

3. Before the authorized production release, add `OPENAI_API_KEY` as a **Secret**
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

The four scenarios cover Full Send for two outdoors, a free solo home activity,
a short outing with per-person budget/travel, and the previously nonsensical
“first time you laughed together” premise. Reports go only to ignored
`.local/ai-eval/`, with model, synthetic inputs, proposed concepts, quest, critique,
usage and latency. They exclude credentials and upstream error bodies. Each
scenario makes no more than three calls; there are no automatic retries.

See `docs/OPENAI_QUALITY_CHECK_2026-10-01.md` for this activation’s measured results
and remaining native/production checks.
