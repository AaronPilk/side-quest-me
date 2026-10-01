import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES, type Profile } from "../shared/domain";

const auth = vi.hoisted(() => ({ actor: "account-a" as string | null }));
vi.mock("../src/lib/auth", () => ({
  DEMO: false,
  accessToken: async () => (auth.actor ? `token:${auth.actor}` : undefined),
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: auth.actor
            ? {
                user: { id: auth.actor },
                access_token: `token:${auth.actor}`,
              }
            : null,
        },
      }),
    },
  },
}));
import {
  accountIdentityChanged,
  PROFILE_DRAFT_KEYS,
  readProfileDraft,
  resolveProfileDraft,
  syncProfileDrafts,
} from "../src/lib/profile-drafts";
import { api } from "../src/lib/api";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
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
const profile: Profile = {
  accountType: "personal",
  displayName: "A",
  timezone: "America/New_York",
  locale: "en-US",
  summary: "Private account A summary",
  onboardingCompleted: true,
  preferences: DEFAULT_PREFERENCES,
};
beforeEach(() => {
  auth.actor = "account-a";
  vi.stubGlobal("sessionStorage", new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("identity-bound profile drafts", () => {
  it("does not start a profile mutation without a captured signed-in owner", async () => {
    auth.actor = null;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(api.updateProfile({ summary: "A edit" })).rejects.toThrow(
      "Sign in to save your profile",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(PROFILE_DRAFT_KEYS)(
    "rejects foreign and untagged %s rather than exposing imported text",
    (key) => {
      for (const ownerId of ["user:account-a", undefined]) {
        sessionStorage.setItem(
          key,
          JSON.stringify({ ownerId, profile, step: 5 }),
        );
        expect(readProfileDraft(key, "user:account-b")).toEqual({
          draft: null,
          discarded: true,
        });
        expect(sessionStorage.getItem(key)).toBeNull();
      }
    },
  );
  it("retains both current owner's drafts and synchronizes only confirmed saved fields", () => {
    for (const key of PROFILE_DRAFT_KEYS)
      sessionStorage.setItem(
        key,
        JSON.stringify({ ownerId: "user:account-a", profile, step: 5 }),
      );
    syncProfileDrafts("user:account-a", { summary: "" });
    for (const key of PROFILE_DRAFT_KEYS)
      expect(readProfileDraft(key, "user:account-a").draft).toEqual({
        ownerId: "user:account-a",
        profile: { ...profile, summary: "" },
        step: 5,
      });
  });
  it("never retags an unowned draft after a successful saved patch", () => {
    sessionStorage.setItem(
      PROFILE_DRAFT_KEYS[0],
      JSON.stringify({ profile, step: 5 }),
    );
    syncProfileDrafts("user:account-b", { summary: "B summary" });
    expect(sessionStorage.getItem(PROFILE_DRAFT_KEYS[0])).toBeNull();
  });
  it("cleans actual A to B SIGNED_IN transitions and signout, while token refresh retains progress", () => {
    expect(accountIdentityChanged("account-a", "account-b", "SIGNED_IN")).toBe(
      true,
    );
    expect(accountIdentityChanged("account-a", null, "SIGNED_OUT")).toBe(true);
    expect(
      accountIdentityChanged("account-a", "account-a", "TOKEN_REFRESHED"),
    ).toBe(false);
    expect(accountIdentityChanged("account-a", "account-a", "SIGNED_IN")).toBe(
      false,
    );
    expect(
      accountIdentityChanged(undefined, "account-a", "INITIAL_SESSION"),
    ).toBe(false);
  });
  it("does not synchronize an A save resolving after B signed in or recreate a removed draft", async () => {
    let release!: () => void;
    let requested!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    const requestGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("Authorization")).toBe(
        "Bearer token:account-a",
      );
      requested();
      await requestGate;
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetch);
    for (const key of PROFILE_DRAFT_KEYS)
      sessionStorage.setItem(
        key,
        JSON.stringify({ ownerId: "user:account-a", profile, step: 5 }),
      );
    const saving = api.updateProfile({ summary: "A edit" });
    await requestStarted;
    auth.actor = "account-b";
    for (const key of PROFILE_DRAFT_KEYS) sessionStorage.removeItem(key);
    sessionStorage.setItem(
      PROFILE_DRAFT_KEYS[1],
      JSON.stringify({
        ownerId: "user:account-b",
        profile: { ...profile, summary: "B" },
        step: 2,
      }),
    );
    release();
    await saving;
    expect(sessionStorage.getItem(PROFILE_DRAFT_KEYS[0])).toBeNull();
    expect(
      readProfileDraft(PROFILE_DRAFT_KEYS[1], "user:account-b").draft?.profile
        ?.summary,
    ).toBe("B");
  });
  it("synchronizes a same-account saved preference edit across both wizard versions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    for (const key of PROFILE_DRAFT_KEYS)
      sessionStorage.setItem(
        key,
        JSON.stringify({ ownerId: "user:account-a", profile, step: 5 }),
      );
    const preferences = {
      ...DEFAULT_PREFERENCES,
      role: "camera_person" as const,
      sources: { role: "survey" as const },
    };
    await api.updateProfile({ preferences });
    for (const key of PROFILE_DRAFT_KEYS)
      expect(
        readProfileDraft(key, "user:account-a").draft?.profile?.preferences,
      ).toEqual(preferences);
  });
});

describe("profile draft freshness", () => {
  it("loads durable data when no draft exists", () => {
    expect(resolveProfileDraft(profile, null)).toEqual({
      profile,
      discarded: false,
    });
  });

  it("preserves unsaved retry answers only while the durable baseline still matches", () => {
    const pending: Profile = {
      ...profile,
      displayName: "Unconfirmed nickname",
      preferences: {
        ...profile.preferences,
        role: "camera_person",
        sources: { role: "survey" },
      },
    };
    const draft = {
      ownerId: "user:account-a",
      baselineProfile: profile,
      profile: pending,
      summaryDraft: "Unsaved private summary text",
      summaryReturn: 6,
      step: -1,
    };
    const before = JSON.stringify({ profile, draft });
    expect(resolveProfileDraft(profile, draft)).toEqual({
      profile: pending,
      discarded: false,
    });
    expect(JSON.stringify({ profile, draft })).toBe(before);
  });

  it.each([
    ["account intent", { accountType: "brand" as const }],
    ["nickname", { displayName: "Saved on another device" }],
    ["summary removal", { summary: "" }],
    [
      "confirmed preferences",
      {
        preferences: {
          ...DEFAULT_PREFERENCES,
          interests: ["music" as const],
          sources: { interests: "survey" as const },
        },
      },
    ],
    ["setup completion", { onboardingCompleted: false }],
  ])(
    "does not overwrite newer %s from a stale same-owner draft",
    (_label, patch) => {
      const saved: Profile = { ...profile, ...patch };
      const draft = {
        ownerId: "user:account-a",
        baselineProfile: profile,
        profile: { ...profile, displayName: "Stale unsaved nickname" },
        summaryDraft: "Removed text must not reappear",
      };
      expect(resolveProfileDraft(saved, draft)).toEqual({
        profile: saved,
        discarded: true,
      });
    },
  );

  it("compares source maps structurally rather than by JSON object-key order", () => {
    const saved: Profile = {
      ...profile,
      preferences: {
        ...profile.preferences,
        role: "camera_person",
        interests: ["music"],
        sources: { role: "survey", interests: "summary_review" },
      },
    };
    const baseline: Profile = {
      ...saved,
      preferences: {
        ...saved.preferences,
        sources: { interests: "summary_review", role: "survey" },
      },
    };
    const pending = { ...saved, displayName: "Pending nickname" };
    expect(
      resolveProfileDraft(saved, {
        ownerId: "user:account-a",
        baselineProfile: baseline,
        profile: pending,
      }),
    ).toEqual({ profile: pending, discarded: false });
  });

  it("resumes a matching legacy draft without inventing its missing account intent", () => {
    const { accountType: _accountType, ...legacy } = profile;
    const saved: Profile = { ...profile, accountType: "brand" };
    expect(
      resolveProfileDraft(saved, {
        ownerId: "user:account-a",
        profile: legacy as Profile,
        step: 4,
      }),
    ).toEqual({ profile: saved, discarded: false });
    expect(
      resolveProfileDraft(saved, {
        ownerId: "user:account-a",
        profile: { ...legacy, summary: "Stale imported text" } as Profile,
        step: 4,
      }),
    ).toEqual({ profile: saved, discarded: true });
  });

  it("does not infer a retry baseline for a legacy draft with unsaved durable changes", () => {
    expect(
      resolveProfileDraft(profile, {
        ownerId: "user:account-a",
        profile: { ...profile, displayName: "Different draft" },
      }),
    ).toEqual({ profile, discarded: true });
  });

  it("rejects malformed draft profiles and malformed explicit baselines", () => {
    for (const draft of [
      { ownerId: "user:account-a" },
      {
        ownerId: "user:account-a",
        profile: { ...profile, timezone: 43 } as unknown as Profile,
      },
      {
        ownerId: "user:account-a",
        profile,
        baselineProfile: { ...profile, timezone: 43 } as unknown as Profile,
      },
    ]) {
      expect(resolveProfileDraft(profile, draft)).toEqual({
        profile,
        discarded: true,
      });
    }
  });

  it.each(PROFILE_DRAFT_KEYS)(
    "synchronizes edited/removed summary drafts and baselines in %s without losing unrelated pending answers",
    (key) => {
      const pending: Profile = {
        ...profile,
        displayName: "Unconfirmed nickname",
      };
      sessionStorage.setItem(
        key,
        JSON.stringify({
          ownerId: "user:account-a",
          baselineProfile: profile,
          profile: pending,
          summaryDraft: "An older unsaved summary",
          summaryReturn: 6,
          step: -1,
        }),
      );
      for (const summary of ["A saved replacement", ""]) {
        syncProfileDrafts("user:account-a", { summary });
        const draft = readProfileDraft(key, "user:account-a").draft!;
        expect(draft.summaryDraft).toBe(summary);
        expect(draft.summaryReturn).toBe(6);
        expect(draft.step).toBe(-1);
        expect(draft.profile).toEqual({ ...pending, summary });
        expect(draft.baselineProfile).toEqual({ ...profile, summary });
        expect(resolveProfileDraft({ ...profile, summary }, draft)).toEqual({
          profile: { ...pending, summary },
          discarded: false,
        });
      }
    },
  );
});
