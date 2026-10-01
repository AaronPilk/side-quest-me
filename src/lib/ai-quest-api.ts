import {
  aiQuestRequestSchema,
  aiQuestDraftRequestSchema,
  type AiQuestDraftRequest,
  type AiQuestDraftResult,
  type AiQuestConfig,
  type AiQuestRequest,
  type AiQuestResult,
} from "../../shared/ai-quest";
import { pickOuting } from "../../shared/domain";
import { request } from "./api";
import { DEMO } from "./auth";

export const aiQuestApi = {
  config: async (): Promise<AiQuestConfig> =>
    DEMO
      ? { configured: false, model: null, provider: null }
      : request("/api/quests/ai-config"),
  draft: async (input: AiQuestDraftRequest): Promise<AiQuestDraftResult> => {
    const parsed = aiQuestDraftRequestSchema.parse({
      ...input,
      outing: pickOuting(input.outing),
    });
    if (DEMO)
      throw new Error("AI quest drafting is not connected in this local demo.");
    return request("/api/quests/ai-draft", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
  },
  assist: async (input: AiQuestRequest): Promise<AiQuestResult> => {
    // An active run's stored outing includes server-assigned fields (role);
    // the request contract is strict, so send only the outing fields.
    const parsed = aiQuestRequestSchema.parse({
      ...input,
      outing: pickOuting(input.outing),
    });
    if (DEMO)
      throw new Error("AI filming help is not connected in this local demo.");
    return request("/api/quests/ai-assist", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
  },
};
