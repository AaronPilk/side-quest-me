import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING, DEFAULT_PREFERENCES } from "../shared/domain";
import {
  originalQuestIdentity,
  type CommunityMe,
  type CommunityPost,
  type CommunityReadResults,
  type CreatorProfile,
  type LicenseOffer,
  type LicenseTerms,
  type OriginalDraft,
} from "../shared/community";
import {
  DEMO_POST_ID,
  demoInspiration,
  demoMutate,
  demoOriginalTemplates,
  demoRead,
  demoNotify,
} from "../src/lib/demo-community";
import { DEMO_PEOPLE, type DemoPersona } from "../src/lib/demo-identity";
import { withPartPublished } from "../shared/series";
import {
  demoSeriesMutate,
  demoSeriesStartFromRun,
} from "../src/lib/demo-series";
import type { Run } from "../src/lib/types";

vi.mock("../src/lib/auth", () => ({
  DEMO: true,
  accessToken: vi.fn(async () => undefined),
  supabase: null,
}));

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();
  get length() {
    return this.entries.size;
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, String(value));
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
}

const runId = "88888888-8888-4888-8888-888888888888";
const assetId = "99999999-9999-4999-8999-999999999999";
const privateProfileText =
  "Private imported summary: never include in a public response.";
const terms: LicenseTerms = {
  paymentMinor: 25000,
  currency: "USD",
  channels: ["paid_social", "website"],
  startDate: "2026-09-29",
  durationDays: 30,
  editingPermissions: "crop_captions",
  message: "Demo proposal; no real payment or advertising access.",
  platformFeeMinor: 1250,
};

function persona(value: DemoPersona) {
  localStorage.setItem("sidequest-demo-persona", value);
}
function keyFor(value: DemoPersona) {
  return value === "creator"
    ? "sidequest-demo-v1"
    : `sidequest-demo-v1:${value}`;
}
function readyRun(patch: Partial<Run> = {}): Run {
  return {
    id: runId,
    quest: structuredClone(catalog[0]),
    outing: { ...DEFAULT_OUTING },
    role: null,
    status: "finalized",
    clips: [],
    createdAt: "2026-09-29T10:00:00.000Z",
    completedAt: "2026-09-29T11:00:00.000Z",
    rewardDecision: { xp: 100, points: 10, reason: "demo" },
    render: {
      id: assetId,
      status: "ready",
      url: "/api/local-media/outputs/ready-fixture",
      thumbnailUrl: "/api/local-media/outputs/ready-fixture?thumbnail=1",
    },
    ...patch,
  };
}
function seedRuns(value: DemoPersona, runs: Run[]) {
  localStorage.setItem(
    keyFor(value),
    JSON.stringify({
      me: {
        profile: {
          displayName: DEMO_PEOPLE[value].name,
          summary: privateProfileText,
          preferences: DEFAULT_PREFERENCES,
          timezone: "UTC",
          locale: "en",
          onboardingCompleted: true,
        },
        wallet: { xp: 321, points: 45, version: 7 },
        roles: [],
      },
      runs,
    }),
  );
}
const me = () => demoRead<CommunityMe>("me");
const feed = () => demoRead<CommunityReadResults["feed"]>("feed");
const walletSnapshot = () =>
  Object.fromEntries(
    Object.keys(DEMO_PEOPLE).map((value) => [
      value,
      localStorage.getItem(keyFor(value as DemoPersona)),
    ]),
  );
async function approve(post: CommunityPost) {
  const previous = localStorage.getItem("sidequest-demo-persona") || "creator";
  const latest = demoRead<CommunityPost>("post", { id: post.id });
  if (latest.state !== "pending") {
    const { viewerFollowing: _viewerFollowing, ...post } = latest;
    return post;
  }
  persona("operator");
  try {
    return await demoMutate<CommunityPost>(
      "post_review",
      {
        id: latest.id,
        expectedVersion: latest.version,
        decision: "approve",
        notes: "Video, audio, caption and shared instructions reviewed.",
        reviewedContent: true,
      },
      crypto.randomUUID(),
    );
  } finally {
    persona(previous as DemoPersona);
  }
}
const publish = async (key: string = crypto.randomUUID()) =>
  approve(
    await demoMutate<CommunityPost>(
      "post_publish",
      {
        runId,
        assetId,
        caption: "Our version of this quest",
        brandOptIn: true,
      },
      key,
    ),
  );
const createOffer = (postId = DEMO_POST_ID) =>
  demoMutate<LicenseOffer>(
    "offer_create",
    { postId, terms },
    crypto.randomUUID(),
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("navigator", { language: "en-US" });
  for (const value of Object.keys(DEMO_PEOPLE))
    seedRuns(value as DemoPersona, []);
  persona("creator");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isolated demo publication", () => {
  it("keeps pending/rejected reels private, requires independent review, and sends every edit back through review", async () => {
    seedRuns("creator", [readyRun()]);
    const original = localStorage.getItem(keyFor("creator"));
    const input = {
      runId,
      assetId,
      caption: "Our finished outing",
      brandOptIn: true,
    };
    let post = await demoMutate<CommunityPost>(
      "post_publish",
      input,
      "first-submit",
    );
    expect(post.state).toBe("pending");
    expect(feed().posts).toHaveLength(1);
    expect(me().posts[0].state).toBe("pending");
    persona("viewer");
    expect(() => demoRead("post", { id: post.id })).toThrow("unavailable");
    await expect(
      demoMutate(
        "post_review",
        {
          id: post.id,
          expectedVersion: post.version,
          decision: "approve",
          reviewedContent: true,
          notes: "Trying without operator role.",
        },
        "forged-review",
      ),
    ).rejects.toThrow("Operator access");
    persona("operator");
    expect(
      demoRead<CommunityReadResults["operator"]>("operator").reviewPosts,
    ).toHaveLength(1);
    const pending = { ...post };
    post = await demoMutate<CommunityPost>(
      "post_review",
      {
        id: post.id,
        expectedVersion: post.version,
        decision: "reject",
        reviewedContent: true,
        notes: "Remove the private address from the caption.",
      },
      "reject-first",
    );
    expect(post.state).toBe("rejected");
    persona("creator");
    expect(
      demoRead<CommunityPost>("post", { id: post.id }).reviewNotes,
    ).toContain("private address");
    expect(
      (
        await demoMutate<CommunityPost>(
          "post_publish",
          input,
          "cannot-bypass-rejection",
        )
      ).state,
    ).toBe("rejected");
    post = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: "No identifying address",
        brandOptIn: true,
        published: true,
      },
      "resubmit",
    );
    post = await approve(post);
    expect(post.state).toBe("published");
    expect(feed().posts).toHaveLength(2);
    persona("operator");
    await expect(
      demoMutate(
        "post_review",
        {
          id: pending.id,
          expectedVersion: pending.version,
          decision: "approve",
          reviewedContent: true,
          notes: "Stale review must fail.",
        },
        "stale-review",
      ),
    ).rejects.toThrow("changed");
    persona("creator");
    post = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: "Another caption",
        brandOptIn: true,
        published: true,
      },
      "caption-review",
    );
    expect(post.state).toBe("pending");
    expect(feed().posts).toHaveLength(1);
    persona("brand");
    await expect(createOffer(post.id)).rejects.toThrow("not available");
    persona("creator");
    post = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: post.caption,
        brandOptIn: false,
        published: false,
      },
      "withdraw",
    );
    expect(post.state).toBe("unpublished");
    persona("operator");
    await expect(
      demoMutate(
        "post_review",
        {
          id: post.id,
          expectedVersion: post.version,
          decision: "approve",
          reviewedContent: true,
          notes: "Withdrawn content cannot be reviewed.",
        },
        "approve-withdrawn",
      ),
    ).rejects.toThrow("no longer awaiting");
    expect(localStorage.getItem(keyFor("creator"))).toBe(original);
  });

  it("publishes frozen Series attribution only when the part is public, without exposing personal progress", async () => {
    seedRuns("creator", [readyRun()]);
    const detail = demoSeriesStartFromRun({
      runId,
      title: "A three-part adventure",
      premise: "Find a different clue each time.",
      cover: "forest",
      kind: "ongoing",
    });
    const series = JSON.parse(localStorage.getItem(keyFor("creator"))!).runs[0]
      .series;
    expect(demoRead<CommunityReadResults["feed"]>("feed").posts).toHaveLength(
      1,
    );
    const post = await publish("publish-series-part");
    expect(post.series).toBeUndefined();
    persona("viewer");
    const privatePart = demoRead<CommunityPost>("post", { id: post.id });
    expect(privatePart.series).toBeUndefined();
    expect(JSON.stringify(privatePart)).not.toContain(series.title);
    persona("creator");
    const publication = withPartPublished(detail, detail.parts[0].id);
    publication.title = "The current display title";
    demoSeriesMutate("save", publication);
    persona("viewer");
    const visible = demoRead<CommunityPost>("post", { id: post.id });
    expect(visible.series).toEqual(series);
    expect(() =>
      demoInspiration(post.id, post.quest.id, series.partId),
    ).not.toThrow();
    expect(() =>
      demoInspiration(post.id, post.quest.id, crypto.randomUUID()),
    ).toThrow("different Series part");
    expect(JSON.stringify(visible)).not.toContain(privateProfileText);
    expect(visible).not.toHaveProperty("progress");
    expect(visible).not.toHaveProperty("outing");
  });

  it("deduplicates follow/series notifications and suppresses blocked senders", async () => {
    const owner = DEMO_PEOPLE.viewer.id,
      actor = DEMO_PEOPLE.creator.id;
    const notify = () =>
      demoNotify(
        owner,
        actor,
        "series_part_published",
        "part-1",
        "A new part is available.",
        "/series/test-series",
      );
    notify();
    notify();
    persona("viewer");
    let activity = demoRead<CommunityReadResults["activity"]>("activity");
    expect(activity.items).toHaveLength(1);
    expect(activity.items[0]).not.toHaveProperty("sourceKey");
    expect(activity.items[0]).not.toHaveProperty("actorId");
    await demoMutate(
      "block",
      { userId: actor, blocked: true },
      "block-series-sender",
    );
    notify();
    activity = demoRead<CommunityReadResults["activity"]>("activity");
    expect(activity.items).toHaveLength(0);
  });

  it("pages equal-timestamp posts without gaps, accepts offset cursors, and applies filters to every page", async () => {
    seedRuns("creator", [readyRun()]);
    const own = await publish("pagination-seed");
    const stored = JSON.parse(
      localStorage.getItem("sidequest-community-demo-v1")!,
    );
    const original = stored.posts.find(
      (item: CommunityPost) => item.id === own.id,
    );
    const ids = Array.from(
      { length: 65 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    stored.posts = ids.map((id, index) => ({
      ...original,
      id,
      createdAt: "2026-09-29T12:00:00.000Z",
      brandOptIn: index % 2 === 0,
    }));
    stored.creators[DEMO_PEOPLE.creator.id].openToBrands = true;
    localStorage.setItem("sidequest-community-demo-v1", JSON.stringify(stored));
    const first = feed();
    expect(first.posts).toHaveLength(30);
    expect(first.nextCursor).toBe(`2026-09-29T12:00:00.000Z|${ids[29]}`);
    const second = demoRead<CommunityReadResults["feed"]>("feed", {
      before: first.nextCursor!.replace("12:00:00.000Z", "08:00:00.000-04:00"),
    });
    const last = demoRead<CommunityReadResults["feed"]>("feed", {
      before: second.nextCursor,
    });
    expect(
      [...first.posts, ...second.posts, ...last.posts].map((item) => item.id),
    ).toEqual(ids);
    expect(last.nextCursor).toBeNull();
    const filters = { templateId: own.quest.id, brandOnly: true, limit: 30 };
    const branded = demoRead<CommunityReadResults["feed"]>("feed", filters);
    const brandedLast = demoRead<CommunityReadResults["feed"]>("feed", {
      ...filters,
      before: branded.nextCursor,
    });
    expect(
      [...branded.posts, ...brandedLast.posts].map((item) => item.id),
    ).toEqual(ids.filter((_, index) => index % 2 === 0));
    expect(brandedLast.nextCursor).toBeNull();
    expect(
      demoRead<CommunityReadResults["feed"]>("feed", {
        templateId: "different-quest",
      }).posts,
    ).toEqual([]);
    expect(
      demoRead<CommunityReadResults["feed"]>("feed", {
        before: "2026-09-29T12:00:00.000+00:00",
      }).posts,
    ).toEqual([]);
  });

  it("keeps the published exact reel through rerenders and hides copied playback URLs after private media deletion", async () => {
    seedRuns("creator", [readyRun()]);
    const profile = me().creator!;
    await demoMutate(
      "creator_save",
      {
        displayName: profile.displayName,
        avatarKey: profile.avatarKey,
        bio: profile.bio,
        openToBrands: true,
        expectedVersion: profile.version,
      },
      "open-own-brand-inquiries",
    );
    const post = await publish();
    persona("brand");
    const proposal = await createOffer(post.id);
    persona("creator");
    const accepted = await demoMutate<LicenseOffer>(
      "offer_respond",
      {
        id: proposal.id,
        expectedVersion: proposal.version,
        decision: "accept",
      },
      "accept-own-video-license",
    );
    persona("operator");
    await demoMutate(
      "offer_fulfill",
      {
        id: accepted.id,
        expectedVersion: accepted.version,
        paymentReference: "Simulated bank verification",
        permissionReference: "Simulated permissions verification",
        paid: true,
        permissionsConfirmed: true,
      },
      "fulfill-own-video-license",
    );
    seedRuns("creator", [
      readyRun({
        render: {
          id: crypto.randomUUID(),
          status: "ready",
          url: "/api/local-media/outputs/newer-version",
        },
      }),
    ]);
    expect(demoRead<CommunityPost>("post", { id: post.id }).mediaUrl).toBe(
      post.mediaUrl,
    );
    persona("brand");
    expect(demoRead<LicenseOffer>("offer", { id: proposal.id }).mediaUrl).toBe(
      post.mediaUrl,
    );

    persona("creator");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ deleted: true, demo: true })),
    );
    const { api } = await import("../src/lib/api");
    await api.deleteRunMedia(runId);
    expect(feed().posts.some((item) => item.id === post.id)).toBe(false);
    const ownPost = demoRead<CommunityPost>("post", { id: post.id });
    expect(ownPost.mediaUrl).toBe("");
    expect(ownPost.thumbnailUrl).toBe("");
    await expect(
      demoMutate(
        "post_update",
        {
          id: post.id,
          expectedVersion: post.version,
          caption: post.caption,
          brandOptIn: true,
          published: true,
        },
        "republish-deleted-reel",
      ),
    ).rejects.toThrow("deleted");
    persona("viewer");
    expect(() => demoRead("post", { id: post.id })).toThrow("unavailable");
    persona("brand");
    expect(
      demoRead<LicenseOffer>("offer", { id: proposal.id }).mediaUrl,
    ).toBeNull();
  });
  it("labels fixture content clearly and uses the real local media endpoint without private profile fields", () => {
    const first = feed().posts[0];
    expect(first.demo).toBe(true);
    expect(first.creator.demo).toBe(true);
    expect(first.caption).toContain("DEMO");
    expect(first.caption).toContain("Synthetic FFmpeg footage");
    expect(first.mediaUrl).toBe("/api/local-media/demo-reel");
    expect(first.thumbnailUrl).toBe("/api/local-media/demo-reel?thumbnail=1");
    expect(first.quest.id).toBe(catalog[0].id);
    const publicData = JSON.stringify(first);
    for (const hidden of [
      privateProfileText,
      "preferences",
      "ownerId",
      "assetId",
      "runId",
      "contactEmail",
    ])
      expect(publicData).not.toContain(hidden);
  });

  it("keeps completed reels private until explicit publication and persists caption/unpublish without deleting the original", async () => {
    seedRuns("creator", [readyRun()]);
    const privateBefore = localStorage.getItem(keyFor("creator"));
    expect(feed().posts).toHaveLength(1);
    const post = await publish("publish-once");
    expect(feed().posts).toHaveLength(2);
    const updated = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: "A caption edited after publishing",
        brandOptIn: false,
        published: true,
      },
      "edit-caption",
    );
    expect(demoRead<CommunityPost>("post", { id: post.id }).caption).toBe(
      updated.caption,
    );
    const unpublished = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: updated.version,
        caption: updated.caption,
        brandOptIn: false,
        published: false,
      },
      "unpublish-now",
    );
    expect(unpublished.state).toBe("unpublished");
    expect(feed().posts).toHaveLength(1);
    expect(localStorage.getItem(keyFor("creator"))).toBe(privateBefore);
    expect(demoRead<CommunityPost>("post", { id: post.id }).state).toBe(
      "unpublished",
    );
    vi.resetModules();
    const reloaded = await import("../src/lib/demo-community");
    expect(
      reloaded.demoRead<CommunityPost>("post", { id: post.id }),
    ).toMatchObject({
      state: "unpublished",
      caption: "A caption edited after publishing",
    });
    persona("viewer");
    expect(() => demoRead("post", { id: post.id })).toThrow("unavailable");
  });

  it("requires an owned finalized run with its exact ready rendered asset", async () => {
    for (const invalid of [
      readyRun({ status: "accepted" }),
      readyRun({ render: { id: assetId, status: "processing" } }),
      readyRun({
        render: {
          id: crypto.randomUUID(),
          status: "ready",
          url: "/api/local-media/wrong-asset",
        },
      }),
    ]) {
      seedRuns("creator", [invalid]);
      await expect(publish()).rejects.toThrow("Complete the quest");
      expect(feed().posts).toHaveLength(1);
    }
    seedRuns("creator", [readyRun()]);
    persona("viewer");
    await expect(publish()).rejects.toThrow("unavailable");
    persona("creator");
    const ownPost = await publish();
    persona("viewer");
    await expect(
      demoMutate(
        "post_update",
        {
          id: ownPost.id,
          expectedVersion: ownPost.version,
          caption: "Forged",
          brandOptIn: true,
          published: true,
        },
        "forged-update",
      ),
    ).rejects.toThrow("unavailable");
  });

  it("replays the same request and prevents duplicate publication even with a fresh key", async () => {
    seedRuns("creator", [readyRun()]);
    const first = await publish("same-publish-key");
    expect(await publish("same-publish-key")).toEqual(first);
    expect(await publish("another-publish-key")).toEqual(first);
    expect(me().posts).toHaveLength(1);
    await expect(
      demoMutate(
        "post_publish",
        {
          runId,
          assetId,
          caption: "Different intent",
          brandOptIn: false,
        },
        "same-publish-key",
      ),
    ).rejects.toThrow("different action");
  });
});

describe("reviewed original quests and inspiration", () => {
  it("does not allow an original-quest author to invent a sponsorship disclosure", async () => {
    const draft = await demoMutate<OriginalDraft>(
      "draft_save",
      {
        quest: {
          ...structuredClone(catalog[0]),
          sponsorDisclosure: "An unverified claimed sponsor",
        },
        expectedVersion: 0,
      },
      "strip-draft-sponsor",
    );
    expect(draft.quest.sponsorDisclosure).toBeUndefined();
    expect(
      demoRead<OriginalDraft>("draft", { id: draft.id }).quest
        .sponsorDisclosure,
    ).toBeUndefined();
  });
  it("keeps originals private until operator approval and makes the canonical approved version available", async () => {
    const quest = {
      ...structuredClone(catalog[0]),
      title: "Demo original: the miniature premiere",
    };
    const draft = await demoMutate<OriginalDraft>(
      "draft_save",
      { quest, expectedVersion: 0 },
      "save-original",
    );
    expect(draft.quest).toMatchObject(originalQuestIdentity(draft.id));
    expect(demoOriginalTemplates()).toEqual([]);
    const submitted = await demoMutate<OriginalDraft>(
      "draft_submit",
      { id: draft.id, expectedVersion: draft.version },
      "submit-original",
    );
    expect(
      await demoMutate(
        "draft_submit",
        { id: draft.id, expectedVersion: draft.version },
        "submit-original",
      ),
    ).toEqual(submitted);
    expect(demoOriginalTemplates()).toEqual([]);
    await expect(
      demoMutate(
        "draft_review",
        {
          id: draft.id,
          expectedVersion: submitted.version,
          decision: "approve",
          notes: "Reviewed",
        },
        "forged-review",
      ),
    ).rejects.toThrow("Operator");
    persona("operator");
    expect(
      demoRead<CommunityReadResults["operator"]>("operator").drafts,
    ).toHaveLength(1);
    const approved = await demoMutate<OriginalDraft>(
      "draft_review",
      {
        id: draft.id,
        expectedVersion: submitted.version,
        decision: "approve",
        notes: "Instructions and permissions checked.",
      },
      "approve-original",
    );
    expect(approved.state).toBe("approved");
    expect(approved.templateId).toBe(approved.quest.id);
    expect(demoOriginalTemplates()).toEqual([approved.quest]);
    const { api } = await import("../src/lib/api");
    expect(await api.quest(approved.quest.id)).toEqual(approved.quest);
    persona("viewer");
    const publicCreator = demoRead<CommunityReadResults["creator"]>("creator", {
      id: DEMO_PEOPLE.creator.id,
    });
    expect(publicCreator.creator.authoredCount).toBe(1);
    expect(publicCreator.quests).toEqual([approved.quest]);
    const candidates = await api.quests(
      { ...DEFAULT_OUTING },
      approved.quest.id,
    );
    expect(candidates).toHaveLength(1);
    const attempt = await api.accept(
      candidates[0],
      { ...DEFAULT_OUTING },
      "accept-reviewed-original",
    );
    expect(attempt.quest).toEqual(approved.quest);
    expect(attempt.quest.beats).toEqual(quest.beats);
    expect(
      JSON.parse(localStorage.getItem(keyFor("viewer"))!).runs[0].quest,
    ).toEqual(approved.quest);
    vi.resetModules();
    const reloadedApi = (await import("../src/lib/api")).api;
    expect((await reloadedApi.run(attempt.id)).quest).toEqual(approved.quest);
    persona("creator");
    expect(
      demoRead<CommunityReadResults["activity"]>("activity").items.some(
        (item) => item.kind === "quest_reviewed",
      ),
    ).toBe(true);
  });

  it("derives attribution, notifications and counts from a distinct stored inspired attempt", async () => {
    const source = feed().posts[0];
    const before = feed().posts[0].attemptCount;
    demoInspiration(source.id, source.quest.id);
    expect(() =>
      demoInspiration(source.id, source.quest.id, crypto.randomUUID()),
    ).toThrow("different Series part");
    expect(() => demoInspiration(source.id, catalog[3].id)).toThrow(
      "different quest",
    );
    seedRuns("creator", [
      readyRun({
        status: "accepted",
        render: undefined,
        inspiredByPostId: source.id,
      }),
    ]);
    expect(
      demoRead<CommunityPost>("post", { id: source.id }).attemptCount,
    ).toBe(before + 1);
    persona("viewer");
    const activity = demoRead<CommunityReadResults["activity"]>("activity");
    const inspired = activity.items.find(
      (item) => item.kind === "inspired_attempt",
    )!;
    expect(inspired.id).toBe(runId);
    expect(inspired.href).toBe(`/posts/${source.id}`);
    expect(activity.unreadCount).toBe(1);
    await demoMutate("activity_read", { id: inspired.id }, "read-inspiration");
    expect(
      demoRead<CommunityReadResults["activity"]>("activity").unreadCount,
    ).toBe(0);
    expect(demoRead<CommunityPost>("post", { id: source.id }).id).toBe(
      source.id,
    );
  });

  it("counts attempts inspired by a creator's posts rather than the creator's unrelated private runs", () => {
    seedRuns("creator", [readyRun({ inspiredByPostId: DEMO_POST_ID })]);
    seedRuns("viewer", [
      readyRun({ id: crypto.randomUUID(), inspiredByPostId: DEMO_POST_ID }),
      readyRun({ id: crypto.randomUUID(), inspiredByPostId: undefined }),
    ]);
    const viewer = demoRead<CommunityReadResults["creator"]>("creator", {
      id: DEMO_PEOPLE.viewer.id,
    });
    const own = demoRead<CommunityReadResults["creator"]>("creator", {
      id: DEMO_PEOPLE.creator.id,
    });
    expect(viewer.creator.attemptCount).toBe(2);
    expect(viewer.posts[0].attemptCount).toBe(2);
    expect(own.creator.attemptCount).toBe(0);
  });
});

describe("durable demo acceptance receipts", () => {
  it("returns the original attempt for the same key after abandonment without creating a duplicate", async () => {
    const { api } = await import("../src/lib/api");
    const [quest] = await api.quests({ ...DEFAULT_OUTING }, catalog[0].id);
    const attempt = await api.accept(
      quest,
      { ...DEFAULT_OUTING },
      "durable-accept-key",
      DEMO_POST_ID,
    );
    await api.abandon(attempt.id);
    vi.resetModules();
    const freshApi = (await import("../src/lib/api")).api;
    const replay = await freshApi.accept(
      quest,
      Object.fromEntries(
        Object.entries(DEFAULT_OUTING).reverse(),
      ) as typeof DEFAULT_OUTING,
      "durable-accept-key",
      DEMO_POST_ID,
    );
    expect(replay.id).toBe(attempt.id);
    const runs = await freshApi.runs();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: attempt.id,
      status: "abandoned",
      inspiredByPostId: DEMO_POST_ID,
    });
    expect(
      demoRead<CommunityPost>("post", { id: DEMO_POST_ID }).attemptCount,
    ).toBe(1);
  });

  it.each(["outing", "quest", "inspiration"])(
    "rejects changed %s intent when an acceptance key is reused",
    async (change) => {
      const { api } = await import("../src/lib/api");
      // This receipt regression targets the original quest explicitly; new
      // catalog entries may legitimately occupy the three recommendation slots.
      const [quest] = await api.quests({ ...DEFAULT_OUTING }, catalog[0].id);
      const [alternative] = await api.quests(
        { ...DEFAULT_OUTING },
        "date_menu_draft_chill_v1",
      );
      const attempt = await api.accept(
        quest,
        { ...DEFAULT_OUTING },
        "intent-bound-key",
      );
      await api.abandon(attempt.id);
      await expect(
        api.accept(
          change === "quest" ? alternative : quest,
          {
            ...DEFAULT_OUTING,
            ...(change === "outing" ? { budgetMinor: 500 } : {}),
          },
          "intent-bound-key",
          change === "inspiration" ? DEMO_POST_ID : undefined,
        ),
      ).rejects.toThrow();
      expect((await api.runs()).map((item) => item.id)).toEqual([attempt.id]);
    },
  );
});

describe("manual demo licensing", () => {
  it.each(["unpublished", "unapproved"])(
    "blocks counters when the current video or business is %s",
    async (condition) => {
      persona("brand");
      const offer = await createOffer();
      const brand = me().brand!;
      if (condition === "unpublished") {
        persona("viewer");
        const post = demoRead<CommunityPost>("post", { id: DEMO_POST_ID });
        await demoMutate(
          "post_update",
          {
            id: post.id,
            expectedVersion: post.version,
            caption: post.caption,
            brandOptIn: true,
            published: false,
          },
          "unpublish-before-counter",
        );
      } else {
        persona("operator");
        await demoMutate(
          "brand_review",
          {
            id: brand.id,
            expectedVersion: brand.version,
            decision: "reject",
            notes: "Approval withdrawn.",
          },
          "revoke-before-counter",
        );
      }
      persona("viewer");
      await expect(
        demoMutate(
          "offer_respond",
          {
            id: offer.id,
            expectedVersion: offer.version,
            decision: "counter",
            terms: { ...terms, paymentMinor: 30000 },
          },
          "counter-unavailable",
        ),
      ).rejects.toThrow();
      expect(
        demoRead<LicenseOffer>("offer", { id: offer.id }).history,
      ).toHaveLength(1);
    },
  );
  it("requires separate per-video and creator opt-ins, approved brand status, and enforces blocking", async () => {
    persona("viewer");
    const post = demoRead<CommunityPost>("post", { id: DEMO_POST_ID });
    const off = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: post.caption,
        brandOptIn: false,
        published: true,
      },
      "opt-out-video",
    );
    persona("brand");
    await expect(createOffer()).rejects.toThrow("not available");
    persona("viewer");
    const optedIn = await demoMutate<CommunityPost>(
      "post_update",
      {
        id: off.id,
        expectedVersion: off.version,
        caption: off.caption,
        brandOptIn: true,
        published: true,
      },
      "opt-in-video",
    );
    await approve(optedIn);
    const creator = me().creator!;
    const profile = await demoMutate<CreatorProfile>(
      "creator_save",
      {
        displayName: creator.displayName,
        avatarKey: creator.avatarKey,
        bio: creator.bio,
        openToBrands: false,
        expectedVersion: creator.version,
      },
      "opt-out-profile",
    );
    persona("brand");
    await expect(createOffer()).rejects.toThrow("not available");
    persona("viewer");
    await demoMutate(
      "creator_save",
      {
        displayName: profile.displayName,
        avatarKey: profile.avatarKey,
        bio: profile.bio,
        openToBrands: true,
        expectedVersion: profile.version,
      },
      "opt-in-profile",
    );
    await demoMutate(
      "block",
      { userId: DEMO_PEOPLE.brand.id, blocked: true },
      "block-brand",
    );
    persona("brand");
    expect(feed().posts).toEqual([]);
    expect(() => demoRead("creator", { id: DEMO_PEOPLE.viewer.id })).toThrow(
      "unavailable",
    );
    await expect(createOffer()).rejects.toThrow("not available");
    persona("creator");
    await expect(createOffer()).rejects.toThrow("approved business");
  });

  it("preserves counteroffer terms and explicit fees, waits for verified fulfillment, and never mutates reward balances", async () => {
    const walletBefore = walletSnapshot();
    persona("brand");
    const proposed = await createOffer();
    expect(proposed.state).toBe("proposed");
    expect(proposed.fulfillment).toBeNull();
    expect(proposed.terms.platformFeeMinor).toBe(1250);
    await expect(createOffer()).rejects.toThrow("already an open offer");
    persona("viewer");
    const counterTerms = {
      ...terms,
      paymentMinor: 30000,
      platformFeeMinor: 1700,
      durationDays: 14,
      editingPermissions: "none" as const,
    };
    const countered = await demoMutate<LicenseOffer>(
      "offer_respond",
      {
        id: proposed.id,
        expectedVersion: proposed.version,
        decision: "counter",
        terms: counterTerms,
      },
      "counter-offer",
    );
    expect(countered.history).toHaveLength(2);
    expect(countered.history[0].terms).toEqual(terms);
    expect(countered.history[1].terms).toEqual(counterTerms);
    persona("brand");
    await expect(
      demoMutate(
        "offer_respond",
        {
          id: proposed.id,
          expectedVersion: proposed.version,
          decision: "accept",
        },
        "stale-accept",
      ),
    ).rejects.toThrow("changed");
    const accepted = await demoMutate<LicenseOffer>(
      "offer_respond",
      {
        id: proposed.id,
        expectedVersion: countered.version,
        decision: "accept",
      },
      "accept-counter",
    );
    expect(accepted.state).toBe("pending_fulfillment");
    expect(accepted.acceptedTerms).toEqual(counterTerms);
    expect(accepted.fulfillment).toBeNull();
    expect(accepted.mediaUrl).toBeNull();
    expect(
      demoRead<LicenseOffer>("offer", { id: accepted.id }).mediaUrl,
    ).toBeNull();
    const evidence = {
      id: accepted.id,
      expectedVersion: accepted.version,
      paymentReference: "SIMULATED external payment verification",
      permissionReference: "SIMULATED signed permissions checked",
      paid: true,
      permissionsConfirmed: true,
    };
    await expect(
      demoMutate("offer_fulfill", evidence, "forged-fulfillment"),
    ).rejects.toThrow("Operator");
    persona("operator");
    const completed = await demoMutate<LicenseOffer>(
      "offer_fulfill",
      evidence,
      "fulfill-once",
    );
    expect(await demoMutate("offer_fulfill", evidence, "fulfill-once")).toEqual(
      completed,
    );
    expect(completed.state).toBe("completed");
    expect(completed.acceptedTerms).toEqual(counterTerms);
    expect(completed.fulfillment?.usageStartsAt).toBe(
      "2026-09-29T00:00:00.000Z",
    );
    expect(completed.fulfillment?.usageEndsAt).toBe("2026-10-13T00:00:00.000Z");
    persona("brand");
    expect(demoRead<LicenseOffer>("offer", { id: completed.id }).mediaUrl).toBe(
      "/api/local-media/demo-reel",
    );
    persona("viewer");
    expect(
      demoRead<LicenseOffer>("offer", { id: completed.id }).mediaUrl,
    ).toBeNull();
    persona("brand");
    vi.setSystemTime(new Date("2026-10-13T00:00:00.000Z"));
    expect(
      demoRead<LicenseOffer>("offer", { id: completed.id }).mediaUrl,
    ).toBeNull();
    expect(walletSnapshot()).toEqual(walletBefore);
  });

  it("keeps private offers inaccessible to outsiders and supports decline without fulfillment", async () => {
    persona("brand");
    const offer = await createOffer();
    persona("creator");
    expect(() => demoRead("offer", { id: offer.id })).toThrow("unavailable");
    await expect(
      demoMutate(
        "offer_respond",
        { id: offer.id, expectedVersion: offer.version, decision: "accept" },
        "outsider-accept",
      ),
    ).rejects.toThrow("someone else");
    expect(() => demoRead("operator")).toThrow("Operator");
    persona("viewer");
    const declined = await demoMutate<LicenseOffer>(
      "offer_respond",
      { id: offer.id, expectedVersion: offer.version, decision: "decline" },
      "decline-offer",
    );
    expect(declined.state).toBe("declined");
    expect(declined.acceptedTerms).toBeNull();
    expect(declined.fulfillment).toBeNull();
    persona("operator");
    await expect(
      demoMutate(
        "offer_fulfill",
        {
          id: offer.id,
          expectedVersion: declined.version,
          paymentReference: "Not paid",
          permissionReference: "Not permitted",
          paid: true,
          permissionsConfirmed: true,
        },
        "fulfill-declined",
      ),
    ).rejects.toThrow("Mutually accepted");
  });

  it("rejects offer acceptance after the creator unpublishes the requested video", async () => {
    persona("brand");
    const offer = await createOffer();
    persona("viewer");
    const post = demoRead<CommunityPost>("post", { id: DEMO_POST_ID });
    await demoMutate(
      "post_update",
      {
        id: post.id,
        expectedVersion: post.version,
        caption: post.caption,
        brandOptIn: true,
        published: false,
      },
      "unpublish-before-accept",
    );
    await expect(
      demoMutate(
        "offer_respond",
        { id: offer.id, expectedVersion: offer.version, decision: "accept" },
        "accept-unpublished",
      ),
    ).rejects.toThrow();
  });

  it("rechecks business approval before an operator records fulfillment", async () => {
    persona("brand");
    const offer = await createOffer();
    const brand = me().brand!;
    persona("viewer");
    const accepted = await demoMutate<LicenseOffer>(
      "offer_respond",
      { id: offer.id, expectedVersion: offer.version, decision: "accept" },
      "accept-before-review",
    );
    persona("operator");
    await demoMutate(
      "brand_review",
      {
        id: brand.id,
        expectedVersion: brand.version,
        decision: "reject",
        notes: "Simulated approval revoked before fulfillment.",
      },
      "revoke-business",
    );
    await expect(
      demoMutate(
        "offer_fulfill",
        {
          id: accepted.id,
          expectedVersion: accepted.version,
          paymentReference: "Demo verification",
          permissionReference: "Demo permissions",
          paid: true,
          permissionsConfirmed: true,
        },
        "fulfill-revoked-brand",
      ),
    ).rejects.toThrow("approved business");
    expect(demoRead<LicenseOffer>("offer", { id: offer.id }).state).toBe(
      "pending_fulfillment",
    );
  });

  it("prevents an operator who owns the licensed video from verifying their own transaction", async () => {
    persona("operator");
    seedRuns("operator", [readyRun()]);
    const profile = me().creator!;
    await demoMutate(
      "creator_save",
      {
        displayName: profile.displayName,
        avatarKey: profile.avatarKey,
        bio: profile.bio,
        openToBrands: true,
        expectedVersion: profile.version,
      },
      "operator-open-to-brands",
    );
    const post = await demoMutate<CommunityPost>(
      "post_publish",
      { runId, assetId, caption: "An operator's own reel", brandOptIn: true },
      "operator-publish",
    );
    await expect(
      demoMutate(
        "post_review",
        {
          id: post.id,
          expectedVersion: post.version,
          decision: "approve",
          notes: "Self approval is forbidden.",
          reviewedContent: true,
        },
        "operator-self-approve",
      ),
    ).rejects.toThrow("Another operator");
    // This demo has one operator identity. Install an independently reviewed
    // fixture to exercise the separate transaction self-fulfillment rule.
    const fixture = JSON.parse(
      localStorage.getItem("sidequest-community-demo-v1")!,
    );
    const reviewed = fixture.posts.find(
      (item: CommunityPost) => item.id === post.id,
    );
    reviewed.state = "published";
    reviewed.approvedVersion = reviewed.version;
    localStorage.setItem(
      "sidequest-community-demo-v1",
      JSON.stringify(fixture),
    );
    persona("brand");
    const offer = await createOffer(post.id);
    persona("operator");
    const accepted = await demoMutate<LicenseOffer>(
      "offer_respond",
      { id: offer.id, expectedVersion: offer.version, decision: "accept" },
      "operator-accept-own",
    );
    await expect(
      demoMutate(
        "offer_fulfill",
        {
          id: accepted.id,
          expectedVersion: accepted.version,
          paymentReference: "Demo self-payment claim",
          permissionReference: "Demo self-permission",
          paid: true,
          permissionsConfirmed: true,
        },
        "operator-self-fulfill",
      ),
    ).rejects.toThrow("independent operator");
  });

  it("lets operator moderation suspend commercial access while preserving the published original", async () => {
    persona("brand");
    const offer = await createOffer();
    persona("viewer");
    const accepted = await demoMutate<LicenseOffer>(
      "offer_respond",
      { id: offer.id, expectedVersion: offer.version, decision: "accept" },
      "accept-to-moderate",
    );
    persona("operator");
    const completed = await demoMutate<LicenseOffer>(
      "offer_fulfill",
      {
        id: accepted.id,
        expectedVersion: accepted.version,
        paymentReference: "Demo payment checked",
        permissionReference: "Demo permissions checked",
        paid: true,
        permissionsConfirmed: true,
      },
      "complete-to-moderate",
    );
    persona("brand");
    expect(
      demoRead<LicenseOffer>("offer", { id: offer.id }).mediaUrl,
    ).not.toBeNull();
    await expect(
      demoMutate(
        "offer_moderate",
        {
          id: offer.id,
          expectedVersion: completed.version,
          reason: "Forged operator action",
        },
        "brand-forged-moderation",
      ),
    ).rejects.toThrow("Operator");
    persona("operator");
    const suspended = await demoMutate<LicenseOffer>(
      "offer_moderate",
      {
        id: offer.id,
        expectedVersion: completed.version,
        reason: "Demo report requires review",
      },
      "suspend-commercial-use",
    );
    expect(suspended.suspended).toBe(true);
    expect(suspended.acceptedTerms).toEqual(terms);
    persona("brand");
    expect(
      demoRead<LicenseOffer>("offer", { id: offer.id }).mediaUrl,
    ).toBeNull();
    expect(feed().posts.some((post) => post.id === DEMO_POST_ID)).toBe(true);
  });
});
