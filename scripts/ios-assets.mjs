import { mkdir, writeFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import {
  BRAND_COLORS,
  BRAND_MARK_PATH,
  BRAND_MARK_VIEWBOX,
} from "../shared/brand.mjs";

const assets = new URL("../ios/App/App/Assets.xcassets/", import.meta.url);
const icon = new URL("AppIcon.appiconset/", assets);
const launch = new URL("LaunchMark.imageset/", assets);
await mkdir(icon, { recursive: true });
await mkdir(launch, { recursive: true });
const mark = (color) =>
  `<svg viewBox="${BRAND_MARK_VIEWBOX}" x="164" y="154" width="696" height="716"><path fill="${color}" d="${BRAND_MARK_PATH}"/></svg>`;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BRAND_COLORS.violet}"/>${mark("white")}</svg>`;
await sharp(Buffer.from(iconSvg))
  .removeAlpha()
  .png()
  .toFile(fileURLToPath(new URL("AppIcon-512@2x.png", icon)));
await writeFile(
  new URL("Contents.json", icon),
  JSON.stringify(
    {
      images: [
        {
          filename: "AppIcon-512@2x.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
      ],
      info: { author: "xcode", version: 1 },
    },
    null,
    2,
  ) + "\n",
);
const launchSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">${mark(BRAND_COLORS.violet)}</svg>`;
for (const scale of [1, 2, 3]) {
  await sharp(Buffer.from(launchSvg))
    .resize(128 * scale, 128 * scale)
    .png()
    .toFile(fileURLToPath(new URL(`mark-${scale}x.png`, launch)));
}
await writeFile(
  new URL("Contents.json", launch),
  JSON.stringify(
    {
      images: [1, 2, 3].map((scale) => ({
        filename: `mark-${scale}x.png`,
        idiom: "universal",
        scale: `${scale}x`,
      })),
      info: { author: "xcode", version: 1 },
    },
    null,
    2,
  ) + "\n",
);
// Remove only the generated Capacitor template images.
await rm(new URL("Splash.imageset/", assets), { recursive: true, force: true });
console.log("Generated opaque App Store icon and Sidequest launch mark.");
