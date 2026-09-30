import { catalog } from "../../shared/catalog";
import {
  deriveSeriesProgress,
  seriesSaveSchema,
  type SeriesContext,
  type SeriesDetail,
  type SeriesPart,
  type SeriesSave,
  type SeriesSummary,
  type SeriesTemplate,
} from "../../shared/series";
import type { CreatorProfile } from "../../shared/community";
import { demoActor, demoDataKey } from "./demo-identity";
import { demoRead, demoOriginalTemplates, demoNotify } from "./demo-community";
import type { Run } from "./types";
export const DEMO_SERIES_KEY = "sidequest-series-demo-v1";
type Stored = Omit<
  SeriesSummary,
  "following" | "followerCount" | "publishedPartCount" | "partCount"
> & { parts: SeriesPart[]; lockedPartIds: string[]; everPublished: boolean };
type State = {
  series: Stored[];
  follows: { seriesId: string; actorId: string }[];
  receipts: Record<string, { fingerprint: string; result: SeriesDetail }>;
};
const load = (): State =>
  JSON.parse(localStorage.getItem(DEMO_SERIES_KEY) || "null") ?? {
    series: [],
    follows: [],
    receipts: {},
  };
function save(state: State) {
  localStorage.setItem(DEMO_SERIES_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("sidequest-change"));
}
function creator(id: string) {
  return demoRead<{ creator: CreatorProfile }>("creator", { id }).creator;
}
function accessible(id: string) {
  try {
    return Boolean(creator(id));
  } catch {
    return false;
  }
}
function runs(): Run[] {
  return JSON.parse(localStorage.getItem(demoDataKey()) || "null")?.runs ?? [];
}
export function demoSeriesTemplates(): SeriesTemplate[] {
  return [...catalog, ...demoOriginalTemplates()].map(
    ({ id, title, version, category, intensity }) => ({
      id,
      title,
      version,
      category,
      intensity,
    }),
  );
}
function summary(state: State, s: Stored): SeriesSummary {
  const actor = demoActor().id;
  return {
    id: s.id,
    authorId: s.authorId,
    authorName: creator(s.authorId).displayName,
    title: s.title,
    premise: s.premise,
    cover: s.cover,
    kind: s.kind,
    state: s.state,
    version: s.version,
    partCount: s.parts.filter((p) => p.published || s.authorId === actor)
      .length,
    publishedPartCount: s.parts.filter((p) => p.published).length,
    following: state.follows.some(
      (f) => f.seriesId === s.id && f.actorId === actor,
    ),
    followerCount: state.follows.filter(
      (f) => f.seriesId === s.id && accessible(f.actorId),
    ).length,
    createdAt: s.createdAt,
  };
}
export function demoSeriesList(
  creatorId?: string,
  mine = false,
): SeriesSummary[] {
  const state = load(),
    actor = demoActor().id;
  return state.series
    .filter(
      (s) =>
        accessible(s.authorId) &&
        (mine ? s.authorId === actor : s.state === "published") &&
        (!creatorId || s.authorId === creatorId),
    )
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    )
    .map((s) => summary(state, s));
}
export function demoSeriesDetail(id: string, ownRuns = runs()): SeriesDetail {
  const state = load(),
    s = state.series.find((item) => item.id === id),
    actor = demoActor().id;
  if (
    !s ||
    !accessible(s.authorId) ||
    (s.state !== "published" && s.authorId !== actor)
  )
    throw new Error("This series is not available.");
  const completed = new Set(
    ownRuns
      .filter((r) => r.status === "finalized" && r.series?.id === id)
      .map((r) => r.series!.partId),
  );
  const templates = new Map(
    demoSeriesTemplates().map((t) => [t.id, t.version]),
  );
  const parts = s.parts
    .filter((p) => p.published || s.authorId === actor)
    .map((p) => {
      const unavailableReason =
        s.state !== "published" || !p.published
          ? "This part is still a draft."
          : !templates.has(p.templateId)
            ? "This quest is no longer available."
            : templates.get(p.templateId) !== p.templateVersion
              ? "This part’s original quest version is no longer available."
              : p.prerequisitePartId && !completed.has(p.prerequisitePartId)
                ? `Complete the required earlier part: ${p.prerequisiteReason}`
                : null;
      return {
        ...p,
        locked: s.lockedPartIds.includes(p.id),
        available: !unavailableReason,
        unavailableReason,
      };
    });
  const result: SeriesDetail = {
    ...summary(state, s),
    parts,
    progress: null,
    isOwner: s.authorId === actor,
  };
  result.progress = deriveSeriesProgress(result, ownRuns);
  return result;
}
export function demoSeriesPart(id: string, ownRuns = runs()) {
  const s = load().series.find((s) => s.parts.some((p) => p.id === id));
  if (!s) throw new Error("This series part is not available.");
  const detail = demoSeriesDetail(s.id, ownRuns),
    part = detail.parts.find((p) => p.id === id);
  if (!part) throw new Error("This series part is not available.");
  const {
    parts: _parts,
    progress: _progress,
    isOwner: _owner,
    ...series
  } = detail;
  void _parts;
  void _progress;
  void _owner;
  return {
    series,
    part,
    canStart: part.available,
    reason: part.unavailableReason,
  };
}
export function demoValidateSeriesPart(
  partId: string,
  templateId: string,
  ownRuns: Run[],
): SeriesContext {
  const { series, part, canStart, reason } = demoSeriesPart(partId, ownRuns);
  if (!canStart) throw new Error(reason || "This part is not available.");
  if (part.templateId !== templateId)
    throw new Error(
      "This part belongs to a different quest version. Open the series again.",
    );
  return {
    id: series.id,
    title: series.title,
    partId: part.id,
    partTitle: part.title,
    position: part.position,
  };
}
export function demoSeriesMutate(
  action: "save" | "follow",
  input: unknown,
  key = crypto.randomUUID(),
): SeriesDetail {
  const state = load(),
    actor = demoActor().id,
    receiptKey = `${actor}:${action}:${key}`,
    fingerprint = JSON.stringify(input),
    cached = state.receipts[receiptKey];
  if (cached) {
    if (cached.fingerprint !== fingerprint)
      throw new Error("This request key was already used for another change.");
    return structuredClone(cached.result);
  }
  let id: string;
  if (action === "follow") {
    const follow = input as { id: string; following: boolean };
    demoSeriesDetail(follow.id);
    id = follow.id;
    if (!state.series.find((s) => s.id === id && s.state === "published"))
      throw new Error("This series is not available.");
    state.follows = state.follows.filter(
      (f) => f.seriesId !== id || f.actorId !== actor,
    );
    if (follow.following) state.follows.push({ seriesId: id, actorId: actor });
  } else {
    const parsed: SeriesSave = seriesSaveSchema.parse(input);
    const author = creator(actor);
    id = parsed.id ?? crypto.randomUUID();
    const old = state.series.find((s) => s.id === id);
    if (old && old.authorId !== actor)
      throw new Error("Only the author can edit this series.");
    if ((old?.version ?? 0) !== parsed.expectedVersion)
      throw new Error("This series changed. Refresh before saving again.");
    if (
      old?.everPublished &&
      (old.kind !== parsed.kind ||
        (old.kind === "finite" && old.parts.length !== parsed.parts.length))
    )
      throw new Error(
        "A published finite series keeps its planned parts and type.",
      );
    for (const locked of old?.lockedPartIds ?? []) {
      const before = old!.parts.find((p) => p.id === locked),
        after = parsed.parts.find((p) => p.id === locked),
        position = parsed.parts.findIndex((p) => p.id === locked) + 1;
      if (
        !after ||
        !before ||
        JSON.stringify([
          before.title,
          before.templateId,
          before.prerequisitePartId,
          before.prerequisiteReason,
          before.position,
        ]) !==
          JSON.stringify([
            after.title,
            after.templateId,
            after.prerequisitePartId,
            after.prerequisiteReason,
            position,
          ])
      )
        throw new Error(
          "Published parts keep their identity, order, and requirements.",
        );
    }
    const templates = [...catalog, ...demoOriginalTemplates()];
    const parts: SeriesPart[] = parsed.parts.map((part, index) => {
      const locked = Boolean(old?.lockedPartIds.includes(part.id));
      const before = locked
        ? old?.parts.find((p) => p.id === part.id)
        : undefined;
      const quest =
        before?.quest ?? templates.find((t) => t.id === part.templateId);
      if (!quest)
        throw new Error("Choose an available reviewed quest for every part.");
      if (
        state.series.some(
          (s) => s.id !== id && s.parts.some((p) => p.id === part.id),
        )
      )
        throw new Error("A part belongs to another series.");
      return {
        ...part,
        position: index + 1,
        locked,
        templateVersion: before?.templateVersion ?? quest.version,
        quest,
        available: false,
        unavailableReason: null,
      };
    });
    const lockedPartIds = [
      ...new Set([
        ...(old?.lockedPartIds ?? []),
        ...(parsed.state === "published"
          ? parts.filter((p) => p.published).map((p) => p.id)
          : []),
      ]),
    ];
    const stored: Stored = {
      id,
      authorId: actor,
      authorName: author.displayName,
      title: parsed.title,
      premise: parsed.premise,
      cover: parsed.cover,
      kind: parsed.kind,
      state: parsed.state,
      version: (old?.version ?? 0) + 1,
      createdAt: old?.createdAt ?? new Date().toISOString(),
      parts,
      lockedPartIds,
      everPublished: Boolean(
        old?.everPublished || parsed.state === "published",
      ),
    };
    state.series = state.series.filter((s) => s.id !== id);
    state.series.push(stored);
    for (const partId of lockedPartIds.filter(
      (p) => !old?.lockedPartIds.includes(p),
    ))
      for (const follower of state.follows.filter((f) => f.seriesId === id))
        demoNotify(
          follower.actorId,
          actor,
          "series_part_published",
          partId,
          `A new part of ${parsed.title} is available.`,
          `/series/${id}`,
        );
  }
  save(state);
  const result = demoSeriesDetail(id);
  state.receipts[receiptKey] = { fingerprint, result: structuredClone(result) };
  save(state);
  return result;
}

/** Blocking removes the relationship, so unblocking does not silently refollow. */
export function clearDemoSeriesFollowsForBlock(first: string, second: string) {
  const state = load();
  const authors = new Map(state.series.map((s) => [s.id, s.authorId]));
  state.follows = state.follows.filter(
    (f) =>
      !(
        (f.actorId === first && authors.get(f.seriesId) === second) ||
        (f.actorId === second && authors.get(f.seriesId) === first)
      ),
  );
  save(state);
}
