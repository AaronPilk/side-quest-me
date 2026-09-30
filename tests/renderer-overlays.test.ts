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
