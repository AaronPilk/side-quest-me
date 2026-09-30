import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BRAND_COLORS,
  BRAND_MARK_PATH,
  BRAND_MARK_VIEWBOX,
} from "../shared/brand.mjs";

const root = new URL("../public/", import.meta.url);
await mkdir(new URL("brand/", root), { recursive: true });
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BRAND_MARK_VIEWBOX}"><path fill="${BRAND_COLORS.violet}" d="${BRAND_MARK_PATH}"/></svg>`;
// Safe-area padding keeps the arrow and lower terminal inside a maskable icon.
const contents = (maskable) =>
  `<svg ${maskable ? 'x="113" y="109" width="286" height="294"' : 'x="82" y="77" width="348" height="358"'} viewBox="${BRAND_MARK_VIEWBOX}"><path fill="white" d="${BRAND_MARK_PATH}"/></svg>`;
const icon = (rounded, maskable = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="${BRAND_COLORS.violet}"/>${contents(maskable)}</svg>`;
await writeFile(new URL("brand/sidequest-mark.svg", root), mark);
await writeFile(new URL("icon.svg", root), icon(true));
for (const size of [192, 512]) {
  await sharp(Buffer.from(icon(false)))
    .resize(size, size)
    .png()
    .toFile(fileURLToPath(new URL(`icon-${size}.png`, root)));
}
await sharp(Buffer.from(icon(false)))
  .resize(180, 180)
  .png()
  .toFile(fileURLToPath(new URL("apple-touch-icon.png", root)));
await sharp(Buffer.from(icon(false, true)))
  .png()
  .toFile(fileURLToPath(new URL("icon-maskable-512.png", root)));
console.log(
  "Generated Sidequest SVG mark, favicon, PWA icons and Apple touch icon.",
);
