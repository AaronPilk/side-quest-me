import {
  PHOTO_SIZE,
  PHOTO_BYTES,
  followInput,
  normalizedProfilePng,
  socialProfileInput,
  type SocialProfile,
  type SocialProfileInput,
} from "../../shared/social";
import { request } from "./api";
import { DEMO } from "./auth";
import {
  CONTENT_REVIEW_CONSENT_HEADER,
  CONTENT_REVIEW_PERMISSION_MESSAGE,
} from "../../shared/content-review";
import {
  demoSocialFollow,
  demoSocialPhoto,
  demoSocialRead,
  demoSocialSave,
} from "./demo-social";

export async function normalizeProfilePhoto(file: File): Promise<Blob> {
  if (
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a JPEG, PNG, or WebP photo up to 5 MB.");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be read. Choose another photo.");
  }
  try {
    if (
      !image.width ||
      !image.height ||
      image.width * image.height > 40_000_000
    )
      throw new Error("Choose a photo smaller than 40 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Photo editing is unavailable in this browser.");
    const size = Math.min(image.width, image.height);
    context.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      PHOTO_SIZE,
      PHOTO_SIZE,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("This photo could not be prepared.")),
        "image/png",
      ),
    );
    if (blob.size > PHOTO_BYTES)
      throw new Error("Choose a smaller profile photo.");
    return new Blob(
      [
        new Uint8Array(
          normalizedProfilePng(new Uint8Array(await blob.arrayBuffer())),
        ),
      ],
      { type: "image/png" },
    );
  } finally {
    image.close();
  }
}
export const socialApi = {
  read: async (id?: string): Promise<SocialProfile> =>
    DEMO
      ? demoSocialRead(id)
      : request(
          id
            ? `/api/social/profile/${encodeURIComponent(id)}`
            : "/api/social/me",
        ),
  save: async (
    input: SocialProfileInput,
    contentReviewConsent = false,
  ): Promise<SocialProfile> => {
    if (!contentReviewConsent)
      throw new Error(CONTENT_REVIEW_PERMISSION_MESSAGE);
    const validation = socialProfileInput.safeParse(input);
    if (!validation.success)
      throw new Error(
        validation.error.issues[0]?.message || "Check your profile details.",
      );
    const parsed = validation.data;
    return DEMO
      ? demoSocialSave(parsed)
      : request("/api/social/profile", {
          method: "POST",
          headers: { [CONTENT_REVIEW_CONSENT_HEADER]: "true" },
          body: JSON.stringify(parsed),
        });
  },
  follow: async (
    targetId: string,
    following: boolean,
  ): Promise<SocialProfile> => {
    const parsed = followInput.parse({ targetId, following });
    return DEMO
      ? demoSocialFollow(targetId, following)
      : request("/api/social/follow", {
          method: "POST",
          body: JSON.stringify(parsed),
        });
  },
  uploadPhoto: async (
    file: File,
    contentReviewConsent = false,
  ): Promise<SocialProfile> => {
    if (!contentReviewConsent)
      throw new Error(CONTENT_REVIEW_PERMISSION_MESSAGE);
    const photo = await normalizeProfilePhoto(file);
    if (DEMO) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error("This photo could not be saved."));
        reader.readAsDataURL(photo);
      });
      return demoSocialPhoto(dataUrl);
    }
    return request("/api/social/photo", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        [CONTENT_REVIEW_CONSENT_HEADER]: "true",
      },
      body: photo,
    });
  },
  removePhoto: async (): Promise<SocialProfile> =>
    DEMO
      ? demoSocialPhoto(null)
      : request("/api/social/photo", { method: "DELETE" }),
};
