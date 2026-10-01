import {
  experienceDiscoveryRequestSchema,
  type ExperienceDiscoveryRequest,
  type ExperienceDiscoveryResult,
} from "../../shared/experience-discovery";
import { pickOuting } from "../../shared/domain";
import { request } from "./api";
export async function discoverExperience(
  input: ExperienceDiscoveryRequest,
  key: string = crypto.randomUUID(),
): Promise<ExperienceDiscoveryResult> {
  return request("/api/quests/discover", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(
      experienceDiscoveryRequestSchema.parse({
        ...input,
        outing: pickOuting(input.outing),
      }),
    ),
    signal: AbortSignal.timeout(110000),
  });
}
