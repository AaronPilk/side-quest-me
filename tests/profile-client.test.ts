import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, type Profile } from "../shared/domain";

vi.mock("../src/lib/auth", () => ({
  DEMO: true,
  accessToken: vi.fn(async () => undefined),
  supabase: null,
}));

const PROFILE_KEY = "sidequest-demo-v1";
const DRAFT_KEY = "sq-profile-draft";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

let api: typeof import("../src/lib/api").api;

function confirmedProfile(): Profile {
  return {
    displayName: "Alex",
    timezone: "America/New_York",
    locale: "en-US",
    summary: "I play music and enjoy games. No alcohol, please.",
    onboardingCompleted: true,
    preferences: {
      ...structuredClone(DEFAULT_PREFERENCES),
      role: "camera_person",
      interests: ["games"],
      skills: ["music"],
      exclusions: ["alcohol"],
      sources: {
        role: "survey",
        interests: "summary_review",
        skills: "survey",
        exclusions: "summary_review",
      },
    },
  };
}

async function profileAfterReload() {
  // Reload the client module while retaining only browser storage, as a refresh
  // would. This must not rely on a returned value or an in-memory profile cache.
  vi.resetModules();
  const { api: reloadedApi } = await import("../src/lib/api");
  return (await reloadedApi.me()).profile;
}

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("window", new EventTarget());
  ({ api } = await import("../src/lib/api"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("editable profile client persistence", () => {
  it("persists a summary-only edit after reload without changing confirmed answers or their sources", async () => {
    const profile = confirmedProfile();
    await api.saveProfile(profile);
    await api.updateProfile({ summary: "An updated summary to review later." });

    expect(await profileAfterReload()).toEqual({
      ...profile,
      summary: "An updated summary to review later.",
    });
  });

  it("immediately persists explicit summary removal while keeping survey and separately confirmed review answers", async () => {
    const profile = confirmedProfile();
    await api.saveProfile(profile);
    await api.updateProfile({ summary: "" });

    expect(
      JSON.parse(localStorage.getItem(PROFILE_KEY)!).me.profile.summary,
    ).toBe("");
    expect(await profileAfterReload()).toEqual({ ...profile, summary: "" });
  });

  it("clears stale summary draft text without discarding unrelated unsaved answers or draft progress", async () => {
    const profile = confirmedProfile();
    await api.saveProfile(profile);
    const draft = {
      step: 6,
      profile: {
        ...profile,
        displayName: "Unsaved name",
        preferences: {
          ...profile.preferences,
          role: "mastermind",
          preparation: "proper_setup",
        },
      },
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));

    await api.updateProfile({ summary: "" });

    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toEqual({
      ...draft,
      profile: { ...draft.profile, summary: "" },
    });
    expect(await profileAfterReload()).toEqual({ ...profile, summary: "" });
  });

  it("rejects a failed durable write and leaves the prior profile and draft intact", async () => {
    const profile = confirmedProfile();
    await api.saveProfile(profile);
    const draft = { step: 4, profile };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const persisted = localStorage.getItem(PROFILE_KEY);
    const changed = vi.spyOn(window, "dispatchEvent");
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("Storage quota exhausted");
    });

    await expect(api.updateProfile({ summary: "" })).rejects.toThrow(
      "Storage quota exhausted",
    );

    expect(localStorage.getItem(PROFILE_KEY)).toBe(persisted);
    expect(JSON.parse(sessionStorage.getItem(DRAFT_KEY)!)).toEqual(draft);
    expect(changed).not.toHaveBeenCalled();
    expect(await profileAfterReload()).toEqual(profile);
  });

  it("normalizes an ambiguous historical rotate default to unknown on a fresh read", async () => {
    const profile = confirmedProfile();
    const legacyPreferences = {
      ...profile.preferences,
      role: "rotate",
      version: undefined,
      sources: undefined,
      legacyUnconfirmed: undefined,
    };
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({
        me: {
          profile: { ...profile, preferences: legacyPreferences },
          wallet: { xp: 0, points: 0, version: 0 },
          roles: [],
        },
        runs: [],
      }),
    );

    const reloaded = await profileAfterReload();
    expect(reloaded.preferences.role).toBeNull();
    expect(reloaded.preferences.sources.role).toBeUndefined();
    expect(reloaded.preferences.legacyUnconfirmed).toContain("role");
    expect(reloaded.preferences.exclusions).toEqual(["alcohol"]);
  });

  it.each([
    ["negation", "I do not like games or sports. I never perform pranks."],
    [
      "uncertainty",
      "Maybe I like comedy. My activity preferences and skills are unknown.",
    ],
    [
      "entertainment",
      "I enjoy watching prank videos, but do not want to perform pranks.",
    ],
    [
      "product-design context",
      "Design an app with sports quests, a camera-person role and public sharing.",
    ],
  ])(
    "keeps %s summary text separate from structured preferences until manual confirmation",
    async (_label, summary) => {
      const profile = confirmedProfile();
      await api.saveProfile(profile);
      await api.updateProfile({ summary });

      const reloaded = await profileAfterReload();
      expect(reloaded.summary).toBe(summary);
      expect(reloaded.preferences).toEqual(profile.preferences);
    },
  );
});
