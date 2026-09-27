/** Narrow database DTOs. API validates client inputs with shared/domain.ts. */
export type DbJson =
  | null
  | boolean
  | number
  | string
  | DbJson[]
  | { [key: string]: DbJson | undefined };
export type RunStatus =
  "accepted" | "in_progress" | "review_needed" | "finalized" | "abandoned";
export type RenderStatus =
  "queued" | "processing" | "ready" | "failed" | "canceled";
export type RedemptionStatus =
  "reserved" | "consumed" | "cancelled" | "expired";
export interface WalletRow {
  owner_id: string;
  xp: number;
  points: number;
  version: number;
  updated_at: string;
}
export interface RewardDecision {
  xp: number;
  points: number;
  reason: string;
  policy_version: number;
  evaluated_at: string;
  reset_at: string;
}
export interface DbClip {
  asset_id: string;
  start_ms: number;
  end_ms: number;
  mute?: boolean;
  fit?: "cover" | "contain";
  crop?: number;
  label?: string;
}
export interface SealedClip extends DbClip {
  slot: number;
  generation: number;
  object_key: string;
  sha256: string;
}
export interface RenderManifest {
  sponsorDisclosure?: string;
  version: 1;
  title: string;
  clips: SealedClip[];
}
export interface MediaAssetRow {
  id: string;
  owner_id: string;
  run_id: string;
  kind: "source" | "reel" | "thumbnail";
  slot: number | null;
  generation: number;
  staging_key: string | null;
  object_key: string | null;
  state: "pending" | "sealed" | "deleted";
  expected_bytes: number | null;
  bytes: number | null;
  mime: string | null;
  duration_ms: number | null;
  sha256: string | null;
  metadata: Record<string, DbJson>;
  upload_expires_at: string | null;
  is_current: boolean;
  created_at: string;
  sealed_at: string | null;
  deleted_at: string | null;
}
export interface RenderJobRow {
  id: string;
  owner_id: string;
  run_id: string;
  manifest: RenderManifest;
  manifest_hash: string;
  renderer_version: string;
  status: RenderStatus;
  attempts: number;
  fence: number;
  lease_expires_at: string | null;
  output_asset_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
export interface MutationArgs {
  p_actor: string;
  p_input: DbJson;
  p_key: string;
  p_hash: string;
}

/** Public campaign fields only; funding references and notes remain private. */
export interface CampaignRow { id: string; sponsor_id: string; version: number; title: string; disclosure: string; area: string; categories: string[]; family_ids: string[]; funded: boolean; state: "draft" | "active" | "paused" | "ended"; starts_at: string; ends_at: string; created_at: string; updated_at: string }
