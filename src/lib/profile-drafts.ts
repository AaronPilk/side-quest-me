import {
  normalizePreferences,
  profileSchema,
  type Profile,
} from "../../shared/domain";
import { DEMO, supabase } from "./auth";
import { demoActor } from "./demo-identity";

export const PROFILE_DRAFT_KEYS = [
  "sq-profile-draft",
  "sq-preference-wizard-draft",
] as const;

export type ProfileDraft = {
  version?: number;
  baselineProfile?: Profile;
  summaryDraft?: string;
  summaryReturn?: number | null;
  ownerId: string;
  profile?: Profile;
  step?: number;
  reviewingAnswer?: boolean;
};

export function demoProfileDraftOwner(): string {
  return `demo:${demoActor().id}`;
}

export async function currentProfileDraftOwner(): Promise<string | null> {
  if (DEMO) return demoProfileDraftOwner();
  const session = (await supabase?.auth.getSession())?.data.session;
  return session?.user.id ? `user:${session.user.id}` : null;
}

export function readProfileDraft(key: string, ownerId: string | null) {
  const raw = sessionStorage.getItem(key);
  if (!raw) return { draft: null, discarded: false };
  const value = JSON.parse(raw) as ProfileDraft | null;
  if (!ownerId || !value || value.ownerId !== ownerId) {
    // An old draft has no trustworthy owner. Keep the durable profile and never
    // assume that private imported text belongs to whoever signs in next.
    sessionStorage.removeItem(key);
    return { draft: null, discarded: true };
  }
  return { draft: value, discarded: false };
}

function normalizedDraftProfile(
  value: unknown,
  saved: Profile,
): Profile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const parsed = profileSchema.safeParse({
    ...candidate,
    // Older drafts predate account intent. They cannot erase a newer choice.
    accountType:
      candidate.accountType === undefined
        ? saved.accountType
        : candidate.accountType,
    preferences: normalizePreferences(candidate.preferences),
  });
  return parsed.success ? parsed.data : null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Call only after readProfileDraft has checked ownership. A durable baseline
 * distinguishes pending retry edits from a stale draft that could erase a newer
 * saved answer. Legacy drafts can resume progress only when their durable fields
 * still agree with the saved profile. Discarded ancillary text/steps must also
 * be ignored by the caller. */
export function resolveProfileDraft(
  savedProfile: Profile,
  draft: ProfileDraft | null,
): { profile: Profile; discarded: boolean } {
  if (!draft) return { profile: savedProfile, discarded: false };
  const saved = normalizedDraftProfile(savedProfile, savedProfile);
  const candidate = normalizedDraftProfile(draft.profile, savedProfile);
  if (!saved || !candidate) return { profile: savedProfile, discarded: true };
  const baseline =
    draft.baselineProfile === undefined
      ? candidate
      : normalizedDraftProfile(draft.baselineProfile, savedProfile);
  if (!baseline || canonical(baseline) !== canonical(saved))
    return { profile: savedProfile, discarded: true };
  return { profile: candidate, discarded: false };
}

export function syncProfileDrafts(
  ownerId: string | null,
  patch: Partial<Profile>,
) {
  if (!ownerId) return;
  for (const key of PROFILE_DRAFT_KEYS) {
    try {
      const { draft } = readProfileDraft(key, ownerId);
      if (draft?.profile)
        sessionStorage.setItem(
          key,
          JSON.stringify({
            ...draft,
            profile: { ...draft.profile, ...patch },
            ...(draft.baselineProfile
              ? { baselineProfile: { ...draft.baselineProfile, ...patch } }
              : {}),
            ...(patch.summary !== undefined && draft.summaryDraft !== undefined
              ? { summaryDraft: patch.summary }
              : {}),
          }),
        );
    } catch {
      /* A durable save is successful even if optional draft storage fails. */
    }
  }
}

export function accountIdentityChanged(
  previous: string | null | undefined,
  next: string | null,
  event?: string,
) {
  return event === "SIGNED_OUT" || (previous != null && previous !== next);
}
