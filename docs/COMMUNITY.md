# Creator posts and manual video licensing

The additive community migration keeps private journals, uploaded sources, reward ledgers, campaigns, and historical accepted quests separate from publication. Nothing migrates an existing reel or share link into a public post. The existing unknown-role migration remains in place.

The [creator and Series guide](CREATOR_SERIES.md) describes the current five-tab
navigation, social photos/usernames/follows, Earnings, and authored Series added
on top of this contract. Creator licensing requests live in Rewards → Brand offers;
business operations use `/business`, staff review uses `/admin`, and `/studio`
redirects according to the signed-in account's authorized workspace.

## Shared API contract

`shared/community.ts` is the canonical TypeScript/Zod contract. All mutation inputs are strict objects, identifiers are UUIDs, mutable records require their `expectedVersion`, and the Worker hashes `{action,input}` with a caller-retained idempotency key. New creator/business/draft records use version zero in the request; stored records begin at one. Business approval is derived from the stored, operator-reviewed business profile. Operators come from the existing private membership table, never user metadata.

The Worker verifies the current user/session and invokes these service-only, invoker RPCs:

- `sq_community_read(p_actor uuid|null,p_view text,p_input jsonb)` returns deliberate DTOs. Only `feed`, `post`, and `creator` permit an anonymous actor. Other views are `me`, `activity`, `offers`, `offer`, `draft`, `brand`, and `operator`.
- `sq_community_mutate(p_actor uuid,p_action text,p_input jsonb,p_key text,p_hash text)` enforces ownership, current authorization, state transitions, concurrency, and idempotency in one transaction.
- `sq_community_media(p_actor uuid|null,p_post uuid|null,p_offer uuid|null)` returns an internal R2 authorization descriptor for exactly one public post or completed licensing offer. The Worker consumes this descriptor; it must never return its object keys as a public JSON response.

Read inputs are `{id?,templateId?,brandOnly?,limit?,before?}`. Detail views use `id`. Feed filtering by `templateId` refers to the exact underlying template version; pagination uses descending creation time, at most fifty posts per request. `me.publications` privately maps the caller's run IDs to their post IDs, allowing an existing publication to be managed after a later private render without silently replacing the licensed video.

Mutations return direct DTOs: creator actions return `CreatorProfile`, post actions return `CommunityPost`, draft actions return `OriginalDraft`, business actions return `BusinessProfile`, and offer actions return `LicenseOffer`. Activity marking and blocking return `{ok:true}`; reporting returns its stored report ID.

| Actions                                      | Purpose                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `creator_save`                               | Edit a separate public name, generated-avatar palette, bio, and brand availability.                                     |
| `post_publish`, `post_update`                | Explicitly publish a finished reel; edit caption/inquiry opt-in or unpublish.                                           |
| `draft_save`, `draft_submit`, `draft_review` | Draft an original quest, submit it, and record an independent operator decision.                                        |
| `brand_save`, `brand_review`                 | Submit private business contact details and require operator approval. Editing identity returns the profile to pending. |
| `offer_create`, `offer_respond`              | Propose, counter, accept, decline, or withdraw exact-video usage terms.                                                 |
| `offer_fulfill`                              | Independently record manual payment and permission evidence against mutually accepted terms.                            |
| `activity_read`, `report`, `block`           | Read/unread state, scoped reporting, and blocking.                                                                      |
| `post_moderate`, `offer_moderate`            | Remove a post or suspend a commercial request while retaining its history.                                              |

## Publication and personal attempts

A post pins one sealed, ready reel asset, its owning finalized run, and the run's accepted template/version. Its public DTO contains only that reel's stream URL, public creator identity/photo URL, caption, accepted quest instructions, optional author and Series-part attribution, public counts, and a frozen sponsorship disclosure. It excludes email, imported summaries, private survey answers, precise outing/location/budget, participant progress, raw clip metadata, and R2 object keys. Public creator profiles are separate from the private account profile. Profile photos use normalized, app-owned storage; there is no arbitrary remote avatar fetch.

A public post stream requires current publication, an active creator, and a sealed reel. Owners retain their unpublished post metadata and should use the private journal for playback and managing the private original. The backend also permits an authenticated owner to fetch that unpublished reel; unauthenticated public playback is unavailable. Source-clip IDs never authorize a community stream. Unpublishing removes discovery/playback without deleting the private original. An operator-removed post cannot be re-published through an owner update. Existing external copies cannot be withdrawn by an application state change.

`originalQuestIdentity` encodes all sixteen UUID hex symbols bijectively into letters, producing an ID accepted by the existing quest schema. Drafts use the full quest schema. The database canonicalizes the identity, strips user-supplied sponsorship, and fixes awards/cooldown to existing intensity policy. An independent operator must approve a submitted draft before it creates a published immutable template and author relation. Later attempts reference that template rather than making copies of the quest. Approved drafts cannot be silently edited into a new quest version.

The existing `sq_accept_run` accepts an optional `inspired_by_post`. It checks publication, blocking, and exact template/version before inserting a separate run, immutable inspiration relation, and one activity event. The Worker must first apply the viewer's own outing filters and profile boundaries. No source outing, permission, evidence, budget, or eligibility is inherited. Idempotency replays return the same run and never duplicate the attribution or notification.

## Licensing and fulfillment

New requests require both creator-level brand availability and per-post opt-in, a published reel, an approved business, and no block between the parties. Publishing alone never supplies advertising permission. Terms explicitly record payment minor units, USD currency, brand advertising channels, start date, usage duration, editing permission, a bounded message, and an agreed platform fee in minor units. The API requires the fee as input; there is no production fee default. These permissions do not grant access to the creator's social account.

Each proposal/counter has an immutable revision with its proposer. Only the other party can accept the latest revision. Acceptance records the exact terms, accepting actor, and time and moves to `pending_fulfillment`; it does not record a payment, increase rewards, or unlock a commercial download. Stale versions are rejected, and one open offer per brand/post prevents duplicate pending negotiations.

A separate operator, who is neither party to the deal, records a payment reference and a permission/release reference with explicit confirmation of both. The immutable fulfillment row derives its UTC start/end from accepted terms. Only then does the state become `completed`. Commercial access requires the requesting brand to remain approved, the offer not to be suspended, the creator/account and exact reel to remain available, and the current time to be within the agreed usage period. Unpublishing a social post does not rewrite a completed licensing agreement. Asset deletion or account removal prevents further asset delivery.

Operator suspension retains accepted terms, payment evidence, and history while disabling negotiation, fulfillment, and commercial media access. Fees and payments here are manual records; there is no checkout, escrow, payout, automatic payment verification, or claimed completed platform revenue. Existing funded quest campaigns and reward balances are untouched.

## Access, cleanup, and local verification

Every new table has RLS enabled and all browser/public table privileges revoked. Only service-role RPCs produce public or party-scoped DTOs. Private helpers have empty search paths and service-only execute grants. Mutable actions serialize each actor and lock the target row; version checks reject stale changes. Offer revisions, fulfillment records, accepted terms, asset identities, and inspiration links are immutable. Blocks suppress authenticated feed visibility, new requests, and cross-party activity; they do not promise to hide an otherwise public post from anonymous visitors.

Account deletion immediately removes posts from discovery, blanks creator text, unpublishes authored templates, clears original draft content, disables business/offer access, and removes the account's activity and reports. Economic agreement/fulfillment facts remain available only to appropriate counterparties/operators. The existing media cleanup and deletion recovery remain responsible for deleting physical R2 objects.

Run `node scripts/db-test.mjs --advisors --generate-types` for an isolated PostgreSQL reconstruction, generated API types, security advisors, and actual concurrent SQL/RLS/state-transition tests. `tests/database/community-invariants.mjs` exercises private completion, publication/privacy, ownership, inspiration, draft review, business approval, duplicate/stale negotiation, immutable acceptance, manual fulfillment, commercial authorization, blocking/reporting/moderation, and account deletion alongside the previous reward/media tests. This local run uses SQL fixtures for media metadata; real decoding/rendering remains verified by the separate renderer/browser checks.

No cloud resource or remote database is changed by these commands. A future live pilot still needs explicitly selected Supabase/Cloudflare resources, email/session configuration, the migration applied to that selected project, verified operator accounts, approved business identities, and a documented process for real agreements/payment evidence and explicit fees.
