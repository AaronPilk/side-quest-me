import { describe, expect, it } from "vitest";
import {
  hasReadyVideo,
  validSession,
  sessionSeconds,
} from "../src/lib/recording-session";
import type { Clip } from "../src/lib/types";
import { renderManifestSchema } from "../shared/media";
const clip = {
  id: "434033d7-ea23-4fb7-984a-e03fa45fca52",
  slot: 0,
  mode: "session",
  start: 0,
  end: 60,
} as Clip;
const manifest = {
  version: 1,
  runId: "7fbbd5b5-4bf2-4a98-8ce1-b58c1169a2b5",
  revision: 1,
  outputId: "93c597a9-b74e-41ca-bbd1-a70c6754af70",
  title: "Our quest",
  clips: [{ assetId: clip.id, start: 0, end: 60 }],
};
describe("one video recording session", () => {
  it("accepts short takes that together make a complete video without counting pauses", () => {
    const takes = [
      { file: new Blob(["a"]), duration: 2.2 },
      { file: new Blob(["b"]), duration: 3.1 },
    ];
    expect(sessionSeconds(takes)).toBeCloseTo(5.3);
    expect(validSession(takes)).toBe(true);
    expect(validSession(takes.slice(0, 1))).toBe(false);
    expect(validSession([{ file: new Blob(["x"]), duration: 61 }])).toBe(false);
    expect(validSession([{ file: new Blob([]), duration: 8 }])).toBe(false);
  });
  it("requires an explicitly saved session or complete legacy evidence", () => {
    expect(hasReadyVideo([clip])).toBe(true);
    expect(hasReadyVideo([{ ...clip, mode: undefined }])).toBe(false);
    expect(
      hasReadyVideo(
        [0, 1, 2].map((slot) => ({ ...clip, mode: undefined, slot, end: 10 })),
      ),
    ).toBe(true);
    expect(hasReadyVideo([{ ...clip, end: 61 }])).toBe(false);
  });
  it("renders the complete imported video but keeps the legacy three-source bounds", () => {
    expect(renderManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      renderManifestSchema.safeParse({
        ...manifest,
        clips: [{ ...manifest.clips[0], end: 4 }],
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...manifest,
        clips: [manifest.clips[0], manifest.clips[0]],
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...manifest,
        clips: [manifest.clips[0], manifest.clips[0], manifest.clips[0]],
      }).success,
    ).toBe(false);
  });
});
