import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  normalizedProfilePng,
  PHOTO_BYTES,
  usernameSchema,
} from "../shared/social";
import {
  demoSocialBlock,
  demoSocialFollow,
  demoSocialIdentity,
  demoSocialPhoto,
  demoSocialRead,
  demoSocialSave,
} from "../src/lib/demo-social";
import { demoMutate } from "../src/lib/demo-community";
import { DEMO_PEOPLE } from "../src/lib/demo-identity";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
const profile = (username: string) => ({
  username,
  displayName: "Social creator",
  avatarKey: "coral" as const,
  bio: "Public bio",
  openToBrands: true,
  expectedVersion: 1,
});

describe("social identity and deterministic follows", () => {
  it("normalizes usernames while rejecting reserved and invalid handles", () => {
    expect(usernameSchema.parse("  Photo_Creator  ")).toBe("photo_creator");
    for (const value of [
      "aa",
      "2creator",
      "my name",
      "admin",
      "sidequest",
      "x".repeat(25),
    ])
      expect(usernameSchema.safeParse(value).success).toBe(false);
  });
  it("persists claimed usernames and rejects case-insensitive collisions without changing the other profile", async () => {
    await demoSocialSave(profile("first_creator"));
    localStorage.setItem("sidequest-demo-persona", "viewer");
    await expect(demoSocialSave(profile("FIRST_CREATOR"))).rejects.toThrow(
      "already taken",
    );
    expect(demoSocialIdentity(DEMO_PEOPLE.viewer.id).username).toBeNull();
    expect(demoSocialIdentity(DEMO_PEOPLE.creator.id).username).toBe(
      "first_creator",
    );
  });
  it("idempotent follow and unfollow give accurate counts, and block removal is permanent", async () => {
    const target = DEMO_PEOPLE.viewer.id;
    await demoSocialFollow(target, true);
    await demoSocialFollow(target, true);
    expect(demoSocialRead(target)).toMatchObject({
      followersCount: 1,
      isFollowing: true,
      isOwn: false,
    });
    expect(demoSocialRead()).toMatchObject({ followingCount: 1 });
    await demoSocialFollow(target, false);
    expect(demoSocialRead(target).followersCount).toBe(0);
    await expect(
      demoSocialFollow(DEMO_PEOPLE.creator.id, true),
    ).rejects.toThrow("own profile");
    await demoSocialFollow(target, true);
    await demoMutate(
      "block",
      { userId: target, blocked: true },
      crypto.randomUUID(),
    );
    demoSocialBlock(DEMO_PEOPLE.creator.id, target);
    expect(() => demoSocialRead(target)).toThrow("unavailable");
    await demoMutate(
      "block",
      { userId: target, blocked: false },
      crypto.randomUUID(),
    );
    expect(demoSocialRead(target)).toMatchObject({
      followersCount: 0,
      isFollowing: false,
    });
  });
  it("photo removal keeps the username and public identity DTO narrow", async () => {
    await demoSocialSave(profile("my_profile"));
    await demoSocialPhoto("data:image/png;base64,dGVzdA==");
    expect(demoSocialRead().photoUrl).toContain("data:image/png");
    await demoSocialPhoto(null);
    expect(demoSocialRead()).toEqual({
      creatorId: DEMO_PEOPLE.creator.id,
      username: "my_profile",
      photoUrl: null,
      followersCount: 0,
      followingCount: 0,
      isFollowing: false,
      isOwn: true,
    });
  });
});

describe("bounded metadata-free profile raster", () => {
  it("accepts the normalized crop, validates CRCs, and removes metadata", async () => {
    const png = await sharp({
      create: { width: 256, height: 256, channels: 3, background: "#0866e9" },
    })
      .withMetadata({ exif: { IFD0: { Artist: "PRIVATE_PHOTO_METADATA" } } })
      .png()
      .toBuffer();
    expect(png.toString("latin1")).toContain("PRIVATE_PHOTO_METADATA");
    const normalized = normalizedProfilePng(new Uint8Array(png));
    expect(Buffer.from(normalized).toString("latin1")).not.toContain(
      "PRIVATE_PHOTO_METADATA",
    );
    const result = await sharp(normalized).metadata();
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    expect(result.exif).toBeUndefined();
    const corrupted = new Uint8Array(normalized);
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => normalizedProfilePng(corrupted)).toThrow();
  });
  it("rejects SVG, wrong sizes, truncated chunks, trailers and oversized bodies", async () => {
    for (const bytes of [
      new TextEncoder().encode('<svg onload="alert(1)"/>'),
      new Uint8Array(PHOTO_BYTES + 1),
      new Uint8Array(
        await sharp({
          create: { width: 512, height: 512, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      ),
    ])
      expect(() => normalizedProfilePng(bytes)).toThrow();
    const valid = new Uint8Array(
      await sharp({
        create: { width: 256, height: 256, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    );
    expect(() => normalizedProfilePng(valid.slice(0, -5))).toThrow();
    const extra = new Uint8Array(valid.length + 1);
    extra.set(valid);
    expect(() => normalizedProfilePng(extra)).toThrow();
  });
});
