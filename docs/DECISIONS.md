# Decisions

## Two intentionally separate local modes

`dev:demo` uses browser-local simulated profile/progress plus an actual disk-backed
FFmpeg adapter. `dev` uses the Cloudflare Vite plugin and real Supabase auth/API
contract. Missing credentials are errors; production never falls back to simulated
wallets or inventory. This keeps provider-free exploration useful without confusing
it with production verification.

## Streaming uploads through the Worker

Authenticated, bounded PUT requests create a reserved staging object exactly once.
The Worker copies it to an opaque immutable candidate **before** probing/hashing.
The renderer receives only server-controlled streams. This avoids presigned upload
overwrite races and additional browser-to-R2 signing credentials. A failed retake
does not replace the current validated generation.

## Postgres transaction/outbox ownership

Supabase Postgres owns all production application state. Service-only invoker RPCs
enforce wallet → run/redemption → offer lock ordering and permanent ledger event
uniqueness. The same transaction creates rendering intent. One queue and a scheduled
reconciler recover dispatch, leases, reservations and cleanup. No D1 or parallel
production media database is introduced.

## Reserved rewards and merchant consumption

Reservation immediately debits points and moves stock to reserved. Fulfillment
requires a scoped merchant consuming a signed token. Cancellation and expiry refund
the snapshotted price once. Reserving is never presented as actual merchant fulfillment.

## Curated recommendations first

The thirty authored variants are filtered before deterministic ranking. Imported
summaries remain reviewed text and do not weaken exclusions. Unparsed custom
boundaries stop suggestions with an explanation; no model silently interprets them.
AI is unnecessary for the core release.

## Single release owner

GitHub Actions owns checks and explicitly invoked deployments. Environment-specific
configuration must be generated from chosen account/resource destinations. Applying
migrations is a separately reviewed release action; frontend rollback cannot reverse
ledger transactions or deleted media.
