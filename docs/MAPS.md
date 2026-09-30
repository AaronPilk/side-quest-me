# Places and nearby events

Create → an outside or venue setting → **Where should we go?** shows the area,
place search, and nearby events directly. It is no longer hidden behind a travel
accordion. The wizard does not ask for a travel price or a round-trip estimate.
Existing saved travel amounts remain visible in optional review details and can
be cleared explicitly; they are not silently discarded.

**Use my current area** requests browser location only after the user selects it,
even when Apple Maps has not been configured. Users can instead enter a town in
**Area** or choose **Use entered area instead** after granting location. A denied
location request leaves manual entry available. Location does not automatically
change the selected setting, budget, time, intensity, or group.

Apple Maps searches can preview real places and save a chosen meeting point. The
selected place appears in review, quest details, and the active quest with a Maps
link and directions for the chosen travel mode. Without a token, **Browse in
Apple Maps** still opens an area-aware search; the app says in-app search is not
connected and supplies no invented places. Failed lookups and searches can be
retried.

## Connect Apple Maps

**Current state: `APPLE_MAPS_TOKEN` is not configured.**

1. In Apple Developer → Certificates, Identifiers & Profiles → Services → Maps,
   create a **MapKit JS**, domain-restricted token using Apple's
   [token setup instructions](https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token).
   Authorize the development host and the actual deployed host you use, including
   `sidequest-me.aaron-9c3.workers.dev` when testing that selected production Worker.
   Set an appropriate expiry and record its renewal date.
2. For `npm run dev:demo`, add the token to ignored `.env.local`:

   ```dotenv
   APPLE_MAPS_TOKEN=YOUR_PUBLIC_DOMAIN_RESTRICTED_MAPKIT_JS_TOKEN
   ```

   For the ordinary local Worker (`npm run dev`), use ignored `.dev.vars` instead.
   Restart Vite and refresh the page after changing configuration.

3. To configure the selected production Worker, first confirm that
   `.local/wrangler.target.json` identifies Worker `sidequest-me` in the intended
   account. From the repository, run:

   ```sh
   cd "/Users/pilksclaes/Side Quest Me"
   npx wrangler secret put APPLE_MAPS_TOKEN --config .local/wrangler.target.json
   ```

   Paste the token only at Wrangler's prompt. This setup command has not been run
   as part of the local feature work.

4. Verify real search, map rendering, selection, refresh, and directions on an
   authorized host. `/api/maps/config` returns `{"token":null}` until configured;
   after configuration it intentionally returns only the browser Maps token.

MapKit JS tokens are public browser credentials. Never place an Apple `.p8`
private key or Supabase secret in this variable. The SDK uses Apple's official
[`@apple/mapkit-loader`](https://developer.apple.com/documentation/mapkitjs/loading-the-latest-version-of-mapkit-js),
and the existing Apple attribution stays visible.

## Connect nearby event listings

**Current state: `TICKETMASTER_API_KEY` is not configured.** The app displays an
explicit unavailable state and offers external event browsing. Unconfigured
providers do not return pretend events or generated venue inventory.

The implemented server integration uses
[Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/),
requesting its Ticketmaster, Universe, and Front Gate sources. It can search the
next 24 hours, 7 days, or 30 days. GPS searches use an approximate five-character
geohash with a 25-mile radius; manual searches use the entered town. Up to twelve
validated event cards show the source, local date/time when known, venue, and
indicative ticket price. It is a bounded list from these sources, not a complete
scan of every event in an area.

1. [Create a Ticketmaster developer account](https://developer-account.ticketmaster.com/user/register)
   and obtain a Discovery API key. The official
   [getting-started guide](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/)
   describes account access and API quotas.
2. For local demo mode, put `TICKETMASTER_API_KEY` in ignored `.env.local`. For the
   ordinary local Worker, put it in ignored `.dev.vars`. Restart the server.
   Keep it server-side: do not use a `VITE_` variable or paste it into browser code.
3. For the already selected production target, use the hidden Wrangler prompt:

   ```sh
   cd "/Users/pilksclaes/Side Quest Me"
   npx wrangler secret put TICKETMASTER_API_KEY --config .local/wrangler.target.json
   ```

   Confirm the target file still names `sidequest-me` in the intended account
   before running it. Paste only the raw API key when prompted; no key belongs in
   shell arguments, source control, or chat. This command has not been run during
   this local pass.

4. `/api/events/config` should report `{"configured":true}` without returning the
   key. Test **Find nearby events** with a known town and the selected date window.
   Confirm provider results, dates, links, and unavailable/error behavior with
   the real key before describing the integration as live.

Eventbrite is an **external browse link only**. Its general public event-search
API was shut down; this implementation does not claim to scan it or bypass that
restriction. See Eventbrite's official
[deprecated event-search documentation](https://www.eventbrite.com/platform/new/api#event-search).
External Eventbrite browsing uses the entered area; when only GPS was selected,
the user can enter a town to narrow that external search. Additional event
providers require a supported feed and a separate integration.

## Accuracy and privacy

Known event timestamps are filtered using actual instants, so an event tonight
in a venue's timezone is not accidentally removed because UTC has crossed
midnight. Date-only listings use the provider's requested date window; an unknown
start time remains unknown. Canceled, postponed, undated, malformed, duplicate,
and unsupported-link results are excluded. Prices are per-ticket indications,
may exclude fees, and do not establish a confirmed group cost.

Event cards and place selection do not prove ticket availability, admission
cost, filming permission, adult eligibility, travel time, or completed
arrangements. Events currently help users browse possible plans; selecting an
external listing does not silently convert it into a quest or revise their
answers. The current outing inputs and firm profile boundaries remain
responsible for quest eligibility.

Only the durable **Apple Place ID** is saved in the private outing and accepted
run. Name, address, and map coordinates are looked up for display; Apple's
[Place ID documentation](https://developer.apple.com/documentation/mapkit/identifying-unique-locations-with-place-ids)
explains the identifier. The selected search location is held in memory and sent
only for requested searches: Apple receives the location for nearby Maps search;
the app's event endpoint converts it to an approximate geohash before contacting
Ticketmaster. It is not written to the profile or event history. A saved manual
area remains the user's own input, and public posts do not automatically expose
the selected place.

Provider requests have deadlines, bounded responses, fixed upstream hosts, and
validated HTTPS event links. The server rate limiter protects the live event
endpoint. Raw provider errors and API keys are not returned to the browser.

Place IDs can support future verified venue offers. No paid placement, venue
subscription, referral earnings, or new billing is enabled by this feature.
Existing funded campaigns still need approval and disclosure and cannot override
ordinary eligibility or personal boundaries.

## Verification and remaining setup

Unit and browser tests cover missing configuration, current location without
MapKit configuration, denied location, manual fallback, retry and stale-response
handling, safe external URLs, ID-only place persistence, and unchanged outing
answers. Event tests cover server-key redaction, approximate geohash requests,
bounded date windows/responses, unsafe/canceled listings, venue-local midnight,
exact timestamp edges, and unknown times. Configured tests use explicit SDK and
provider fixtures rather than claiming live inventory.

Both provider credentials remain to be supplied. Live Apple authorization and
real map rendering, real Ticketmaster discovery, and device directions still need
verification after configuration.
