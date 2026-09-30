import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  profilePatchSchema,
  type Profile,
  type Outing,
  type Candidate,
  type QuestVariant,
} from "../../shared/domain";
import { catalog } from "../../shared/catalog";
import { assessViability, type QuestViability } from "../../shared/viability";
import { recommend } from "../../shared/recommend";
import { accessToken, DEMO, supabase } from "./auth";
import type { Clip, Me, Offer, Redemption, Run, Reel } from "./types";
import {
  demoDataKey,
  demoPersona,
  demoActor,
  resetDemoState,
} from "./demo-identity";
import { demoInspiration, demoOriginalTemplates } from "./demo-community";
import { demoValidateSeriesPart } from "./demo-series";

type DemoData = {
  me: Me;
  runs: Run[];
  acceptances?: Record<string, { fingerprint: string; runId: string }>;
};
const initial = (): DemoData => ({
  me: {
    profile: {
      displayName: demoPersona() === "creator" ? "" : demoActor().name,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
      summary: "",
      preferences: DEFAULT_PREFERENCES,
      onboardingCompleted: false,
    },
    wallet: { xp: 0, points: 0, version: 0 },
    roles: [],
  },
  runs: [],
});
function read(key = demoDataKey()): DemoData {
  try {
    const data = localStorage.getItem(key);
    const saved: DemoData = data ? JSON.parse(data) : initial();
    saved.me.profile.preferences = normalizePreferences(
      saved.me.profile.preferences,
    );
    return saved;
  } catch {
    return initial();
  }
}
function write(value: DemoData, key = demoDataKey()) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("sidequest-change"));
}
async function transaction<T>(fn: (data: DemoData) => T): Promise<T> {
  const key = demoDataKey();
  const execute = () => {
    const data = read(key);
    const result = fn(data);
    write(data, key);
    return result;
  };
  return navigator.locks ? navigator.locks.request(key, execute) : execute();
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string | { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(
      (typeof body?.error === "string" ? body.error : body?.error?.message) ||
        `Request failed (${response.status}). Try again.`,
    );
  return body as T;
}
const mutation = <T>(
  path: string,
  body: unknown,
  key: string = crypto.randomUUID(),
) =>
  request<T>(path, {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
export const demoOffers: Offer[] = [
  {
    id: "demo-discount",
    title: "A little off your next outing",
    merchant: "Example neighborhood spot",
    points: 20,
    terms:
      "Simulated example: 10% off an eligible purchase. A live offer would disclose minimum spend, discount cap, exclusions and expiry. No business agreement or redeemable code exists.",
    demo: true,
    available: 0,
  },
  {
    id: "demo-coffee",
    title: "Your next coffee",
    merchant: "Example coffee counter",
    points: 40,
    terms:
      "Simulated example: one regular coffee. No real merchant, stock or voucher. Viewing this example does not spend points.",
    demo: true,
    available: 0,
  },
  {
    id: "demo-meal",
    title: "Dinner, on your adventures",
    merchant: "Example local kitchen",
    points: 100,
    terms:
      "Simulated example: a meal. A funded live offer would specify inclusions, any extra charges, location and expiration.",
    demo: true,
    available: 0,
  },
  {
    id: "demo-date",
    title: "Make a date of it",
    merchant: "Example activity partner",
    points: 250,
    terms:
      "Simulated example: a date activity. No partnership is implied. This example cannot reserve stock or issue a code.",
    demo: true,
    available: 0,
  },
];
export function eligibility(runs: Run[], familyId: string) {
  const rewarded = runs.filter((r) => (r.rewardDecision?.xp || 0) > 0);
  if (
    rewarded.some(
      (r) =>
        r.quest.familyId === familyId &&
        Date.now() - Date.parse(r.completedAt!) < 30 * 86400000,
    )
  )
    return "family_cooldown";
  if (
    rewarded.filter(
      (r) =>
        r.completedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10),
    ).length >= 3
  )
    return "daily_cap";
  return "eligible";
}
export const api = {
  me: async (): Promise<Me> => {
    const me = DEMO ? read().me : await request<Me>("/api/me");
    me.profile.preferences = normalizePreferences(me.profile.preferences);
    return me;
  },
  updateProfile: async (input: Partial<Profile>): Promise<void> => {
    const patch = profilePatchSchema.parse(input);
    if (DEMO)
      await transaction((d) => {
        d.me.profile = { ...d.me.profile, ...patch };
      });
    else
      await request<Me>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    // A saved summary edit/removal must not be resurrected by an older survey draft.
    // Preserve unrelated answers still being edited in that draft.
    try {
      const draft = JSON.parse(
        sessionStorage.getItem("sq-profile-draft") || "null",
      );
      if (draft?.profile)
        sessionStorage.setItem(
          "sq-profile-draft",
          JSON.stringify({ ...draft, profile: { ...draft.profile, ...patch } }),
        );
    } catch {
      /* Saving the durable profile succeeded even if draft storage is unavailable. */
    }
  },
  saveProfile: async (profile: Profile): Promise<void> =>
    api.updateProfile(profile),
  quest: async (templateId: string): Promise<QuestVariant> => {
    if (!DEMO) return request(`/api/quests/${encodeURIComponent(templateId)}`);
    const quest = [...catalog, ...demoOriginalTemplates()].find(
      (item) => item.id === templateId,
    );
    if (!quest)
      throw new Error("This quest is unavailable. Choose another quest.");
    return quest;
  },
  quests: async (
    outing: Outing,
    templateId?: string,
    offset = 0,
  ): Promise<Candidate[]> =>
    DEMO
      ? recommend(
          outing,
          read().me.profile.preferences,
          [],
          new Date(),
          [...catalog, ...demoOriginalTemplates()].filter(
            (item) => !templateId || item.id === templateId,
          ),
          offset,
        )
      : mutation("/api/quests/recommend", {
          outing,
          ...(templateId ? { templateId } : {}),
          ...(offset ? { offset } : {}),
        }),
  viability: async (
    outing: Outing,
    confirmed: (keyof Outing)[],
    templateId?: string,
  ): Promise<QuestViability> =>
    DEMO
      ? assessViability(
          outing,
          read().me.profile.preferences,
          confirmed,
          [...catalog, ...demoOriginalTemplates()].filter(
            (item) => !templateId || item.id === templateId,
          ),
        )
      : mutation("/api/quests/viability", {
          outing,
          confirmed,
          ...(templateId ? { templateId } : {}),
        }),
  runs: async (): Promise<Run[]> =>
    DEMO ? read().runs : request("/api/quest-runs"),
  run: async (id: string): Promise<Run> => {
    if (!DEMO) return request(`/api/quest-runs/${id}`);
    const run = read().runs.find((r) => r.id === id);
    if (!run)
      throw new Error("This quest could not be found. Return to your journal.");
    if (run.render?.status === "processing") {
      try {
        const result = await request<Reel>(
          `/api/local-media/outputs/${run.render.id}/metadata`,
        );
        await transaction((d) => {
          d.runs.find((r) => r.id === id)!.render = result;
        });
        run.render = result;
      } catch {
        if (Date.now() - (run.render.startedAt || 0) > 360000) {
          run.render = {
            ...run.render,
            status: "failed",
            error:
              "Rendering was interrupted. Your original clips are saved; retry to build your reel.",
          };
          await transaction((d) => {
            d.runs.find((r) => r.id === id)!.render = run.render;
          });
        }
      }
    }
    return run;
  },
  accept: async (
    quest: Candidate,
    outing: Outing,
    key: string,
    inspiredByPostId?: string,
    seriesPartId?: string,
  ): Promise<Run> =>
    DEMO
      ? transaction((d) => {
          const fingerprint = JSON.stringify([
            quest.id,
            Object.fromEntries(
              Object.entries(outing).sort(([a], [b]) => a.localeCompare(b)),
            ),
            inspiredByPostId ?? null,
            ...(seriesPartId ? [seriesPartId] : []),
          ]);
          const receipt = d.acceptances?.[key];
          if (receipt) {
            if (receipt.fingerprint !== fingerprint)
              throw new Error(
                "This request key was already used for a different quest or outing.",
              );
            const accepted = d.runs.find((run) => run.id === receipt.runId);
            if (!accepted)
              throw new Error("The original attempt is no longer available.");
            return accepted;
          }
          const remember = (run: Run) => {
            d.acceptances = {
              ...d.acceptances,
              [key]: { fingerprint, runId: run.id },
            };
            return run;
          };
          if (inspiredByPostId)
            demoInspiration(inspiredByPostId, quest.id, seriesPartId);
          const active = d.runs.find((r) =>
            ["accepted", "in_progress"].includes(r.status),
          );
          if (active) {
            if (
              active.quest.id === quest.id &&
              (active.series?.partId ?? null) === (seriesPartId ?? null)
            )
              return remember(active);
            throw new Error(
              "You have a quest in progress. Continue it or abandon it first.",
            );
          }
          const variant = [...catalog, ...demoOriginalTemplates()].find(
            (item) => item.id === quest.id,
          );
          const selected = recommend(
            outing,
            d.me.profile.preferences,
            [],
            new Date(),
            variant ? [variant] : [],
          ).find((q) => q.id === quest.id);
          if (!selected || !variant)
            throw new Error(
              "This quest no longer fits. Find your quests again.",
            );
          const series = seriesPartId
            ? demoValidateSeriesPart(seriesPartId, quest.id, d.runs)
            : undefined;
          const run: Run = {
            id: crypto.randomUUID(),
            quest: structuredClone(variant),
            outing,
            role: selected.selectedRole,
            ...(inspiredByPostId ? { inspiredByPostId } : {}),
            ...(series ? { series } : {}),
            status: "accepted",
            clips: [],
            createdAt: new Date().toISOString(),
          };
          d.runs.unshift(run);
          return remember(run);
        })
      : mutation(
          "/api/quest-runs",
          {
            templateId: quest.id,
            outing,
            expectedCampaign: quest.sponsorCampaign || null,
            ...(inspiredByPostId ? { inspiredByPostId } : {}),
            ...(seriesPartId ? { seriesPartId } : {}),
          },
          key,
        ),
  abandon: async (id: string): Promise<void> => {
    if (!DEMO) {
      await mutation(`/api/quest-runs/${id}/abandon`, {});
      return;
    }
    await transaction((d) => {
      const r = d.runs.find((r) => r.id === id)!;
      r.status = "abandoned";
    });
  },
  saveClip: async (runId: string, clip: Clip): Promise<Run> =>
    DEMO
      ? transaction((d) => {
          const r = d.runs.find((r) => r.id === runId)!;
          r.clips = [...r.clips.filter((c) => c.slot !== clip.slot), clip].sort(
            (a, b) => a.slot - b.slot,
          );
          if (r.status === "accepted") r.status = "in_progress";
          return r;
        })
      : mutation(`/api/quest-runs/${runId}/clips`, { clip }),
  complete: async (
    id: string,
    declaration: string,
    key: string,
  ): Promise<Run> =>
    DEMO
      ? transaction((d) => {
          const r = d.runs.find((r) => r.id === id)!;
          if (r.status === "finalized") return r;
          if (
            !["accepted", "in_progress"].includes(r.status) ||
            r.clips.length !== 3 ||
            r.clips.some((c) => c.end - c.start < 5 || c.end - c.start > 15)
          )
            throw new Error(
              "Save three usable clips before completing your quest.",
            );
          if (!declaration.trim())
            throw new Error("Confirm your honest attempt first.");
          const reason = eligibility(d.runs, r.quest.familyId);
          r.rewardDecision = {
            ...(reason === "eligible" ? r.quest.award : { xp: 0, points: 0 }),
            reason,
          };
          r.status = "finalized";
          r.completedAt = new Date().toISOString();
          d.me.wallet.xp += r.rewardDecision.xp;
          d.me.wallet.points += r.rewardDecision.points;
          d.me.wallet.version++;
          return r;
        })
      : mutation(
          `/api/quest-runs/${id}/complete`,
          { declaration, confirmed: true },
          key,
        ),
  render: async (run: Run): Promise<Reel> => {
    if (!DEMO) return mutation(`/api/quest-runs/${run.id}/renders`, {});
    const previous = run.render?.status === "ready" ? run.render : undefined;
    const pending: Reel = {
      id: crypto.randomUUID(),
      status: "processing",
      startedAt: Date.now(),
    };
    if (!previous)
      await transaction((d) => {
        d.runs.find((r) => r.id === run.id)!.render = pending;
      });
    try {
      const reel = await request<Reel>("/api/local-media/renders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sidequest-Demo": "1",
        },
        body: JSON.stringify({
          version: 1,
          runId: run.id,
          revision: 1,
          outputId: pending.id,
          title: run.quest.title,
          ...(run.quest.sponsorDisclosure
            ? { sponsorDisclosure: run.quest.sponsorDisclosure }
            : {}),
          clips: run.clips.map((c) => ({
            assetId: c.id,
            start: c.start,
            end: c.end,
            mute: c.mute,
            fit: c.fit,
            crop: c.crop,
            label: c.caption,
          })),
        }),
      });
      await transaction((d) => {
        d.runs.find((r) => r.id === run.id)!.render = reel;
      });
      return reel;
    } catch (e) {
      await transaction((d) => {
        d.runs.find((r) => r.id === run.id)!.render = previous || {
          ...pending,
          status: "failed",
          error:
            "The reel could not be built. Your clips are saved. Start the local renderer and retry.",
        };
      });
      throw e;
    }
  },
  offers: async (): Promise<Offer[]> =>
    DEMO ? demoOffers : request("/api/rewards"),
  redemptions: async (): Promise<Redemption[]> =>
    DEMO ? [] : request("/api/redemptions"),
  redeem: async (
    offerId: string,
    offerVersion: number,
    key: string,
  ): Promise<Redemption> => {
    if (DEMO) throw new Error("Demo offers cannot be redeemed.");
    return mutation("/api/redemptions", { offerId, offerVersion }, key);
  },
  cancelRedemption: async (id: string) =>
    mutation(`/api/redemptions/${id}/cancel`, {}),
  redemptionToken: async (id: string) =>
    request<{ token: string }>(`/api/redemptions/${id}/token`),
  shareLinks: async (
    runId: string,
  ): Promise<
    {
      id: string;
      caption: string;
      createdAt: string;
      expiresAt: string;
    }[]
  > => (DEMO ? [] : request(`/api/quest-runs/${runId}/share-links`)),
  share: async (runId: string): Promise<{ id: string; url: string }> => {
    if (DEMO)
      throw new Error(
        "Hosted links need a connected deployment. Save your actual video locally instead.",
      );
    return mutation(`/api/quest-runs/${runId}/share`, {});
  },
  revokeShare: async (id: string) =>
    request(`/api/share-links/${id}`, { method: "DELETE" }),
  deleteRunMedia: async (id: string) => {
    if (!DEMO)
      return request(`/api/quest-runs/${id}/media`, { method: "DELETE" });
    await request(`/api/local-media/runs?runId=${id}`, {
      method: "DELETE",
      headers: { "X-Sidequest-Demo": "1" },
    });
    await transaction((d) => {
      const run = d.runs.find((r) => r.id === id)!;
      run.clips = [];
      run.render = undefined;
    });
  },
  deleteAccount: async () => {
    if (DEMO) {
      await request("/api/local-media/account", {
        method: "DELETE",
        headers: { "X-Sidequest-Demo": "1" },
      });
      resetDemoState();
      return;
    }
    await request("/api/me", { method: "DELETE" });
    await supabase?.auth.signOut();
  },
};
