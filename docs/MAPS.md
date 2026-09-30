# Apple Maps

Create → an outside or venue setting → travel → **Choose an area or place** now
supports searching Apple Maps, previewing real places, and choosing a place for
the outing. The selected place appears in review, quest details, and the active
quest, with an Apple Maps link and directions for the chosen travel mode.

Search is optional. Without configuration, the app clearly says in-app search is
unavailable and offers **Browse in Apple Maps**; it never supplies invented places.
Search and place-detail failures have retry controls. Manual area entry still works.
**Use my current area** requests browser location only after the user selects it.

## Connect Apple Maps

1. In Apple Developer → Certificates, Identifiers & Profiles → Services → Maps,
   create a **MapKit JS**, domain-restricted token. Follow Apple's
   [token setup instructions](https://developer.apple.com/documentation/mapkitjs/creating-a-maps-token).
   Authorize the development host you will use and, later, the selected deployed
   host. Set an appropriate expiry and keep track of renewal.
2. For `npm run dev:demo`, add this to ignored `.env.local`:

   ```dotenv
   APPLE_MAPS_TOKEN=YOUR_PUBLIC_DOMAIN_RESTRICTED_MAPKIT_JS_TOKEN
   ```

   Restart Vite and refresh the page to replace any cached SDK instance. For the
   ordinary local Worker (`npm run dev`), set the same
   variable in ignored `.dev.vars`. For a future deployment, configure
   `APPLE_MAPS_TOKEN` on the selected Worker; this pass changes no remote resources.

3. Open Create, select outside or a venue, and search for a real place. Verify the
   map, result selection, acceptance/refresh, and Apple Maps directions on the
   authorized host. Missing configuration is available at `/api/maps/config` as
   `{"token":null}`; that endpoint intentionally returns only this public token.

MapKit JS tokens are visible to browsers. Never enter an Apple `.p8` private key or
Supabase secret here. The SDK loads only when a place panel is opened, using Apple's
official [`@apple/mapkit-loader`](https://developer.apple.com/documentation/mapkitjs/loading-the-latest-version-of-mapkit-js).
The asset CSP permits the required Apple SDK, map services, and workers. Existing
Apple attribution remains visible.

## What affects a quest

The selected place anchors the outing in a real location and supplies directions.
It does not establish availability, admission prices, filming permission, adult
eligibility, travel estimates, or completed arrangements. The user's current
setting, budget, time, and group answers remain authoritative for eligibility.
Changing/removing a place clears the associated venue cost and confirmations.
Changing setting clears the selected place and irrelevant travel/venue context.

Only the durable **Apple Place ID** is saved in the private outing and accepted
run. Name, address, and coordinates are looked up afresh and held in memory;
Apple explicitly permits storing [Place IDs](https://developer.apple.com/documentation/mapkit/identifying-unique-locations-with-place-ids).
The nearby-search GPS coordinate stays in memory. A saved manual area remains the
user's own input. Public posts do not automatically expose the selected place.

Place IDs provide a future way to associate verified venues with appropriate
business offers. No paid placement, venue subscription, or new billing is enabled
in this pass. Existing funded campaigns still require approval and disclosure and
cannot override ordinary eligibility or personal boundaries.

## Verification and remaining setup

Unit and browser tests exercise missing configuration, loader/search/lookup retry,
stale responses, location denial, permission clearing, ID-only persistence through
review/acceptance/refresh, and safe Maps URLs. Configured browser scenarios use an
explicit SDK fixture, not live Apple results. A real Apple token is not configured
locally, so live Apple authorization, real map rendering, and device directions
remain to be verified after that setup.
