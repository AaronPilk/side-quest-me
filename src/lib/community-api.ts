import { normalizeAccountType } from "../../shared/account";
import type {
  CommunityAction,
  CommunityMe,
  CommunityView,
} from "../../shared/community";
import {
  communityMutationSchema,
  communityReadSchema,
} from "../../shared/community";
import { request } from "./api";
import { DEMO } from "./auth";
import { demoMutate, demoRead } from "./demo-community";
import { demoActor } from "./demo-identity";
import { demoSocialIdentity, demoSocialBlock } from "./demo-social";
import { clearDemoSeriesFollowsForBlock } from "./demo-series";

function withDemoIdentity<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withDemoIdentity) as T;
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const result = Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, withDemoIdentity(item)]),
  );
  if (
    typeof record.id === "string" &&
    typeof record.displayName === "string" &&
    "publishedCount" in record
  )
    Object.assign(result, demoSocialIdentity(record.id));
  return result as T;
}

export const communityApi = {
  read: async <T>(
    view: CommunityView,
    input: Record<string, unknown> = {},
  ): Promise<T> => {
    const parsed = communityReadSchema.parse(input);
    if (DEMO) return withDemoIdentity(demoRead<T>(view, parsed));
    const paths: Partial<Record<CommunityView, string>> = {
      post: "posts",
      creator: "creators",
      draft: "drafts",
      offer: "offers",
    };
    const query = new URLSearchParams(
      Object.entries(parsed)
        .filter(([key]) => key !== "id")
        .map(([key, value]) => [key, String(value)]),
    );
    const path = paths[view]
      ? `${paths[view]}/${encodeURIComponent(parsed.id || "")}`
      : view;
    const result = await request<T>(
      `/api/community/${path}${query.size ? `?${query}` : ""}`,
    );
    if (view === "me" && result && typeof result === "object") {
      const me = result as unknown as CommunityMe;
      me.accountType = normalizeAccountType(me.accountType, me.brand);
    }
    return result;
  },
  mutate: async <T>(
    action: CommunityAction,
    input: unknown,
    key = crypto.randomUUID(),
  ): Promise<T> => {
    const operation = communityMutationSchema.parse({ action, input });
    if (DEMO) {
      const result = await demoMutate<T>(action, operation.input, key);
      if (operation.action === "block" && operation.input.blocked) {
        demoSocialBlock(demoActor().id, operation.input.userId);
        clearDemoSeriesFollowsForBlock(demoActor().id, operation.input.userId);
      }
      return withDemoIdentity(result);
    }
    return request<T>("/api/community/mutate", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(operation),
    });
  },
  actorId: async (): Promise<string | null> =>
    DEMO ? demoActor().id : (await communityApi.read<CommunityMe>("me")).userId,
};
