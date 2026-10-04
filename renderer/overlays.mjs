import sharp from "sharp";
import { stat } from "node:fs/promises";
import { BRAND_MARK_PATH, BRAND_MARK_VIEWBOX } from "../shared/brand.mjs";
import { overlayLayout, OVERLAY_POSITIONS } from "../shared/image-overlay.mjs";
export { OVERLAY_POSITIONS } from "../shared/image-overlay.mjs";

export const MAX_OVERLAY_BYTES = 5 * 1024 * 1024;
export const watermarkSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect x="64" y="1730" width="362" height="92" rx="22" fill="#171A22" fill-opacity="0.64"/><svg x="82" y="1745" width="62" height="64" viewBox="${BRAND_MARK_VIEWBOX}"><path fill="#FFFFFF" d="${BRAND_MARK_PATH}"/></svg><text x="159" y="1788" fill="#FFFFFF" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700">Side quest app</text></svg>`;

export async function writeWatermark(file) {
  await sharp(Buffer.from(watermarkSvg())).png().toFile(file);
}

/** Decode only raster images and strip metadata. The full-size transparent canvas
 * makes its position match the saved video, independently of source rotation. */
export async function writeImageOverlay(source, position, output, transform) {
  if (!OVERLAY_POSITIONS.includes(position))
    throw new Error("Choose a valid image position.");
  const info = await stat(source);
  if (!info.size || info.size > MAX_OVERLAY_BYTES)
    throw new Error("Choose an image no larger than 5 MB.");
  const input = sharp(source, {
    limitInputPixels: 40_000_000,
    animated: false,
  });
  const metadata = await input.metadata();
  if (
    !["png", "jpeg", "webp"].includes(metadata.format) ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Choose a still PNG, JPEG or WebP image.");
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const layout = overlayLayout(
    {
      width: rotated ? metadata.height : metadata.width,
      height: rotated ? metadata.width : metadata.height,
    },
    position,
    transform,
  );
  const data = await input
    .rotate()
    .resize({
      width: layout.width,
      height: layout.height,
      fit: "fill",
    })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: data, left: layout.left, top: layout.top }])
    .png()
    .toFile(output);
}
