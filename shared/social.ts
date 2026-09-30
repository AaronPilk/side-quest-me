import { z } from "zod";

export const PHOTO_BYTES = 300 * 1024;
export const PHOTO_SIZE = 256;
const reserved = new Set([
  "admin",
  "administrator",
  "sidequest",
  "support",
  "settings",
  "profile",
  "discover",
  "create",
  "rewards",
  "business",
  "operator",
  "api",
]);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(24)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Use a letter first, then letters, numbers or underscores.",
  )
  .refine((value) => !reserved.has(value), "This username is reserved.");
export const socialProfileInput = z
  .object({
    username: z.union([z.literal(""), usernameSchema]),
    displayName: z.string().trim().min(1).max(60),
    avatarKey: z.enum(["coral", "mint", "violet", "sunset"]),
    bio: z.string().trim().max(280),
    openToBrands: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
export type SocialProfileInput = z.infer<typeof socialProfileInput>;
export const followInput = z
  .object({ targetId: z.uuid(), following: z.boolean() })
  .strict();
export type SocialProfile = {
  creatorId: string;
  username: string | null;
  photoUrl: string | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwn: boolean;
};

/** CRC checks and a narrow PNG grammar strip metadata and reject active/foreign formats. */
export function normalizedProfilePng(input: Uint8Array): Uint8Array {
  const fail = () => {
    throw new Error("Choose a valid profile photo and try again.");
  };
  if (input.length > PHOTO_BYTES || input.length < 57) fail();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => input[index] === value)) fail();
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const kept: Uint8Array[] = [input.slice(0, 8)];
  let offset = 8,
    header = false,
    image = false,
    end = false;
  while (offset + 12 <= input.length) {
    const length = view.getUint32(offset),
      stop = offset + length + 12;
    if (stop > input.length || length > PHOTO_BYTES) fail();
    const type = String.fromCharCode(...input.slice(offset + 4, offset + 8));
    let crc = 0xffffffff;
    for (let i = offset + 4; i < stop - 4; i++) {
      crc ^= input[i];
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(stop - 4)) fail();
    if (type === "IHDR") {
      if (header || offset !== 8 || length !== 13) fail();
      if (
        view.getUint32(offset + 8) !== PHOTO_SIZE ||
        view.getUint32(offset + 12) !== PHOTO_SIZE ||
        input[offset + 16] !== 8 ||
        ![2, 6].includes(input[offset + 17]) ||
        input[offset + 18] !== 0 ||
        input[offset + 19] !== 0 ||
        input[offset + 20] !== 0
      )
        fail();
      header = true;
    } else if (type === "IDAT") {
      if (!header || end || !length) fail();
      image = true;
    } else if (type === "IEND") {
      if (!image || length !== 0 || stop !== input.length) fail();
      end = true;
    } else if (!/^[a-z]/.test(type)) fail();
    if (["IHDR", "IDAT", "IEND"].includes(type))
      kept.push(input.slice(offset, stop));
    offset = stop;
  }
  if (!end || offset !== input.length) fail();
  const output = new Uint8Array(
    kept.reduce((sum, part) => sum + part.length, 0),
  );
  let at = 0;
  for (const part of kept) {
    output.set(part, at);
    at += part.length;
  }
  return output;
}
