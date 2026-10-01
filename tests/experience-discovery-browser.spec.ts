import { expect, test, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING, type Candidate, type Outing } from "../shared/domain";
import type {
  DiscoveryPlace,
  ExperienceDiscoveryRequest,
  ExperienceDiscoveryResult,
} from "../shared/experience-discovery";

const venuePlan: Outing = {
  ...DEFAULT_OUTING,
  category: "demon",
  intensity: "full_send",
  group: "friends",
  participants: 4,
  budgetMinor: 30000,
  budgetScope: "total",
  durationMinutes: null,
  setting: "venue",
  applePlaceId: null,
  transport: "car",
};
const stop: DiscoveryPlace = {
  id: "I1234567890ABCDEF",
  name: "Mocked adventure venue",
  address: "A public listing in the chosen area",
  category: "Entertainment",
  latitude: 27.7,
  longitude: -82.6,
};
const title = "Four friends take on the mystery escape";
const acceptError = "Mock acceptance stopped before creating a run.";

type Acceptance = { quest: Candidate; outing: Outing; key: string };
type FixtureWindow = typeof window & {
  __experienceAccepts: Acceptance[];
  __experienceConfigReads: number;
};

function result(
  plan: Outing,
  options: {
    title?: string;
    source?: "ai" | "curated_fallback";
    location?: DiscoveryPlace;
    conditional?: boolean;
  } = {},
): ExperienceDiscoveryResult {
  const conditional = options.conditional ?? plan.setting === "venue";
  const base = catalog.find(
    (quest) =>
      quest.category === plan.category && quest.intensity === plan.intensity,
  )!;
  const candidate: Candidate = {
    ...base,
    id: "private_33333333-3333-4333-8333-333333333333",
    familyId: "private_fixture_escape",
    title: options.title || title,
    hook:
      plan.setting === "venue"
        ? "Four friends, one escape-room booking, and a surprise captain for the final puzzle."
        : "Two people trade navigation and find a new viewpoint in the chosen area.",
    privateGenerated: true,
    category: plan.category,
    intensity: plan.intensity,
    durationMinutes: 90,
    minParticipants: plan.participants,
    maxParticipants: plan.participants,
    allowedGroups: [plan.group],
    settings: [plan.setting],
    cost: {
      minMinor: 0,
      maxMinor: 0,
      scope: "total",
      currency: "USD",
      venueCostUnknown: conditional,
      note: conditional
        ? "Check the full booking price before starting."
        : "No purchase is required.",
    },
    preparation: "start_now",
    conflicts: [],
    arrangementRequired: conditional,
    venuePermissionRequired: conditional,
    adultOnly: false,
    requiresVolunteer: false,
    supportsAdultContext: false,
    materials: [],
    requirements: conditional
      ? ["Book a room that allows your group to film."]
      : [],
    award: { xp: 0, points: 0 },
    effectiveBudgetMinor: plan.budgetMinor,
    estimatedCostMinMinor: 0,
    estimatedCostMaxMinor: 0,
    whyFits: [
      "Made for your chosen group and intensity",
      "Private experience · no XP or reward points",
    ],
    ready: !conditional,
    selectedRole: null,
    rewardEligibility: { eligible: false, reason: "private_generated" },
  };
  return {
    provider: "openai",
    model: "mocked-openai-model",
    source: options.source || "ai",
    generatedAt: new Date().toISOString(),
    candidates: [candidate],
    proposals: [
      {
        proposalId: "33333333-3333-4333-8333-333333333333",
        templateId: candidate.id,
        location: options.location || null,
        locationAttribution: options.location ? "Apple Maps" : null,
        requirements: conditional
          ? [
              {
                code: "venue_cost",
                label: "Confirm the full group booking cost.",
              },
              { code: "arrangements", label: "Confirm the booking." },
              {
                code: "venue_permission",
                label: "Confirm filming permission.",
              },
            ]
          : [],
        ready: candidate.ready,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    ],
  };
}

async function prepare(
  page: Page,
  options: {
    failFirst?: boolean;
    holdFirst?: boolean;
    source?: "ai" | "curated_fallback";
    location?: DiscoveryPlace;
    initialOuting?: Outing;
    fixtureTitle?: string;
    conditional?: boolean;
  } = {},
) {
  const calls: ExperienceDiscoveryRequest[] = [];
  const keys: string[] = [];
  let releaseFirst = () => {};
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  await page.addInitScript((outing) => {
    sessionStorage.setItem("sq-demo-started", "1");
    if (outing) sessionStorage.setItem("sq-outing", JSON.stringify(outing));
  }, options.initialOuting);
  await page.route("**/api/quests/discover", async (route) => {
    const input = route.request().postDataJSON() as ExperienceDiscoveryRequest;
    calls.push(input);
    keys.push(route.request().headers()["idempotency-key"] || "");
    const index = calls.length;
    if (options.holdFirst && index === 1) await held;
    if (options.failFirst && index === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Mocked discovery is unavailable. Your plan is saved." },
      });
    return route.fulfill({
      json: result(input.outing, {
        source: options.source,
        location: options.location,
        title: options.fixtureTitle,
        conditional: options.conditional,
        ...(options.holdFirst
          ? {
              title:
                index === 1 ? "Outdated experience" : "Current bold adventure",
            }
          : {}),
      }),
    });
  });
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "What’s the plan?", exact: true }),
  ).toBeVisible();
  // Override only the actual loaded modules. Vite HMR can use timestamped URLs.
  // This exercises normal Create while making no live AI or acceptance call.
  await page.evaluate(async () => {
    const loaded = (path: string) =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => new URL(entry.name).pathname === path)
        .reverse()[0]?.name || path;
    const { aiQuestApi } = await import(loaded("/src/lib/ai-quest-api.ts"));
    const { api } = await import(loaded("/src/lib/api.ts"));
    (window as FixtureWindow).__experienceConfigReads = 0;
    aiQuestApi.config = async () => {
      (window as FixtureWindow).__experienceConfigReads += 1;
      return {
        configured: true,
        provider: "openai",
        model: "mocked-openai-model",
      };
    };
    (window as FixtureWindow).__experienceAccepts = [];
    api.accept = async (quest: Candidate, outing: Outing, key: string) => {
      (window as FixtureWindow).__experienceAccepts.push(
        structuredClone({ quest, outing, key }),
      );
      throw new Error("Mock acceptance stopped before creating a run.");
    };
  });
  // Wait for Discover to render before returning: the URL changes before the
  // React transition commits, so an immediate click can retain the old Create.
  await page
    .getByRole("link", { name: "Discover", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "What’s the plan?", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as FixtureWindow).__experienceConfigReads),
    )
    .toBeGreaterThan(0);
  return { calls, keys, releaseFirst };
}

async function continueStep(page: Page) {
  await expect(page.locator(".quest-arrangements")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
async function planJourney(page: Page) {
  await page
    .getByRole("group", { name: "Scene", exact: true })
    .getByRole("button", { name: "Demon", exact: true })
    .click();
  await continueStep(page);
  await page
    .getByRole("group", { name: "Intensity", exact: true })
    .getByRole("button", { name: "Full Send", exact: true })
    .click();
  await continueStep(page);
  await page
    .getByRole("group", { name: "Group", exact: true })
    .getByRole("button", { name: "Friends", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", { name: "Group size", exact: true }),
  ).toHaveValue("4");
  await continueStep(page);
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Budget in dollars", exact: true })
    .fill("300");
  await page
    .getByRole("group", { name: "Budget is for", exact: true })
    .getByRole("button", { name: "The whole group", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Budget is for", exact: true }),
  ).toHaveCount(0);
  await continueStep(page);
  await page
    .getByRole("group", { name: "Available time", exact: true })
    .getByRole("button", { name: "Unlimited time", exact: true })
    .click();
  await continueStep(page);
  await page
    .getByRole("group", { name: "Setting", exact: true })
    .getByRole("button", { name: "At a venue", exact: true })
    .click();
  await continueStep(page);
  await page
    .getByRole("group", { name: "Getting there", exact: true })
    .getByRole("button", { name: "Car", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Getting there", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Quest area", exact: true }),
  ).toContainText(
    "No location? Continue for an adventure without a named place.",
  );
  await continueStep(page);
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Personalized with OpenAI", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".quest-discovery-consent")).toContainText(
    "imported summary and exact device location aren’t sent",
  );
  await expect(page.getByText("More options", { exact: true })).toHaveCount(0);
  await expect(page.locator(".quest-arrangements")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
}
async function accepted(page: Page) {
  return page.evaluate(() => (window as FixtureWindow).__experienceAccepts);
}
async function confirmBooking(page: Page, price = "180") {
  await page
    .getByRole("spinbutton", {
      name: "Total confirmed venue cost (USD)",
      exact: true,
    })
    .fill(price);
  await page
    .getByRole("checkbox", {
      name: "We’ve checked the booking, equipment and participants this quest needs.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "The venue allows this activity and our filming.",
      exact: true,
    })
    .check();
}

test("normal Find my quests sends the unchanged Demon Full Send outing to OpenAI and checks the chosen private experience before accepting", async ({
  page,
}) => {
  const control = await prepare(page, { location: stop });
  await planJourney(page);
  expect(control.calls).toHaveLength(0);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect(control.calls).toHaveLength(1);
  expect(control.keys[0]).toMatch(/^[a-f0-9-]{36}$/);
  expect(control.calls[0]).toEqual({
    outing: venuePlan,
    provider: "openai",
    consent: true,
    nearbyPlaces: [],
  });
  await expect(
    page.getByText("Fits your plan · Confirm booking details before starting", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".quest-card .meta-row")).toContainText(
    "Booking price to check",
  );
  await expect(page.locator(".quest-card .meta-row")).not.toContainText("$0");
  await page
    .locator(".quest-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  const accept = page.getByRole("button", {
    name: "Accept quest",
    exact: true,
  });
  await expect(accept).toBeDisabled();
  await expect(page.locator(".meta-row").first()).toContainText(
    "Booking price to check",
  );
  await expect(
    page.getByRole("region", { name: "Check your quest details", exact: true }),
  ).toContainText(stop.name);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(
    page.getByText("For the story — no XP or points this time", {
      exact: true,
    }),
  ).toBeVisible();
  await confirmBooking(page, "301");
  await expect(accept).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "confirmed cost exceeds your budget",
  );
  expect(await accepted(page)).toHaveLength(0);
  await page
    .getByRole("spinbutton", {
      name: "Total confirmed venue cost (USD)",
      exact: true,
    })
    .fill("180");
  await expect(accept).toBeEnabled();
  await expect(page.locator(".meta-row").first()).toContainText(
    /\$180(?:\.00)? group estimate/,
  );
  await accept.click();
  await expect(page.getByRole("alert")).toContainText(acceptError);
  const acceptCalls = await accepted(page);
  expect(acceptCalls).toHaveLength(1);
  expect(acceptCalls[0]).toMatchObject({
    quest: {
      id: "private_33333333-3333-4333-8333-333333333333",
      privateGenerated: true,
      award: { xp: 0, points: 0 },
    },
    outing: {
      ...venuePlan,
      applePlaceId: stop.id,
      confirmedVenueCostMinor: 18000,
      venuePermission: true,
      arrangementConfirmed: true,
    },
  });
  expect(acceptCalls[0].key).toMatch(/^[a-f0-9-]{36}$/);
});

test("AI-configured outdoor Full Send keeps the couple and intensity unchanged without requiring a named place", async ({
  page,
}) => {
  const outdoorPlan: Outing = {
    ...DEFAULT_OUTING,
    category: "date_night",
    intensity: "full_send",
    group: "couple",
    participants: 2,
    budgetMinor: 10000,
    durationMinutes: 180,
    setting: "outside",
    transport: "walk",
    applePlaceId: null,
  };
  const outdoorTitle = "Two people find the view they have never seen";
  const control = await prepare(page, {
    initialOuting: outdoorPlan,
    fixtureTitle: outdoorTitle,
  });
  await continueStep(page);
  await page
    .getByRole("group", { name: "Intensity", exact: true })
    .getByRole("button", { name: "Full Send", exact: true })
    .click();
  await continueStep(page);
  for (let step = 0; step < 5; step++) await continueStep(page);
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: outdoorTitle, exact: true }),
  ).toBeVisible();
  expect(control.calls).toEqual([
    {
      outing: outdoorPlan,
      provider: "openai",
      consent: true,
      nearbyPlaces: [],
    },
  ]);
  const card = page.locator(".quest-card");
  await expect(card).toContainText("Full Send");
  await expect(card).not.toContainText("Chill");
  await card.click();
  await expect(page.locator(".quest-arrangements")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  const accept = page.getByRole("button", {
    name: "Accept quest",
    exact: true,
  });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole("alert")).toContainText(acceptError);
  expect(await accepted(page)).toHaveLength(1);
  expect((await accepted(page))[0]).toMatchObject({
    quest: {
      category: "date_night",
      intensity: "full_send",
      minParticipants: 2,
      maxParticipants: 2,
      allowedGroups: ["couple"],
      settings: ["outside"],
      privateGenerated: true,
      award: { xp: 0, points: 0 },
    },
    outing: outdoorPlan,
  });
});

test("a new experience never treats a previous venue booking as confirmation for this activity", async ({
  page,
}) => {
  await prepare(page, {
    initialOuting: {
      ...venuePlan,
      confirmedVenueCostMinor: 0,
      venuePermission: true,
      arrangementConfirmed: true,
    },
  });
  await planJourney(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await page.locator(".quest-card").click();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("spinbutton", {
      name: "Total confirmed venue cost (USD)",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("checkbox", {
      name: "The venue allows this activity and our filming.",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "We’ve checked the booking, equipment and participants this quest needs.",
      exact: true,
    }),
  ).not.toBeChecked();
  expect(await accepted(page)).toHaveLength(0);
});

test("curated fallback is honestly labeled and location remains optional", async ({
  page,
}) => {
  const control = await prepare(page, { source: "curated_fallback" });
  await planJourney(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "AI couldn’t finish a strong idea this time" }),
  ).toBeVisible();
  expect(control.calls[0].outing.applePlaceId).toBeNull();
  expect(control.calls[0].nearbyPlaces).toEqual([]);
  await page.locator(".quest-card").click();
  await expect(page.getByText("Suggested stop:", { exact: false })).toHaveCount(
    0,
  );
  await confirmBooking(page);
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(acceptError);
  expect((await accepted(page))[0].outing.applePlaceId).toBeNull();
});

test("discovery failure keeps the complete plan and can be retried without re-answering the wizard", async ({
  page,
}) => {
  const control = await prepare(page, { failFirst: true });
  await planJourney(page);
  const find = page.getByRole("button", {
    name: "Find my quests",
    exact: true,
  });
  await find.click();
  await expect(page.getByRole("alert")).toContainText(
    "Mocked discovery is unavailable. Your plan is saved.",
  );
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(find).toBeEnabled();
  await find.click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  expect(control.calls).toHaveLength(2);
  expect(control.calls[1]).toEqual(control.calls[0]);
  expect(control.keys[1]).toEqual(control.keys[0]);
  expect(control.calls[1].outing).toEqual(venuePlan);
  expect(await accepted(page)).toHaveLength(0);
});

test("pending discovery prevents duplicate submits and a delayed result cannot replace an edited plan after leaving Create", async ({
  page,
}) => {
  const control = await prepare(page, { holdFirst: true });
  await planJourney(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect.poll(() => control.calls.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Find my quests", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("status")
    .filter({ hasText: "Building your experience and checking the fit" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Discover", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create", exact: true }).first().click();
  await page
    .getByRole("button", { name: "Edit intensity", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Intensity", exact: true })
    .getByRole("button", { name: "Bold", exact: true })
    .click();
  await continueStep(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current bold adventure", exact: true }),
  ).toBeVisible();
  expect(control.calls[1].outing).toMatchObject({
    ...venuePlan,
    intensity: "bold",
  });
  const oldResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/quests/discover",
  );
  control.releaseFirst();
  await (await oldResponse).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    page.getByRole("heading", { name: "Current bold adventure", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Outdated experience", exact: true }),
  ).toHaveCount(0);
  expect(control.calls).toHaveLength(2);
});

test("a paid outdoor experience requires its full quote and includes travel without changing Outside", async ({
  page,
}) => {
  const outdoorPlan: Outing = {
    ...venuePlan,
    setting: "outside",
    travelCostMinor: 500,
  };
  const outdoorTitle = "The supervised outdoor rental challenge";
  const control = await prepare(page, {
    initialOuting: outdoorPlan,
    fixtureTitle: outdoorTitle,
    conditional: true,
  });
  for (let step = 0; step < 7; step++) await continueStep(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  const card = page.locator(".quest-card");
  await expect(card).toContainText(outdoorTitle);
  await expect(card.locator(".meta-row")).toContainText(
    "Booking price to check",
  );
  await expect(card.locator(".meta-row")).not.toContainText("$0");
  await card.click();
  const accept = page.getByRole("button", {
    name: "Accept quest",
    exact: true,
  });
  const cost = page.getByRole("spinbutton", {
    name: "Total confirmed activity cost (USD)",
    exact: true,
  });
  await expect(cost).toHaveValue("");
  for (const checkbox of await page.getByRole("checkbox").all())
    await checkbox.check();
  await expect(accept).toBeDisabled();
  await cost.fill("295.01");
  await expect(accept).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "confirmed cost exceeds your budget",
  );
  await cost.fill("295");
  await expect(page.locator(".meta-row")).toContainText(
    /\$300(?:\.00)? group estimate/,
  );
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole("alert")).toContainText(acceptError);
  expect(control.calls[0].outing.setting).toBe("outside");
  expect((await accepted(page))[0].outing).toMatchObject({
    setting: "outside",
    confirmedVenueCostMinor: 29500,
    travelCostMinor: 500,
  });
});

test("a saved private outdoor quest collects a fresh quote and preserves it and its place when selected", async ({
  page,
}) => {
  const plan: Outing = {
    ...venuePlan,
    setting: "outside",
    applePlaceId: stop.id,
    travelCostMinor: 500,
    confirmedVenueCostMinor: 10000,
    venuePermission: true,
    arrangementConfirmed: true,
  };
  const candidate = result(plan, { conditional: true }).candidates[0];
  await prepare(page);
  await page.evaluate(
    async ({ candidate, plan }) => {
      const loaded = (path: string) =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => new URL(entry.name).pathname === path)
          .reverse()[0]?.name || path;
      const { api } = await import(loaded("/src/lib/api.ts"));
      const { ineligibilityIssues, estimateCost } = await import(
        loaded("/shared/recommend.ts")
      );
      api.quest = async () => ({ ...candidate, privatePlan: plan });
      api.viability = async () => ({
        viableCount: 0,
        alternatives: [],
        blockers: [],
        recoveries: [],
        confirmationFields: [],
      });
      api.quests = async (outing: Outing) => {
        const me = await api.me();
        if (
          ineligibilityIssues(candidate, outing, me.profile.preferences).length
        )
          return [];
        const cost = estimateCost(candidate, outing);
        return [
          {
            ...candidate,
            ready: true,
            estimatedCostMinMinor: cost.minMinor,
            estimatedCostMaxMinor: cost.maxMinor,
          },
        ];
      };
      window.history.pushState({}, "", `/create?template=${candidate.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    { candidate, plan },
  );
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  for (let step = 0; step < 5; step++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  const cost = page.getByRole("spinbutton", {
    name: "Total confirmed activity cost (USD)",
    exact: true,
  });
  await expect(cost).toHaveValue("");
  const permission = page.getByRole("checkbox", {
    name: "We have permission for the activity and filming.",
    exact: true,
  });
  const arrangements = page.getByRole("checkbox", {
    name: "We’ve arranged the required people, equipment or performance slot.",
    exact: true,
  });
  await expect(permission).not.toBeChecked();
  await expect(arrangements).not.toBeChecked();
  await cost.fill("295");
  await permission.check();
  await arrangements.check();
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  const card = page.locator(".quest-card");
  await expect(card.locator(".meta-row")).toContainText(
    /\$300(?:\.00)? group estimate/,
  );
  await card.click();
  await expect(page.locator(".meta-row")).toContainText(
    /\$300(?:\.00)? group estimate/,
  );
  const accept = page.getByRole("button", {
    name: "Accept quest",
    exact: true,
  });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole("alert")).toContainText(acceptError);
  expect((await accepted(page))[0].outing).toMatchObject({
    setting: "outside",
    applePlaceId: stop.id,
    confirmedVenueCostMinor: 29500,
    travelCostMinor: 500,
    arrangementConfirmed: true,
    venuePermission: true,
  });
});
