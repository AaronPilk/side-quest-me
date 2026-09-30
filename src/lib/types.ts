import type { Outing, Profile, QuestVariant } from "../../shared/domain";
import type { SeriesContext } from "../../shared/series";
export type Clip = {
  mode?: "session";
  id: string;
  generation: number;
  slot: number;
  duration: number;
  start: number;
  end: number;
  mime: string;
  previewUrl: string;
  fit: "fit" | "fill";
  crop: number;
  mute: boolean;
  caption: string;
};
export type Reel = {
  id: string;
  status: "queued" | "processing" | "ready" | "failed" | "canceled";
  url?: string;
  thumbnailUrl?: string;
  error?: string;
  startedAt?: number;
};
export type Run = {
  id: string;
  quest: QuestVariant;
  outing: Outing;
  role: string | null;
  status:
    "accepted" | "in_progress" | "review_needed" | "finalized" | "abandoned";
  clips: Clip[];
  createdAt: string;
  completedAt?: string;
  inspiredByPostId?: string;
  series?: SeriesContext;
  rewardDecision?: { xp: number; points: number; reason: string };
  render?: Reel;
};
export type Wallet = { xp: number; points: number; version: number };
export type Me = { profile: Profile; wallet: Wallet; roles: string[]; completedQuestCount?: number };
export type Offer = {
  id: string;
  version?: number;
  title: string;
  merchant: string;
  points: number;
  terms: string;
  demo: boolean;
  available: number;
  expiresAt?: string;
  location?: string;
};
export type Redemption = {
  id: string;
  title: string;
  points: number;
  state: string;
  expiresAt: string;
};
