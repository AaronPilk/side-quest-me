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

export const communityApi = {
  read: async <T>(
    view: CommunityView,
    input: Record<string, unknown> = {},
  ): Promise<T> => {
    const parsed = communityReadSchema.parse(input);
    if (DEMO) return demoRead<T>(view, parsed);
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
    return request<T>(`/api/community/${path}${query.size ? `?${query}` : ""}`);
  },
  mutate: async <T>(
    action: CommunityAction,
    input: unknown,
    key = crypto.randomUUID(),
  ): Promise<T> => {
    const operation = communityMutationSchema.parse({ action, input });
    if (DEMO) return demoMutate<T>(action, operation.input, key);
    return request<T>("/api/community/mutate", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(operation),
    });
  },
  actorId: async (): Promise<string | null> =>
    DEMO ? demoActor().id : (await communityApi.read<CommunityMe>("me")).userId,
};
