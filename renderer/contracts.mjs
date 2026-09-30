import { z } from "zod";

export const MEDIA_LIMITS = Object.freeze({
  maxUploadBytes: 40 * 1024 * 1024,
  maxOutputBytes: 100 * 1024 * 1024,
  maxRawSeconds: 60,
  minSelectedSeconds: 5,
  maxSelectedSeconds: 60,
  width: 1080,
  height: 1920,
  fps: 30,
  maxJobMs: 240_000,
  maxLocalBytes: 2 * 1024 ** 3,
  maxInputsPerRun: 36,
  sourceRetentionDays: 30,
});
const plainText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s),
      "Control characters are not allowed",
    );
export const clipSelectionSchema = z
  .object({
    assetId: z.uuid(),
    start: z.number().finite().min(0).max(55),
    end: z.number().finite().min(5).max(60),
    mute: z.boolean().default(false),
    fit: z.enum(["fit", "fill"]).default("fit"),
    crop: z.number().min(0).max(1).default(0.5),
    label: plainText(64).default(""),
  })
  .strict()
  .refine(
    (v) => v.end - v.start >= 5 && v.end - v.start <= 60,
    "Select 5–60 seconds",
  );
export const renderManifestSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    revision: z.number().int().positive().max(10000),
    outputId: z.uuid(),
    title: plainText(96),
    sponsorDisclosure: plainText(120).optional(),
    clips: z.array(clipSelectionSchema).min(1).max(3),
  })
  .strict()
  .refine(
    (v) =>
      v.clips.length === 1 ||
      (v.clips.length === 3 &&
        new Set(v.clips.map((c) => c.assetId)).size === 3 &&
        v.clips.every((c) => c.end - c.start <= 15)),
    "Use one complete video or three distinct legacy clips of 5–15 seconds",
  );

export function assertId(value) {
  return z.uuid().parse(value);
}
