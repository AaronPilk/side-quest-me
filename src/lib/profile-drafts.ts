import type { Profile } from "../../shared/domain";
import { DEMO, supabase } from "./auth";
import { demoActor } from "./demo-identity";

export const PROFILE_DRAFT_KEYS = [
  "sq-profile-draft",
  "sq-preference-wizard-draft",
] as const;

export type ProfileDraft = {
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
          JSON.stringify({ ...draft, profile: { ...draft.profile, ...patch } }),
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
