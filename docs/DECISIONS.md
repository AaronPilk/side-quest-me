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

Unknown survey answers now remain nullable, including participation role. Ambiguous
historical defaults are marked for review. Imported text is edited separately from
confirmed structured preferences; the manual review explicitly distinguishes
interests, usable skills, willingness, and firm boundaries. Confirmed ranking factors
produce their own explanations. See [the preference audit](PROFILES.md).

## Publication is separate from participation

Discover posts pin one finished reel and its accepted quest version. Creating a
reel, choosing a sharing preference, or generating an existing hosted share link
does not publish a post. Unpublishing leaves the private original intact. Public
creator identity is separate from the private account profile. Try this quest
checks the viewer's own outing and boundaries, then stores one separate attempt
with an immutable link to the inspiring post. Reviewed original quests use the
same eligibility system and retain separate authorship.

## Licensing existing videos with manual fulfillment

A creator-level opt-in and a per-video opt-in permit inquiries, not advertising
use. Approved businesses propose structured terms for one exact reel. Negotiation
preserves revisions; the other party accepts a specific version. Acceptance means
pending manual payment and permissions. A separate operator records evidence of
both before completion. Commercial access is limited to the approved brand during
the agreed period and can be suspended. Money and explicit per-deal platform fees
never enter XP or reward balances. There is no assumed fee rate or automatic paid
state. Funded quests remain a distinct pre-creation campaign path.

## Demonstration identities remain local

The demo persona selector operates on browser-only records and actual local fixture
media. Production mode has no persona switch or seeded community identity. SQL and
Worker tests independently enforce authorization, idempotency, and narrow DTOs;
browser demo success is not evidence of deployed cloud integration.

## Single release owner

GitHub Actions owns checks and explicitly invoked deployments. Environment-specific
configuration must be generated from chosen account/resource destinations. Applying
migrations is a separately reviewed release action; frontend rollback cannot reverse
ledger transactions or deleted media.
