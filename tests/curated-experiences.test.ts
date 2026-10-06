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
    const result = curatedDiscoveryFallback(
      adult,
      request({ adultContext: true, durationMinutes: 180 }, [place("Bar")]),
    )!;
    expect(result.quest.title).toBe("Step Inside the Horror Story");
    expect(result.quest.beats[1].action).toContain("actors");
    expect(result.quest.adultOnly).toBe(false);
    expect(result.quest.supportsAdultContext).toBe(false);
    expect(result.location).toBeNull();
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
    const input = request({ intensity: "bold", durationMinutes: 300 }, [
      place("Music venue"),
    ]);
    const show = curatedDiscoveryFallback(adult, input)!;
    expect(show.quest.title).toBe("The Unknown Headliner");
    expect(show.quest.beats[0].action).toContain("official");
    expect(show.quest.beats[0].action).toContain("not an event listing");
    const next = curatedDiscoveryFallback(adult, input, [history(show)])!;
    expect(next.quest.title).not.toBe(show.quest.title);
    expect(next.location).toBeNull();
    expect(next.quest.intensity).toBe("bold");
  });

  it("does not relabel ordinary concert attendance as Full Send", () => {
    const result = curatedDiscoveryFallback(
      adult,
      request({ durationMinutes: 300 }, [place("Music venue")]),
    )!;
    expect(result.mechanic).not.toBe("live_show");
    expect(result.location).toBeNull();
  });

  it.each([false, true])(
    "does not turn a concert into adult content when nightlife opt-in is %s",
    (adultContext) => {
      const input = request(
        { intensity: "bold", durationMinutes: 180, adultContext },
        [place("Music venue")],
      );
      const result = curatedDiscoveryFallback(adult, input)!;
      expect(result.mechanic).toBe("live_show");
      expect(result.quest.adultOnly).toBe(false);
      expect(result.quest.minimumAge).toBeUndefined();
      expect(result.quest.supportsAdultContext).toBe(false);
      expect(result.quest.conflicts).toEqual(["being_surprised"]);
      const requirements = discoveryEligibility(
        result.quest,
        input.outing,
        adult,
      ).requirements.map(({ code }) => code);
      expect(requirements).not.toContain("age");
      expect(requirements).not.toContain("venue_permission");
    },
  );

  it.each([false, true])(
    "keeps hotel booking age separate from nightlife when opt-in is %s",
    (adultContext) => {
      const input = request({ adultContext }, [place("Hotel")]);
      const result = curatedDiscoveryFallback(adult, input)!;
      expect(result.mechanic).toBe("spontaneous_staycation");
      expect(result.quest.adultOnly).toBe(true);
      expect(result.quest.minimumAge).toBe(18);
      expect(result.quest.supportsAdultContext).toBe(false);
      expect(result.quest.conflicts).toEqual([]);
      expect(
        discoveryEligibility(result.quest, input.outing, adult).requirements
          .map(({ code }) => code),
      ).not.toContain("venue_permission");
    },
  );

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
    expect(solo?.quest.allowedGroups).toEqual(["solo"]);
    expect(solo?.quest.minParticipants).toBe(1);
    expect(solo?.quest.adultOnly).toBe(false);
    expect(solo?.quest.title).not.toMatch(/Bars|Menu Is Classified|Crew/);
    expect(solo?.location).toBeNull();
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

describe("fallback coverage without changing the user's plan", () => {
  it.each([
    ["solo", 1, "home", "chill", 60, "One Album, One Listening Party"],
    ["couple", 2, "home", "chill", 60, "One Album, One Listening Party"],
    ["solo", 1, "home", "bold", 120, "Your Kitchen's One-Night Special"],
    ["couple", 2, "home", "bold", 120, "Your Kitchen's One-Night Special"],
    ["solo", 1, "outside", "chill", 60, "Your Neighborhood, Six Frames"],
    ["couple", 2, "outside", "chill", 60, "Your Neighborhood, Six Frames"],
    ["solo", 1, "outside", "bold", 120, "Find Your First Hidden Cache"],
    ["couple", 2, "outside", "bold", 120, "Find Your First Hidden Cache"],
  ] as const)(
    "%s %s %s %s has a coherent free fallback within %s minutes",
    (group, participants, setting, intensity, durationMinutes, title) => {
      const input = request({
        category: group === "couple" ? "date_night" : "daytime",
        group,
        participants,
        setting,
        intensity,
        durationMinutes,
        budgetMinor: 0,
        adultEligible: false,
      });
      const result = curatedDiscoveryFallback(DEFAULT_PREFERENCES, input)!;
      expect(result.quest.title).toBe(title);
      expect(result.quest.category).toBe(input.outing.category);
      expect(result.quest.intensity).toBe(intensity);
      expect(result.quest.allowedGroups).toEqual([group]);
      expect(result.quest.minParticipants).toBe(participants);
      expect(result.quest.maxParticipants).toBe(participants);
      expect(result.quest.settings).toEqual([setting]);
      expect(result.quest.durationMinutes).toBeLessThanOrEqual(durationMinutes);
      expect(result.quest.cost.venueCostUnknown).toBe(false);
      expect(result.quest.arrangementRequired).toBe(false);
      expect(result.quest.adultOnly).toBe(false);
      expect(result.location).toBeNull();
      expect(
        discoveryEligibility(result.quest, input.outing, DEFAULT_PREFERENCES),
      ).toEqual({
        blocking: [],
        requirements: [],
      });
      expect(result.quest.fallback).not.toContain("phone and contacts");
    },
  );

  it("keeps a free photowalk inside actual time, travel and area boundaries", () => {
    const input = request(
      {
        category: "daytime",
        group: "solo",
        participants: 1,
        setting: "outside",
        intensity: "chill",
        durationMinutes: 60,
        travelMinutes: 15,
        budgetMinor: 0,
      },
      [place("Park")],
    );
    const preferences: Preferences = {
      ...DEFAULT_PREFERENCES,
      exclusions: ["physical_challenges", "strangers"],
    };
    const result = curatedDiscoveryFallback(preferences, input)!;
    expect(result.quest.title).toBe("Your Neighborhood, Six Frames");
    expect(result.location?.category).toBe("Park");
    expect(result.quest.beats[0].action).toContain("selected area");
    expect(result.quest.beats[0].action).toContain("Check access");
    expect(
      curatedDiscoveryFallback(
        {
          ...preferences,
          exclusions: ["travel_outside_area"],
        },
        input,
      ),
    ).toBeNull();
    expect(
      curatedDiscoveryFallback(preferences, {
        ...input,
        outing: { ...input.outing, travelMinutes: 16 },
      }),
    ).toBeNull();
    expect(
      curatedDiscoveryFallback(preferences, {
        ...input,
        outing: { ...input.outing, travelCostMinor: 100 },
      }),
    ).toBeNull();
  });

  it("does not invent a real cache from a park listing or ignore a physical exclusion", () => {
    const input = request(
      {
        group: "couple",
        participants: 2,
        setting: "outside",
        intensity: "bold",
        durationMinutes: 90,
        budgetMinor: 0,
      },
      [place("Park")],
    );
    const result = curatedDiscoveryFallback(DEFAULT_PREFERENCES, input)!;
    expect(result.quest.beats[0].action).toContain("does not prove a cache");
    expect(result.quest.requirements.join(" ")).toContain("verifying");
    expect(
      curatedDiscoveryFallback(
        {
          ...DEFAULT_PREFERENCES,
          exclusions: ["physical_challenges"],
        },
        input,
      ),
    ).toBeNull();
  });

  it.each([120, 180])(
    "offers a genuine Full Send commitment within a %s-minute eligible nightlife plan",
    (durationMinutes) => {
      const input = request(
        { adultContext: true, durationMinutes, budgetMinor: 20000 },
        [place("Horror escape")],
      );
      const result = curatedDiscoveryFallback(adult, input)!;
      expect(result.quest.title).toBe("Step Inside the Horror Story");
      expect(result.quest.beats[0].action).toContain("live-actor");
      expect(result.quest.beats[0].action).toContain("at most 75 minutes");
      expect(result.quest.cost.venueCostUnknown).toBe(true);
      expect(result.quest.adultOnly).toBe(false);
      expect(result.quest.minimumAge).toBeUndefined();
      expect(result.quest.supportsAdultContext).toBe(false);
      const eligibility = discoveryEligibility(
        result.quest,
        input.outing,
        adult,
      );
      expect(eligibility.blocking).toEqual([]);
      expect(eligibility.requirements.map(({ code }) => code)).toEqual([
        "venue_cost",
        "arrangements",
      ]);
    },
  );

  it("retains honest no-fit outcomes instead of upgrading mild activities to Full Send", () => {
    for (const setting of ["home", "outside"] as const) {
      for (const group of ["solo", "couple"] as const) {
        expect(
          curatedDiscoveryFallback(
            adult,
            request({
              group,
              participants: group === "solo" ? 1 : 2,
              setting,
              intensity: "full_send",
              durationMinutes: 60,
              budgetMinor: 0,
            }),
          ),
        ).toBeNull();
      }
    }
    const input = request({ adultContext: true, durationMinutes: 120 });
    expect(
      curatedDiscoveryFallback(
        {
          ...adult,
          exclusions: ["physical_challenges", "being_surprised"],
        },
        input,
      ),
    ).toBeNull();
  });

  it("respects rerolls even when only one fitting free alternative remains", () => {
    const input = request({
      group: "solo",
      participants: 1,
      setting: "home",
      intensity: "chill",
      durationMinutes: 60,
      budgetMinor: 0,
    });
    const first = curatedDiscoveryFallback(DEFAULT_PREFERENCES, input)!;
    expect(
      curatedDiscoveryFallback(DEFAULT_PREFERENCES, input, [history(first)]),
    ).toBeNull();
  });
});
