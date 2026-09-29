import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import type { CommunityReadResults } from "../shared/community";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
}

const coreKeys = [
  "sidequest-demo-v1",
  "sidequest-demo-v1:viewer",
  "sidequest-demo-v1:brand",
  "sidequest-demo-v1:operator",
];
const sessionKeys = [
  "sq-profile-draft",
  "sq-outing",
  "sq-quest-flow",
  "sq-demo-started",
  "sq-return-to",
];
let signOut: ReturnType<typeof vi.fn>;
let request: ReturnType<typeof vi.fn>;

function snapshot(storage: Storage) {
  return Object.fromEntries(
    Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)!,
    ).map((key) => [key, storage.getItem(key)]),
  );
}

async function client(demo = true) {
  vi.resetModules();
  vi.doMock("../src/lib/auth", () => ({
    DEMO: demo,
    accessToken: async () => undefined,
    supabase: { auth: { signOut } },
  }));
  return (await import("../src/lib/api")).api;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("window", new EventTarget());
  signOut = vi.fn(async () => undefined);
  request = vi.fn(async () => Response.json({ deleted: true, demo: true }));
  vi.stubGlobal("fetch", request);
  for (const key of coreKeys)
    localStorage.setItem(
      key,
      JSON.stringify({
        me: {
          profile: {
            displayName: "Saved personal name",
            summary: "Saved private summary",
            preferences: DEFAULT_PREFERENCES,
            locale: "en-US",
            timezone: "UTC",
            onboardingCompleted: true,
          },
          wallet: { xp: 500, points: 50, version: 2 },
          roles: [],
        },
        runs: [],
      }),
    );
  localStorage.setItem("sidequest-demo-persona", "brand");
  localStorage.setItem(
    "sidequest-community-demo-v1",
    JSON.stringify({
      savedPrivateDemoData: "Saved custom posts, offers and identity",
    }),
  );
  localStorage.setItem("unrelated-setting", "keep this");
  for (const key of sessionKeys)
    sessionStorage.setItem(key, "stale demo state");
  sessionStorage.setItem("unrelated-session", "keep this too");
});
afterEach(() => {
  vi.doUnmock("../src/lib/auth");
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("coherent isolated demo reset", () => {
  it("clears all four personas and community records only after shared local media deletion succeeds", async () => {
    const api = await client();
    await api.deleteAccount();
    expect(request).toHaveBeenCalledWith(
      "/api/local-media/account",
      expect.objectContaining({
        method: "DELETE",
        headers: { "X-Sidequest-Demo": "1" },
      }),
    );
    for (const key of [
      ...coreKeys,
      "sidequest-demo-persona",
      "sidequest-community-demo-v1",
    ])
      expect(localStorage.getItem(key), key).toBeNull();
    for (const key of sessionKeys)
      expect(sessionStorage.getItem(key), key).toBeNull();
    expect(localStorage.getItem("unrelated-setting")).toBe("keep this");
    expect(sessionStorage.getItem("unrelated-session")).toBe("keep this too");
    expect(signOut).not.toHaveBeenCalled();

    const fresh = await client();
    expect((await fresh.me()).profile.summary).toBe("");
    expect((await fresh.me()).wallet).toEqual({ xp: 0, points: 0, version: 0 });
    const { demoRead, DEMO_POST_ID } =
      await import("../src/lib/demo-community");
    const feed = demoRead<CommunityReadResults["feed"]>("feed");
    expect(feed.posts).toHaveLength(1);
    expect(feed.posts[0]).toMatchObject({
      id: DEMO_POST_ID,
      demo: true,
      mediaUrl: "/api/local-media/demo-reel",
    });
    expect(feed.posts[0].caption).toContain("Synthetic FFmpeg footage");
    expect(demoRead<CommunityReadResults["offers"]>("offers").offers).toEqual(
      [],
    );
  });

  it("preserves every browser record and reports failure when the renderer cannot delete media", async () => {
    request.mockResolvedValue(
      Response.json(
        { error: "Wait for the current render to finish." },
        { status: 409 },
      ),
    );
    const browserBefore = snapshot(localStorage);
    const sessionBefore = snapshot(sessionStorage);
    const changed = vi.spyOn(window, "dispatchEvent");
    const api = await client();
    await expect(api.deleteAccount()).rejects.toThrow("current render");
    expect(snapshot(localStorage)).toEqual(browserBefore);
    expect(snapshot(sessionStorage)).toEqual(sessionBefore);
    expect(changed).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps configured account deletion separate from local demo reset", async () => {
    const browserBefore = snapshot(localStorage);
    const sessionBefore = snapshot(sessionStorage);
    const api = await client(false);
    await api.deleteAccount();
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/me",
      expect.objectContaining({ method: "DELETE", headers: {} }),
    );
    expect(signOut).toHaveBeenCalledOnce();
    expect(snapshot(localStorage)).toEqual(browserBefore);
    expect(snapshot(sessionStorage)).toEqual(sessionBefore);
  });
});
