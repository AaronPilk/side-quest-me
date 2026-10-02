import { describe, expect, it } from "vitest";
import { DEFAULT_OUTING } from "../shared/domain";
import { experienceDiscoveryRequestSchema } from "../shared/experience-discovery";

const request = {
  outing: DEFAULT_OUTING,
  provider: "openai",
  consent: true,
  nearbyPlaces: [],
};
const ids = Array.from(
  { length: 6 },
  (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
);

describe("discovery reroll request compatibility", () => {
  it("preserves the serialized shape used by older builds for replay hashes", () => {
    const parsed = experienceDiscoveryRequestSchema.parse(request);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(request));
    expect(Object.hasOwn(parsed, "previousProposalIds")).toBe(false);
  });

  it("accepts at most five unique server-issued proposal identities", () => {
    expect(
      experienceDiscoveryRequestSchema.parse({
        ...request,
        previousProposalIds: ids.slice(0, 5),
      }).previousProposalIds,
    ).toEqual(ids.slice(0, 5));
    for (const previousProposalIds of [
      ids,
      [ids[0], ids[0]],
      ["private_quest"],
    ])
      expect(
        experienceDiscoveryRequestSchema.safeParse({
          ...request,
          previousProposalIds,
        }).success,
      ).toBe(false);
  });

  it("does not accept client-supplied previous preference or activity prose", () => {
    expect(
      experienceDiscoveryRequestSchema.safeParse({
        ...request,
        previousExperiences: [{ title: "Untrusted activity" }],
      }).success,
    ).toBe(false);
  });
});
