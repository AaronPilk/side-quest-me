import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, type Profile } from "../shared/domain";

vi.mock("../src/lib/auth", () => ({
  DEMO: true,
  accessToken: vi.fn(async () => undefined),
  supabase: null,
}));

const PROFILE_KEY = "sidequest-demo-v1";
const DRAFT_KEY = "sq-profile-draft";
const WIZARD_DRAFT_KEY = "sq-preference-wizard-draft";
const DRAFT_OWNER = "demo:11111111-1111-4111-8111-111111111111";

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
    accountType: "personal",
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

  it.each([DRAFT_KEY, WIZARD_DRAFT_KEY])(
    "clears stale summary in %s without discarding unrelated unsaved answers or draft progress",
    async (draftKey) => {
      const profile = confirmedProfile();
      await api.saveProfile(profile);
      const draft = {
        ownerId: DRAFT_OWNER,
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
      sessionStorage.setItem(draftKey, JSON.stringify(draft));

      await api.updateProfile({ summary: "" });

      expect(JSON.parse(sessionStorage.getItem(draftKey)!)).toEqual({
        ...draft,
        profile: { ...draft.profile, summary: "" },
      });
      expect(await profileAfterReload()).toEqual({ ...profile, summary: "" });
    },
  );

  it("updates saved account intent and preferences in the wizard even when an older draft is malformed", async () => {
    const profile = confirmedProfile();
    await api.saveProfile(profile);
    const draft = {
      ownerId: DRAFT_OWNER,
      step: 7,
      reviewingAnswer: true,
      profile: { ...profile, displayName: "Unsaved name" },
    };
    sessionStorage.setItem(DRAFT_KEY, "{broken");
    sessionStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
    const preferences = { ...profile.preferences, role: "mastermind" as const };
    await api.updateProfile({ accountType: "brand", preferences });
    expect(JSON.parse(sessionStorage.getItem(WIZARD_DRAFT_KEY)!)).toEqual({
      ...draft,
      profile: { ...draft.profile, accountType: "brand", preferences },
    });
    expect(await profileAfterReload()).toMatchObject({
      accountType: "brand",
      preferences,
    });
  });

  it.each([DRAFT_KEY, WIZARD_DRAFT_KEY])(
    "rejects a failed durable write and leaves the prior profile and %s intact",
    async (draftKey) => {
      const profile = confirmedProfile();
      await api.saveProfile(profile);
      const draft = { ownerId: DRAFT_OWNER, step: 4, profile };
      sessionStorage.setItem(draftKey, JSON.stringify(draft));
      const persisted = localStorage.getItem(PROFILE_KEY);
      const changed = vi.spyOn(window, "dispatchEvent");
      vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
        throw new Error("Storage quota exhausted");
      });

      await expect(api.updateProfile({ summary: "" })).rejects.toThrow(
        "Storage quota exhausted",
      );

      expect(localStorage.getItem(PROFILE_KEY)).toBe(persisted);
      expect(JSON.parse(sessionStorage.getItem(draftKey)!)).toEqual(draft);
      expect(changed).not.toHaveBeenCalled();
      expect(await profileAfterReload()).toEqual(profile);
    },
  );

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

describe("profile draft identity isolation", () => {
  it.each(["switch", "reset"])(
    "clears both drafts on a demo %s",
    async (action) => {
      const { resetDemoState, switchDemoPersona } =
        await import("../src/lib/demo-identity");
      vi.stubGlobal("location", { assign: vi.fn() });
      for (const key of [DRAFT_KEY, WIZARD_DRAFT_KEY])
        sessionStorage.setItem(
          key,
          JSON.stringify({ step: 5, profile: confirmedProfile() }),
        );
      if (action === "switch") switchDemoPersona("viewer");
      else resetDemoState();
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(sessionStorage.getItem(WIZARD_DRAFT_KEY)).toBeNull();
    },
  );
});

describe("account type persistence", () => {
  it("keeps a queued profile save scoped to its original demo account", async () => {
    await api.updateProfile({ accountType: "personal" });
    let release!: () => void;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_key: string, run: () => unknown) =>
          new Promise((resolve) => {
            release = () => resolve(run());
          }),
      },
    });
    const saving = api.updateProfile({ summary: "Original account edit" });
    localStorage.setItem("sidequest-demo-persona", "brand");
    release();
    await saving;
    expect(
      JSON.parse(localStorage.getItem(PROFILE_KEY)!).me.profile,
    ).toMatchObject({
      accountType: "personal",
      summary: "Original account edit",
    });
    expect((await profileAfterReload()).accountType).toBe("brand");
  });

  it("saves brand intent across refresh and exposes the same choice in community me", async () => {
    expect((await api.me()).profile.accountType).toBeNull();
    await api.updateProfile({ accountType: "brand" });
    await api.updateProfile({ summary: "A separate imported note" });
    expect((await profileAfterReload()).accountType).toBe("brand");
    const { communityApi } = await import("../src/lib/community-api");
    const me = await communityApi.read("me");
    expect(me).toMatchObject({ accountType: "brand", brand: null, roles: [] });
    await api.updateProfile({ accountType: "personal" });
    expect((await profileAfterReload()).accountType).toBe("personal");
    expect(await communityApi.read("me")).toMatchObject({
      accountType: "personal",
    });
  });
  it("infers an approved historical demo brand, but never an operator, and preserves an explicit personal choice", async () => {
    localStorage.setItem("sidequest-demo-persona", "brand");
    expect((await profileAfterReload()).accountType).toBe("brand");
    await api.updateProfile({ accountType: "personal" });
    expect((await profileAfterReload()).accountType).toBe("personal");
    const { communityApi } = await import("../src/lib/community-api");
    expect(await communityApi.read("me")).toMatchObject({
      accountType: "personal",
      brand: { state: "approved" },
    });
    localStorage.setItem("sidequest-demo-persona", "operator");
    expect((await profileAfterReload()).accountType).toBeNull();
    expect(await communityApi.read("me")).toMatchObject({
      accountType: null,
      roles: ["operator"],
    });
  });
});
