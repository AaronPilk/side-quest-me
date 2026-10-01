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
