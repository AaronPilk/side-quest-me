import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { BRAND_MARK_PATH } from "../shared/brand.mjs";
import {
  MAX_OVERLAY_BYTES,
  OVERLAY_POSITIONS,
  watermarkSvg,
  writeImageOverlay,
} from "../renderer/overlays.mjs";
import {
  overlayLayout,
  validOverlayTransform,
} from "../shared/image-overlay.mjs";
const folders: string[] = [];
async function folder() {
  const value = await mkdtemp(path.join(tmpdir(), "sq-overlay-test-"));
  folders.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((value) => rm(value, { recursive: true, force: true })),
  );
});
describe("recording image overlays and export watermark", () => {
  it("uses the approved logo and requested visible text", () => {
    expect(watermarkSvg()).toContain(BRAND_MARK_PATH);
    expect(watermarkSvg()).toContain(">Side quest app</text>");
    expect(watermarkSvg()).not.toMatch(/(?:href|url\()/);
  });
  it("places raster pixels in bounded video positions while preserving transparency elsewhere", async () => {
    const root = await folder();
    const source = path.join(root, "input.png");
    await sharp({
      create: { width: 80, height: 60, channels: 3, background: "red" },
    })
      .png()
      .toFile(source);
    for (const position of OVERLAY_POSITIONS) {
      const output = path.join(root, position + ".png");
      await writeImageOverlay(source, position, output);
      const metadata = await sharp(output).metadata();
      expect([metadata.width, metadata.height]).toEqual([1080, 1920]);
      expect(metadata.exif).toBeUndefined();
      const left =
        position === "center" ? 500 : position.endsWith("right") ? 940 : 60;
      const top =
        position === "center"
          ? 930
          : position.startsWith("bottom")
            ? 1560
            : 180;
      const pixel = await sharp(output)
        .extract({ left, top, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect([...pixel]).toEqual([255, 0, 0, 255]);
      const empty = await sharp(output)
        .extract({ left: 1, top: 1, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect(empty[3]).toBe(0);
    }
  });
  it("uses the same bounded geometry for a freely positioned, enlarged photo and its exported pixels", async () => {
    const root = await folder();
    const source = path.join(root, "input.png");
    await sharp({
      create: { width: 80, height: 60, channels: 3, background: "red" },
    })
      .png()
      .toFile(source);
    for (const transform of [
      { x: 0.7, y: 0.3, width: 0.4 },
      { x: 0.99, y: 0.99, width: 0.9 },
    ]) {
      const output = path.join(root, "free.png");
      await writeImageOverlay(source, "center", output, transform);
      const layout = overlayLayout(
        { width: 80, height: 60 },
        "center",
        transform,
      );
      expect(layout.width).toBe(Math.round(transform.width * 1080));
      expect(layout.left + layout.width).toBeLessThanOrEqual(1080);
      expect(layout.top + layout.height).toBeLessThanOrEqual(1920);
      const first = await sharp(output)
        .extract({ left: layout.left, top: layout.top, width: 1, height: 1 })
        .raw()
        .toBuffer();
      expect([...first]).toEqual([255, 0, 0, 255]);
      const before = await sharp(output)
        .extract({
          left: layout.left,
          top: layout.top - 1,
          width: 1,
          height: 1,
        })
        .raw()
        .toBuffer();
      expect(before[3]).toBe(0);
    }
  });
  it("bounds tall photos without distortion and rejects malformed or unbounded transforms", () => {
    const result = overlayLayout({ width: 100, height: 1000 }, "center", {
      x: 1,
      y: 0,
      width: 1,
    });
    expect(result).toEqual({ left: 888, top: 0, width: 192, height: 1920 });
    for (const transform of [
      null,
      {},
      { x: 0.5, y: 0.5, width: 0 },
      { x: -1, y: 0.5, width: 1 },
      { x: 0.5, y: NaN, width: 1 },
      { x: 0.5, y: 0.5, width: 0.5, extra: 1 },
    ])
      expect(validOverlayTransform(transform)).toBe(false);
  });
  it("rejects oversized, vector and invalid-position inputs before composing video", async () => {
    const root = await folder();
    const huge = path.join(root, "huge.png");
    await writeFile(huge, Buffer.alloc(MAX_OVERLAY_BYTES + 1));
    await expect(
      writeImageOverlay(huge, "center", path.join(root, "out.png")),
    ).rejects.toThrow("5 MB");
    const vector = path.join(root, "vector.svg");
    await writeFile(
      vector,
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(
      writeImageOverlay(vector, "center", path.join(root, "out.png")),
    ).rejects.toThrow("still PNG");
    await expect(
      writeImageOverlay(vector, "../outside", path.join(root, "out.png")),
    ).rejects.toThrow("valid image position");
  });
});
