# Capture, story review and private journal audit handoff

Date: 2026-09-30. Status: **uncommitted work in progress**. The user redirected the audit to a Claude handoff, so implementation and testing stopped. Nothing in this audit was committed, pushed or deployed. No cloud data was mutated and no database migration was added for this area.

## Scope and sources

This audit covered `ActiveQuest`, capture/edit controls, local drafts, private journal and share-link management. The useful Artec reference is editorial guidance around an opening, body and ending—not an unsupported reach/viral score. Reviewed primary sources:

- [Artec website](https://shareartec.com/): content scoring and coaching; brand deals explicitly described as coming soon.
- [Artec App Store listing](https://apps.apple.com/us/app/artec-ai-viral-predictor/id6751553903): description advertises draft feedback; its November 2025 release notes say view estimates were removed, despite older description copy still mentioning them. These are marketing descriptions, not independent validation of predictions.

The new Sidequest story check reads only existing clip edit metadata and the authored quest plan. It never sends or analyzes footage, predicts views, scores quality or changes rewards.

## Changed files in this audit

- `src/components/Capture.tsx`: preserve a selected end beyond absolute source second 15 when metadata loads; explicit selected-range preview; retain intentionally empty saved captions; include story-tip summary in keyboard focus traversal; canceling a replacement camera returns to the saved clip and its trim/framing/audio/label.
- `src/pages/ActiveQuest.tsx`: error/success feedback and disabled states for share, copy, revoke, export, abandon and delete; run-local React state keyed by route ID; load failure retry; integrate story review; clear stale share/export state after media deletion; new existing-public-link management described below.
- `src/pages/Journal.tsx`: search, All/In progress/Completed filters, empty-filter reset, resume cues and avoid presenting a failed load as an empty collection.
- `src/pages/journal-design.css`: scoped journal filter/search/resume styling.
- `src/lib/story-review.ts`: derives three editorial prompts, selected seconds, missing parts and notes about opening duration, missing labels, mute and portrait crop. Uses each quest's actual hook/actions.
- `src/components/StoryReview.tsx` and `src/components/story-review.css`: expandable “Shape your story” check with direct opening/attempt/ending edit actions; explicitly says it does not analyze video content.
- `src/lib/api.ts`: `shareLinks(runId)` client method, returning metadata or an empty array in demo mode.
- `worker/index.ts`: narrowly added authenticated `GET /api/quest-runs/:id/share-links` plus its auth-route allowlist entry. No unrelated worker endpoints intentionally changed.
- `tests/story-review.test.ts`: three model tests.
- `tests/media-actions-browser.spec.ts`: four new browser tests, with mixed real local upload and explicitly mocked hosted HTTP contracts.

Other agents edited other files in the shared worktree. Do not treat their changes as part of this ownership list or reset them.

## Confirmed defects addressed

1. A saved trim such as source seconds 10–18 was silently clamped to end 15 when reopened. Metadata now clamps only to source duration; the existing 5–15 second selection validation remains.
2. Clip editing lacked a way to play exactly the selected portion. “Preview selected…” seeks to start and pauses at the chosen end using video time updates.
3. After starting a replacement and canceling the camera, the previously uploaded clip is now available with its saved edit settings.
4. Public link copy/revoke and abandon previously allowed uncaught promise failures; they now display recoverable feedback. Media actions also expose loading/disabled states.
5. The journal could show an empty-state invitation alongside a failed fetch; that is now separated.
6. Public links outlived React state after a refresh, making prior links impossible to revoke in this UI. A metadata listing endpoint and revocation list have now been added, **but this last endpoint/UI addition has not yet been verified**.

## Public-link implementation: finish verification before release

The new endpoint first calls the existing `owned(c, "quest_runs", id)`, then queries `userDb` (RLS client) with both `run_id` and `owner_id`, active/nonexpired constraints, and descending creation date. It returns only `id`, `caption`, `createdAt`, `expiresAt`. It does not return token hashes, object keys or fabricated URLs.

The existing create endpoint computes the public token using an HMAC over the actor and original idempotency key; only the token hash is stored in `share_links`. This audit does not have the original request keys when listing links, so it intentionally does not pretend to recover copyable URLs. Newly created links retain Copy/Revoke in the current session. After refresh, “Manage public links” lists dates/captions and a Revoke action, and explains that a new link is needed if the original URL was lost.

Outstanding:

- Add focused worker tests for anonymous denial, cross-owner denial, owner-filter enforcement, expired/revoked exclusion, and no sensitive-field leakage.
- Verify the new list endpoint against the local database/RLS. Existing table/policies are reused; no schema changes were made.
- Verify list/revoke after refresh in the browser. Update the hosted HTTP fixtures in `tests/media-actions-browser.spec.ts` to serve `/api/quest-runs/:id/share-links`; those fixtures were written before the new listing request existed.
- Decide whether to bound/paginate the listing explicitly; it currently relies on the existing PostgREST row cap and has no explicit application pagination.
- Existing `shareLinks` is fetched for each hosted run, including runs with no completed reel. This is safe but could be deferred if desired.
- Rerun typecheck/lint after the last endpoint/UI changes. These last edits were formatted but not otherwise validated.

## Test evidence actually obtained

Passed focused unit command:

```sh
npx vitest run tests/story-review.test.ts tests/capture-session.test.ts tests/media-client.test.ts
```

Result: **3 files, 13 tests passed**. Covers accurate quest-specific guidance, selected-range duration, missing clips, metadata-derived notes, recording clock and existing media client rules.

Focused browser command that was interrupted:

```sh
npx playwright test tests/media-actions-browser.spec.ts tests/capture-drafts-browser.spec.ts --reporter=list --output=test-results/capture-audit
```

Four tests passed before interruption:

1. Local draft identity/run/slot isolation, expiration and sign-out cleanup.
2. Camera interruption finalizes paused footage into a restorable draft and releases tracks.
3. Denied camera permission preserves upload and dialog exit.
4. **New real local upload test**: upload a synthetic 21-second video; select 10–18; reopen without trim corruption; preview chosen range; cancel replacement camera and restore original; change portrait crop/mute/label; save and refresh; open story review and its edit/add actions. No page errors in this test.

The fifth test, “public link create/copy/revoke recovers from errors and media deletion is explicit,” stalled waiting for the first “Create a public link” button. The run was manually interrupted (exit 130) while that locator was waiting. It did **not** pass or reach later assertions. The output also contained `ENOENT` trace artifact errors because another concurrent suite removed the shared `test-results` tree. Root instructed using a distinct `.local/capture-audit-test-results` path in future. The cause of the missing button was not diagnosed before the user requested the handoff; inspect the hosted auth/module/API fixture rather than treating it as a confirmed application failure.

The final two tests in that command **did not run**:

- Abandon failure/success retry and clip retention.
- Journal load-error retry, search, filters, no-result reset and resume navigation.

One typecheck was run earlier: it failed only on then-in-progress `Series.tsx` variables owned by another agent. That is **not** evidence of a final passing typecheck. Root owns integrated typecheck, lint, full unit/browser suites and build.

The browser changes made afterward (run-state keying and public-link metadata listing) are unverified.

## Existing action coverage to preserve/re-run

`tests/browser.spec.ts` already exercises three real uploads → completion → actual MP4 render → download/FFprobe → private journal, camera permission/file fallback, empty file, focus trap, native-share cancellation, segmented Stop/Add take, saved draft/refresh and camera track release. `tests/community-browser.spec.ts` exercises Keep private, publication, edit/unpublish/privacy flows. `tests/capture-drafts-browser.spec.ts` covers interruption and denied-camera paths. Existing unit/worker tests cover validation, private downloads/ranges, renderer protocol and storage.

This audit has **not** verified every button on every device. Explicit remaining device/feature gaps include physical iPhone Safari camera/phone capture picker, camera switching with two physical cameras, device share-sheet delivery into TikTok/Instagram, every permission/track-loss/browser background edge, and all hosted public-link recovery paths. No external social posting occurred. Full live rendering was proven during earlier deployment work, not rerun by this audit.

## Process state at handoff

The only process started by this audit that was still running was Playwright exec session `21220` (npm PID `64627`, test runner PID `64658`, worker PID `64669`). It was interrupted with Ctrl-C and returned **exit 130**. No owned process remains running. Shared Vite/local renderer services were reused, not started or stopped by this audit. Do not kill other agents' test processes based on these old PIDs.

No commit, push, deployment, production account action, real public link creation or cloud mutation was performed.

## Resolution — 2026-09-30, later the same day

The open failures and unfinished checks in this note were resolved and re-run on the final integrated tree. See `docs/audit-verification-2026-09-30.md` for exact results and remaining gaps.
