import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  questVariantSchema,
  type Outing,
  type Preferences,
} from "../shared/domain";
import {
  discoveryEligibility,
  type DiscoveryPlace,
  type ExperienceDiscoveryRequest,
} from "../shared/experience-discovery";
import { curatedDiscoveryFallback } from "../worker/curated-experiences";
import { ineligibilityIssues } from "../shared/recommend";

const adult: Preferences = {
  ...DEFAULT_PREFERENCES,
  ageBand: "21_plus",
  sources: { ageBand: "survey" },
};
const request = (
  patch: Partial<Outing> = {},
  nearbyPlaces: DiscoveryPlace[] = [],
): ExperienceDiscoveryRequest => ({
  consent: true,
  provider: "openai",
  nearbyPlaces,
  outing: {
    ...DEFAULT_OUTING,
    category: "demon",
    intensity: "full_send",
    group: "friends",
    participants: 4,
    budgetMinor: 80000,
    durationMinutes: null,
    setting: "venue",
    adultEligible: true,
    ...patch,
  },
});
const place = (category: string): DiscoveryPlace => ({
  id: "I1234ABCD",
  name: `Fixture ${category}`,
  category,
  address: "A public listing",
  latitude: 27,
  longitude: -82,
});
const history = (
  result: NonNullable<ReturnType<typeof curatedDiscoveryFallback>>,
) => ({
  title: result.quest.title,
  activity: result.quest.beats[1].action,
  mechanic: result.mechanic,
});

describe("adult editorial experience alternatives", () => {
  it("routes a confirmed adult nightlife group into an actual three-stop competition with pending costs", () => {
    const input = request(
      { adultContext: true, intensity: "bold", durationMinutes: 180 },
      [place("Bar")],
    );
    const result = curatedDiscoveryFallback(adult, input)!;
    expect(result.quest.title).toBe("Three Bars. One Crew Champion.");
    expect(result.quest.minParticipants).toBe(4);
    expect(result.quest.maxParticipants).toBe(4);
    expect(result.quest.supportsAdultContext).toBe(true);
    expect(result.quest.adultOnly).toBe(true);
    expect(result.quest.minimumAge).toBe(21);
    expect(result.quest.cost.venueCostUnknown).toBe(true);
    expect(result.quest.beats[1].action).toContain("alcohol-free");
    expect(result.quest.beats[2].action).toContain("capped");
    expect(result.location?.id).toBe("I1234ABCD");
    const eligibility = discoveryEligibility(result.quest, input.outing, adult);
    expect(eligibility.blocking).toEqual([]);
    expect(eligibility.requirements.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "venue_cost",
        "arrangements",
        "venue_permission",
      ]),
    );
  });

  it("never mistakes a barber or similarly named unrelated listing for a bar", () => {
    const result = curatedDiscoveryFallback(
      adult,
      request({ adultContext: true, intensity: "bold", durationMinutes: 180 }, [
        place("Barber shop"),
      ]),
    )!;
    expect(result.quest.title).toBe("Three Bars. One Crew Champion.");
    expect(result.location).toBeNull();
  });

  it("does not call more rock-paper-scissors rounds Full Send", () => {
    expect(
      curatedDiscoveryFallback(
        adult,
        request({ adultContext: true, durationMinutes: 180 }, [place("Bar")]),
      ),
    ).toBeNull();
  });

  it("rechecks the age requirement of a saved bar plan against the current profile", () => {
    const input = request(
      { adultContext: true, intensity: "bold", durationMinutes: 180 },
      [place("Bar")],
    );
    const saved = curatedDiscoveryFallback(adult, input)!;
    const confirmedOuting = {
      ...input.outing,
      arrangementConfirmed: true,
      venuePermission: true,
      confirmedVenueCostMinor: 18000,
    };
    expect(ineligibilityIssues(saved.quest, confirmedOuting, adult)).toEqual(
      [],
    );
    for (const ageBand of ["18_20", "under_18", null] as const) {
      const current = { ...adult, ageBand };
      expect(
        ineligibilityIssues(saved.quest, confirmedOuting, current),
      ).toContainEqual(expect.objectContaining({ code: "age" }));
      expect(
        discoveryEligibility(saved.quest, confirmedOuting, current).blocking,
      ).toContainEqual(expect.objectContaining({ code: "age" }));
    }
  });

  it.each([null, "under_18", "18_20"] as const)(
    "does not route %s users into a bar itinerary",
    (ageBand) => {
      const profile = { ...adult, ageBand };
      const result = curatedDiscoveryFallback(
        profile,
        request(
          { adultContext: true, intensity: "bold", durationMinutes: 180 },
          [place("Bar")],
        ),
      );
      expect(result?.quest.title ?? "").not.toMatch(/Bars|Menu Is Classified/);
      expect(result?.location).not.toBeTruthy();
    },
  );

  it("does not trust adult status imported through a summary or a missing profile answer", () => {
    for (const profile of [
      DEFAULT_PREFERENCES,
      { ...adult, sources: { ageBand: "summary_review" as const } },
    ]) {
      expect(
        curatedDiscoveryFallback(
          profile,
          request({ adultContext: true }, [place("Bar")]),
        ),
      ).toBeNull();
    }
  });

  it("honors adult-venue exclusions and never changes a group into a different setting", () => {
    expect(
      curatedDiscoveryFallback(
        { ...adult, exclusions: ["adult_venues"] },
        request({ adultContext: true }),
      ),
    ).toBeNull();
    const result = curatedDiscoveryFallback(
      adult,
      request({ setting: "outside", durationMinutes: 180 }, [
        place("E-bike rental"),
      ]),
    )!;
    expect(result.quest.settings).toEqual(["outside"]);
    expect(result.quest.title).toBe("The E-Bike Mystery Circuit");
    expect(result.quest.beats[1].action).toContain("speed");
    expect(result.quest.requirements.join(" ")).toContain("No street racing");
  });

  it("keeps an overnight stay honest and reserves it for unlimited time", () => {
    const result = curatedDiscoveryFallback(
      adult,
      request({}, [place("Hotel")]),
    )!;
    expect(result.quest.title).toBe("The Group Chat Checks In");
    expect(result.quest.durationMinutes).toBe(1200);
    expect(result.quest.beats[2].action).toContain("Next morning");
    expect(questVariantSchema.safeParse(result.quest).success).toBe(true);
    for (const durationMinutes of [180, 300, 720]) {
      const finite = curatedDiscoveryFallback(
        adult,
        request({ durationMinutes }, [place("Hotel")]),
      );
      expect(finite?.quest.title).not.toBe(result.quest.title);
      expect(finite?.location).toBeNull();
    }
  });

  it("does not claim live tickets and rotates to a distinct experience after a rejected direction", () => {
    const input = request({ durationMinutes: 300 }, [place("Music venue")]);
    const show = curatedDiscoveryFallback(adult, input)!;
    expect(show.quest.title).toBe("The Tickets Decide Tonight");
    expect(show.quest.beats[0].action).toContain("official");
    expect(show.quest.beats[0].action).toContain("not an event listing");
    const next = curatedDiscoveryFallback(adult, input, [history(show)])!;
    expect(next.quest.title).not.toBe(show.quest.title);
    expect(next.location).toBeNull();
    expect(next.quest.intensity).toBe("full_send");
  });

  it("checks the complete group budget and travel before proposing a paid itinerary", () => {
    const input = request(
      {
        adultContext: true,
        durationMinutes: 180,
        travelMinutes: 30,
        budgetMinor: 1000,
      },
      [place("Bar")],
    );
    expect(curatedDiscoveryFallback(adult, input)).toBeNull();
    const solo = curatedDiscoveryFallback(
      adult,
      request({ adultContext: true, group: "solo", participants: 1 }, [
        place("Bar"),
      ]),
    );
    expect(solo).toBeNull();
  });

  it("makes the fishing rivalry real while keeping its result out of the water", () => {
    const result = curatedDiscoveryFallback(
      adult,
      request({ setting: "outside", durationMinutes: 180 }, [
        place("Fishing pier"),
      ]),
    )!;
    expect(result.quest.title).toBe("Tiny Rods. Real Fish. No Excuses.");
    expect(result.quest.beats[1].action).toContain("first legally landed fish");
    expect(result.quest.requirements.join(" ")).toContain(
      "No jumping or swimming forfeits",
    );
    expect(
      curatedDiscoveryFallback(
        { ...adult, exclusions: ["physical_challenges"] },
        request({ setting: "outside" }, [place("Fishing pier")]),
      ),
    ).toBeNull();
  });

  it("allows a willing adult wingman game at home but does not mislabel it as Full Send or assume stranger participation", () => {
    const profile: Preferences = {
      ...adult,
      approach: "conversation",
      sources: { ...adult.sources, approach: "survey" },
    };
    const input = request({
      setting: "home",
      intensity: "bold",
      durationMinutes: 60,
      budgetMinor: 0,
    });
    const result = curatedDiscoveryFallback(profile, input)!;
    expect(result.quest.title).toBe("Your Friend Writes the First Message");
    expect(result.quest.cost.venueCostUnknown).toBe(false);
    expect(result.quest.beats[1].action).toContain(
      "account owner must read it, approve it and press send",
    );
    expect(result.quest.beats[2].action).toContain(
      "no reply or a no is a valid outcome",
    );
    expect(curatedDiscoveryFallback(adult, input)).toBeNull();
    expect(
      curatedDiscoveryFallback(
        profile,
        request({ ...input.outing, intensity: "full_send" }),
      ),
    ).toBeNull();
  });
});
