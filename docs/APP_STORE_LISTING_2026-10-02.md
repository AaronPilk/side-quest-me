# Sidequest App Store listing — October 2, 2026

**October 3 checkpoint:** Build **1.0.0 (12)** is now selected in the Apple draft.
The listing copy remains saved; six feature images still need authentic native
captures. The revised capture order/configuration and remaining requirements are
in [current preparation](APP_STORE_PREPARATION_2026-10-03.md). The production
policy URLs are live. Public support contact and final owner declarations remain
pending; no App Review submission has been sent. Older build-10 references below
describe the original copy preparation.

Prepared for the current **1.0.0 (10)** iPhone app. The English listing text and categories below are saved in App Store Connect; the screenshot storyboard remains a capture plan. Saving metadata is not submission or Apple approval. The lead message is real experiences worth doing and filming. Social discovery supports that experience; brand licensing is a secondary opportunity.

## Ready-to-paste English listing

**Name:** Sidequest Me

**Subtitle:** Real adventures. Your story.

**Promotional text:**

Turn “what should we do?” into a story worth telling. Find a quest for your people, film the adventure, and keep it private or share it your way.

**Description:**

The best stories start when you do something different.

Sidequest helps you turn spare time into a real adventure: a spontaneous night out, a challenge with friends, a date with a twist, or a new experience you’ll want to remember.

MAKE THE PLAN YOURS
Tell Sidequest who’s coming, how much time you have, your budget, and the energy you want. Choose Chill, Bold, or Full Send. Add your interests and preferences to help shape the ideas you receive.

FIND YOUR NEXT DETOUR
Get AI-powered quest ideas built around your outing. Explore nearby places, review the activity and its requirements, and pick the experience that feels right for your group. Find another experience when you want a different direction.

FILM AS YOU GO
Hold to record, release to pause, and keep adding moments to the same video. Bring in footage from your gallery, use the timer or on-screen prompt, and swipe up for your quest instructions. Save your finished video with Sidequest branding.

LET A STORY BECOME A SERIES
Some adventures deserve another chapter. Turn a quest you’ve filmed into a series, create the next part, and decide when each part is ready to share.

KEEP IT PRIVATE. SHARE WHEN YOU’RE READY.
Your private journal keeps your quests and finished videos together. Pick up an open quest without starting over. Choose which stories to publish, discover other creators’ adventures, and follow the stories you want to see next.

YOUR VIDEO. YOUR DECISION.
If you’re interested in working with brands, you can choose to make a published video open to inquiries. Review the specific usage and payment terms before agreeing. Publishing a story never automatically grants a brand permission to use it.

Go make a story worth telling.

**Keywords:**

adventure,challenge,friends,date,spontaneous,activities,video,creator,journal,series,nearby,story

**Primary category:** Lifestyle

**Secondary category:** Social Networking

Lifestyle leads because the core job is choosing and doing a real-world activity. Social Networking reflects the published video feed, profiles, follows, and episode discovery. This does not present the app as a competitive game, a travel-booking service, or a paid creator marketplace.

## Screenshot sequence

Use six portraits. Each image should have one concise headline, one short supporting line, and one large authentic iPhone screen. The first two should explain the app before the viewer reads the description.

| Order | Headline | Supporting line | Actual screen to capture |
| --- | --- | --- | --- |
| 1 | **Make tonight a story.** | A real adventure for your people. | A successful quest result with a concrete, coherent title and description. The budget/time/category must agree with the saved outing. Avoid an AI-fallback error banner for this hero. |
| 2 | **Your people. Your pace.** | Choose the time, budget, and energy. | A clear Create screen showing an implemented choice, preferably the budget slider or Chill / Bold / Full Send. A subtle cropped second real screen can show time choices if both remain legible. |
| 3 | **Find your next detour.** | Explore real places around you. | Native nearby-place search with actual Apple Maps results and a selected place. Capture a neutral public location; do not expose a home address or precise personal location. Do not label the venue open, available, free, or booked without verified evidence. |
| 4 | **Film it as it happens.** | Record. Pause. Keep the story going. | The current full-screen camera with duration choices, record control, gallery, timer, prompt, and Quest instructions affordance. Use an authentic camera preview or real imported-video state; do not paint a working preview over a broken camera. |
| 5 | **Keep the story going.** | Turn a filmed quest into a series. | A populated series page with an actual completed Part 1 and the implemented Create Part 2 action. Use recorded app state; do not invent episode counts, published parts, or follower totals. |
| 6 | **Your stories. Your choice.** | Keep a private journal. Share when ready. | The private journal or own-profile Private tab with real retained quest entries. Capture the current journal-only layout. A small real Discover or finished-story panel may illustrate optional sharing, without mixing private state into the public view. |

If a camera-preview capture cannot be obtained, use the genuine finished-video preview for image 4 and change its headline to **Bring the adventure to life.** and supporting line to **Capture or upload your story.** Do not imply a hardware check that has not happened.

## Visual production direction

- Use the approved Sidequest S-route mark and wordmark. The icon remains the white mark on violet; do not generate a replacement logo.
- Make the canvas cool white or very pale lavender, with charcoal text and **#7950E8** accents. Keep violet strongest on the first image. Avoid tan backgrounds, cartoon scenery, stickers, confetti, fantasy imagery, or dense decorative glass layers.
- Use clean system typography with a strong headline, short body line, generous margins, and consistent alignment. One clear app screen should dominate each image. Keep the UI large enough to read on a phone.
- Preserve real screen content and controls. Crop uniformly, and use the same restrained phone frame throughout if a frame is used. Marketing typography sits outside the app screen.
- Lead with the quest and human experience. Do not lead with payments, empty earnings cards, settings, onboarding questionnaires, or technical AI terminology.
- Do not put the words Instagram, Meta, TikTok, ChatGPT, or a competitor’s brand in the image headlines. The reference is the level of polish, not a copied identity.
- Do not include simulator chrome, debug panels, test credentials, production secrets, a synthetic test-pattern reel, misleading social counts, or demo fixture footage presented as real creator content.

## Product accuracy and submission handoff

The copy above reflects the implemented guided outing, configured AI discovery, native nearby-place search, continuous capture, gallery import, finished video export, private journal, publication/follows, and series that grow from a filmed quest. Build 10’s open-quest shortcuts and journal-only Private tab are included.

Do not add claims of live concert/event inventory, Eventbrite ingestion, bookings, guaranteed venue availability, automated preference extraction, automatic payouts, a withdrawable wallet, viral prediction, advanced editing, or guaranteed originality. Live event inventory is not configured; payment and permission verification remain manual. AI-generated experiences do not award quest points, so listing copy deliberately makes no universal points or crown promise.

Native in-app place search requires iOS 18 or later. Earlier supported systems retain manual area entry and external Apple Maps browsing. The listing should not imply that every feature has identical support across every installation target.

Before pasting the final listing, use the actual App Store Connect name availability, approved age-rating answers, support/privacy URLs, and screenshot size requirements. The submission owner must also supply truthful App Privacy answers and reviewer access. This document does not invent those values.

### Local evidence reviewed

- `src/pages/Quest.tsx`, `src/components/QuestWizard.tsx`, and `docs/AI_SETUP.md`: guided outing and generation/fallback boundaries.
- `src/components/Capture.tsx` and `renderer/overlays.mjs`: hold/pause capture, timer, prompt, photo/gallery controls, and branded video rendering.
- `src/pages/Discover.tsx`, `src/pages/Creator.tsx`, and `src/pages/Journal.tsx`: publication, profiles, follows, and private journal.
- `docs/CREATOR_SERIES.md`: filmed-quest-to-series flow, later parts, and explicit publication.
- `docs/BETA_FEEDBACK_BUILD_10_RELEASE.md`: final build 10 UI, native verification, and delivery.
- `docs/MAPS.md`: native location/search support and unavailable live-event inventory.
- `docs/BRAND.md`, owner-supplied `sidequest-brand-spec.json`, and `docs/ARTWORK.md`: approved violet identity and premium photographic direction.

Some older design/media documents retain earlier navigation or three-part capture history. Current source and the build 10 release record take precedence for screenshots and feature wording.

## App Store Connect preparation record

On October 2, 2026, the following updates returned HTTP 200 and passed exact independent GET readback for app `6817917086`, editable iOS version `1.0` (`07c31559-9097-43fb-9d6f-2744374be7aa`), locale `en-US`:

- App subtitle: **Real adventures. Your story.** Existing app name **Sidequest Me** was preserved.
- Version description, keywords, and promotional text: the exact ready-to-paste English copy above.
- Privacy policy URL: `https://sidequest-me.aaron-9c3.workers.dev/privacy`.
- Support URL: `https://sidequest-me.aaron-9c3.workers.dev/support`.
- Categories: **Lifestyle** primary, **Social Networking** secondary.

The new public privacy/support routes still require production deployment and HTTP/content verification before submission. This preparation did not bind a build, submit a review, publish the app, fill App Privacy or age-rating answers, change pricing, or invent contact/copyright details. Local evidence is `.local/app-store-metadata/verification.json` and the paired request/readback JSON files.

Primary Apple API schemas were checked through their DocC JSON: [app info localization updates](https://developer.apple.com/documentation/appstoreconnectapi/appinfolocalizationupdaterequest), [version localization updates](https://developer.apple.com/documentation/appstoreconnectapi/appstoreversionlocalizationupdaterequest), and [app category relationships](https://developer.apple.com/documentation/appstoreconnectapi/appinfoupdaterequest).

The reusable local delivery helper is `.local/app-store-screenshot-upload.mjs`. It defaults to validation only, with no Apple request. Once final native captures have been composed and visually checked, give it the generated `artwork-manifest.json` and add `--upload`. It reserves the screenshot set/assets, follows Apple's exact byte-range upload instructions without exposing signed URLs, commits each original-file MD5, verifies processing reaches COMPLETE, saves a resumable local checkpoint, and verifies final image order. It never binds a build or submits review. The target is Apple's `APP_IPHONE_67` API group; the [current largest-iPhone specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) accept **1320 × 2868** opaque portraits.

Delivery follows Apple's [official asset upload workflow](https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect) and [screenshot ordering endpoint](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appscreenshotsets-_id_-relationships-appscreenshots). No final screenshot upload was performed during metadata preparation.

Later on October 2, launch pricing and availability were saved and independently read back: **free ($0.00)** with **USA** as the price base territory, **United States only** initially, and automatic availability in new territories **off**. All 175 territory records were checked; 174 remain unavailable. This initial launch scope matches the app’s current USD outing costs and is recorded as a launch assumption, not a permanent territory restriction. Evidence is `.local/app-store-metadata/launch-price-availability-verification.json`. No agreements, legal declarations, financial accounts, build binding, or review submission were changed in that step. The request schemas were checked against Apple’s [price schedule creation](https://developer.apple.com/documentation/appstoreconnectapi/apppriceschedulecreaterequest) and [app availability creation](https://developer.apple.com/documentation/appstoreconnectapi/appavailabilityv2createrequest) documentation.
