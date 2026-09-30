# Sidequest brand

The selected direction is **03 / Violet**, supplied by the owner in
`sidequest-brand-spec.json` and `sidequest-violet-brand-sheet.png` on 2026-09-30.

| Role       | Color     |
| ---------- | --------- |
| Violet     | `#7950E8` |
| Charcoal   | `#171A22` |
| Warm white | `#F7F6F2` |

The application uses a violet S-route arrow beside the charcoal Sidequest name,
with a warm-white canvas. App icons reverse the mark to white on violet.
Supporting tones cover hover, selection, focus and dark-camera states. Success,
warning, error and quest-category artwork retain their distinct meanings.

## Source and assets

The supplied PNG is a presentation reference, not a vector master. The scalable
path in `shared/brand.mjs` is a reconstructed web rendition of that reference;
the header uses the application's native bold system-font wordmark. Replace the
path or wordmark with an approved vector master when one is available.

`src/components/BrandMark.tsx` and `scripts/brand-assets.mjs` share the same path.
Regenerate the committed browser assets with:

```sh
node scripts/brand-assets.mjs
```

Outputs include the transparent violet mark, SVG favicon, 192/512 px app icons,
180 px Apple touch icon, and a separate 512 px maskable icon with extra padding.
The manifest declares maskable and ordinary icons separately. Icon URLs carry a
brand version query to refresh cached browser references.

CSS tokens live in `src/styles.css`. The standalone share page and FFmpeg title
overlays carry the same palette. White primary-button text measures 5.09:1
contrast; violet links on warm white measure 4.71:1. Dark surfaces use lighter
lavender instead of the primary violet for small text.

## Verification

The branding pass passed typecheck, lint, 278 unit tests, the production build,
three responsive/navigation browser scenarios (320–1440 px and 200% text), and
the real video-render fixture. Mobile Create, Profile and Rewards screens were
also visually inspected. This change does not require a database migration or
provider credentials.
