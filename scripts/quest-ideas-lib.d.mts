import type { QuestIdea } from "../shared/quest-ideas";

export type SuggestedTags = {
  category:
    "date_night" | "daytime" | "late_night" | "street_challenges" | "demon";
  intensity: "chill" | "bold" | "full_send";
  scope: "moment" | "session" | "outing" | "expedition";
  settings: string[];
  themes: string[];
  interests: string[];
  conflicts: string[];
  flags: string[];
};
export type RawIdea = {
  id?: string;
  idea?: string;
  text?: string;
  source?: string;
  sourceUrl?: string;
  notes?: string;
};
export type IdeaCandidate = {
  id: string;
  text: string;
  source: string;
  sourceUrl: string;
  alsoFrom: string[];
  suggested: SuggestedTags;
  covered: string | null;
  closest: { id: string; score: number } | null;
  status: "new" | "covered" | "needs_review";
};
export type IngestResult = {
  candidates: IdeaCandidate[];
  duplicates: { id: string | undefined; of: string; text: string }[];
  summary: {
    raw: number;
    unique: number;
    duplicates: number;
    covered: number;
    needsReview: number;
    new: number;
  };
};
export function tokens(text: string): Set<string>;
export function similarity(a: string, b: string): number;
export function normalizeIdea(text: string): string;
export function suggestTags(text: string): SuggestedTags;
export function ingest(
  rawPool: RawIdea[],
  library: QuestIdea[],
  options?: { threshold?: number },
): IngestResult;
