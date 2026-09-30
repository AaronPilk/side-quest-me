# Creator experience and Quest Series

The September 29 product handoff is implemented in the existing app. All changes
remain local. The demonstration uses isolated browser personas and explicitly
labeled fixture media; configured mode uses authenticated Worker endpoints,
PostgreSQL transactions, and private R2 storage.

## Navigation and profiles

Create, Discover, Rewards, Activity, and Profile are the five primary destinations
on mobile and desktop. Settings contains the local-only Demo tools. Business
workspace owns business setup and video licensing management; Admin owns approvals,
moderation, and fulfillment verification. `/studio` remains a compatibility route
that selects the appropriate workspace from the authenticated account's roles.
Backend permission checks remain authoritative.

Public profiles support a photo, display name, unique case-normalized @username,
bio, availability for brand offers, and persisted follow relationships. Existing
profiles without a username or photo remain valid. Counts use actual published
videos and follow records. Blocking removes the relationship in both directions;
unblocking does not silently restore it.

Photos are resized to 256×256 PNG before upload. The Worker checks a bounded PNG
and removes metadata before storing a new object. Only the current photo is served
through a public endpoint; storage keys never appear in public profile responses.
Replacing/removing a photo or deleting an account queues the old object for
scheduled cleanup. An orphan sweep handles interrupted uploads.

Videos uses three portrait columns with actual reel covers. Opening a reel preserves
its author, original quest, source Series part, and Try this quest action. Close
returns to the source profile. Quests shows approved authored quests; Series shows
published collections. The owner's Private tab contains their drafts and journal.
Public responses exclude private preferences, imported text, drafts, journal
entries, payment records, and another person's progress. Authentication changes
discard the previously loaded account's page state.

## Rewards and money

Earnings is derived from the creator's existing exact-video licensing records.
Each offer ID contributes once, using the latest recorded version. Paid earnings
requires a completed deal with frozen accepted terms and recorded payment and
permission references. Accepted terms awaiting manual fulfillment remain pending.
Proposals and counters appear in Brand offers and do not contribute to either
total. History links to the original agreement and its audit details.

These are recorded payments, not a withdrawable wallet. The app has no automatic
transfer or payout controls. The agreed platform fee is displayed separately;
the app does not invent a net payout calculation. Perks retains quest points,
reward inventory, and truthful demo availability. Points do not convert to cash.

## Authoring a Series

Create → Start a series opens the authoring flow. A Series has a stable ID, title,
premise, selectable cover, author, finite/ongoing type, and ordered parts. Each part
references a published, reviewed quest version and stores that version's content.
Original quests still need approval through the existing review process first.

Drafts can be reordered and edited. A prerequisite must reference an earlier part
and explain why it is needed. Independent parts remain independently available.
A finite Series publishes all its planned parts; an ongoing Series can publish
one or more parts and add later parts as drafts. Previously published parts keep
their identity, order, title, quest version, and prerequisite rule. A changed or
withdrawn underlying quest version becomes unavailable with an explanation.
It does not silently change an already authored part or accepted attempt.

The owner can take a Series or part back to draft to stop new starts. Existing
attempts retain their accepted snapshots. Republishing an already published part
does not generate another new-part notification. Version checks prevent concurrent
editors from overwriting each other's changes.

## Participation and publication

Starting a part opens the existing guided Create flow with its quest and source
part. The participant supplies their own time, budget, group, setting, and necessary
permissions. Existing hard boundaries and eligibility checks still apply. The
server verifies the source part, exact quest version, and any prerequisite before
stamping the immutable run snapshot. An alternative quest is a standalone attempt.

Progress is derived only from that participant's finalized runs linked to the
Series. Watching, following, accepting, or publishing does not complete a part.
Pending review remains unfinished and can be reopened. Refresh restores the active
attempt or next available incomplete part. A finite Series can be complete; an
ongoing Series can be caught up until another part is published. Later parts do
not erase earlier completions.

Capture, rendering, journal storage, and publication use the existing run model.
Every video requires its own explicit publication action. Public episode cards
identify the Series and part, link to the full Series, and provide previous/next
part navigation. Public DTOs never include participant progress or outing details.

Following persists and adds newly published parts to Activity. Blocking or account
deactivation removes affected follows. Account deletion redacts the author's Series
and part text, frozen source content, and saved mutation responses, while retaining
stable identities and other participants' accepted attempts. Rewards retain the existing daily cap,
family cooldown, immutable ledger, and retry protection. There is no Series bonus.
Licensing covers only the exact agreed video and frozen asset; other or future
parts require their own agreement.

## Data and configuration

Two additive migrations introduce social identities/follows/photo cleanup and
authored Series/parts/follows. Both use RLS, deny browser table/RPC privileges,
and expose narrow service-only functions. The existing profile, quest run,
publication, licensing, media, and reward records remain the source of truth.
Local database tests reconstruct every migration and exercise real transactions,
permissions, completion retries, source snapshots, and private/public responses.

No extra provider is needed for these features. A live environment still needs
the dedicated Supabase project and existing Cloudflare R2/Queue/Container setup
described in the README. Apple Maps requires its domain-restricted MapKit JS token;
current automated map tests use an explicit fixture. Automated profile parsing and
real payment transfers remain unconfigured. See BUILD_STATUS.md for measured
verification and staging limitations.
