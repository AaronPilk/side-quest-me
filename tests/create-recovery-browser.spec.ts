import { expect, test, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type QuestVariant,
} from "../shared/domain";
import { reviewQuestPlans } from "./quest-wizard-helpers";

test.use({ actionTimeout: 15_000 });

async function next(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function savedOuting(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("sq-outing")!));
}

function original(patch: Partial<QuestVariant> = {}): QuestVariant {
  const base = catalog.find((quest) => quest.id === "date_pit_crew_chill_v1")!;
  return {
    ...base,
    id: "original_daytime_rehearsal_v1",
    familyId: "original_daytime_rehearsal",
    title: "A daytime story rehearsal",
    hook: "A browser fixture for a small, willing group to rehearse a story.",
    category: "daytime",
    intensity: "chill",
    durationMinutes: 30,
    minParticipants: 2,
    maxParticipants: 2,
    settings: ["home", "outside"],
    cost: { ...base.cost, minMinor: 0, maxMinor: 0, venueCostUnknown: false },
    arrangementRequired: false,
    venuePermissionRequired: false,
    adultOnly: false,
    requiresVolunteer: false,
    supportsAdultContext: false,
    conflicts: [],
    ...patch,
  };
}

async function openOriginal(
  page: Page,
  quest: QuestVariant,
  preferences: Preferences = DEFAULT_PREFERENCES,
) {
  await page.addInitScript(
    ({ quest, preferences }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      const actorId = "11111111-1111-4111-8111-111111111111";
      if (!localStorage.getItem("sidequest-community-demo-v1"))
        localStorage.setItem(
          "sidequest-community-demo-v1",
          JSON.stringify({
            creators: {
              [actorId]: {
                id: actorId,
                displayName: "Browser fixture creator",
                avatarKey: "coral",
                bio: "Local test fixture",
                openToBrands: false,
                version: 1,
                publishedCount: 0,
                attemptCount: 0,
                authoredCount: 1,
                demo: true,
              },
            },
            posts: [],
            drafts: [
              {
                id: "88888888-8888-4888-8888-888888888888",
                authorId: actorId,
                state: "approved",
                version: 1,
                quest,
                reviewNotes: "Approved local browser-test fixture.",
                templateId: quest.id,
                createdAt: "2026-09-29T12:00:00Z",
              },
            ],
            brands: [],
            offers: [],
            activity: [],
            reports: [],
            blocks: [],
            readIds: [],
            requests: {},
          }),
        );
      if (!localStorage.getItem("sidequest-demo-v1"))
        localStorage.setItem(
          "sidequest-demo-v1",
          JSON.stringify({
            me: {
              profile: {
                displayName: "Browser fixture creator",
                timezone: "UTC",
                locale: "en",
                summary: "",
                onboardingCompleted: true,
                preferences,
              },
              wallet: { xp: 0, points: 0, version: 0 },
              roles: [],
            },
            runs: [],
          }),
        );
    },
    { quest, preferences },
  );
  await page.goto(`/create?template=${quest.id}`);
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
}

test("Daytime Bold for a couple with $25 and one hour at home finds a real quest without inventing arrangements", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/create");
  await page.getByRole("button", { name: "Daytime", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await next(page);
  await expect(page.locator(".quest-recovery")).toHaveCount(0);
  await page.getByRole("button", { name: "Couple", exact: true }).click();
  await next(page);
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Budget in dollars" }).fill("25");
  await next(page);
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await next(page);
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await next(page);
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".quest-arrangements")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".quest-arrangements summary").click();
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  await reviewQuestPlans(page);
  const expected = {
    category: "daytime",
    intensity: "bold",
    group: "couple",
    participants: 2,
    budgetMinor: 2500,
    budgetScope: "total",
    durationMinutes: 60,
    setting: "home",
    arrangementConfirmed: false,
    adultEligible: false,
    venuePermission: false,
  };
  expect(await savedOuting(page)).toMatchObject(expected);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card").first()).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Nothing quite fits. Yet.",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("daytime-couple-recommendations.png"),
    fullPage: true,
  });
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0].outing,
    ),
  ).toMatchObject(expected);
});

test("unfinished plans show no premature matches or failure claims", async ({
  page,
}) => {
  await openOriginal(
    page,
    original({
      minParticipants: 4,
      maxParticipants: 4,
      durationMinutes: 120,
      settings: ["outside"],
      cost: {
        ...catalog[0].cost,
        minMinor: 2000,
        maxMinor: 2500,
        venueCostUnknown: false,
      },
      arrangementRequired: true,
    }),
  );
  await expect(page.locator(".quest-fit-status, .quest-recovery")).toHaveCount(
    0,
  );
  expect(await savedOuting(page)).toMatchObject({
    group: "couple",
    budgetMinor: 0,
    durationMinutes: 60,
    setting: "home",
    arrangementConfirmed: false,
  });
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  await next(page);
  await expect(page.locator(".quest-fit-status, .quest-recovery")).toHaveCount(
    0,
  );
  expect(await savedOuting(page)).toMatchObject({
    participants: 4,
    budgetMinor: 0,
    durationMinutes: 60,
    setting: "home",
    arrangementConfirmed: false,
  });
});

for (const requirement of ["adultOnly", "requiresVolunteer"] as const)
  test(`a targeted Daytime original exposes and enforces ${requirement} at home`, async ({
    page,
  }) => {
    await openOriginal(page, original({ [requirement]: true }));
    await reviewQuestPlans(page);
    const adultConfirmation = page.getByRole("checkbox", { name: /adults/i });
    await expect(adultConfirmation).toBeVisible();
    await expect(adultConfirmation).not.toBeChecked();
    await reviewQuestPlans(page);
    await page
      .getByRole("button", { name: "Check this quest", exact: true })
      .click();
    await expect(page.locator(".quest-card")).toHaveCount(0);
    await expect(
      page
        .getByText(
          "Explicit adult eligibility is required for this activity.",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    expect(await savedOuting(page)).toMatchObject({
      adultEligible: false,
      setting: "home",
    });
    await page.getByRole("button", { name: "Edit plans", exact: true }).click();
    await adultConfirmation.check();
    await reviewQuestPlans(page);
    await page
      .getByRole("button", { name: "Check this quest", exact: true })
      .click();
    await expect(page.locator(".quest-card")).toHaveCount(1);
    await page.locator(".quest-card").click();
    await page
      .getByRole("button", { name: "Accept quest", exact: true })
      .click();
    await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
    const run = await page.evaluate(
      () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0],
    );
    expect(run.quest[requirement]).toBe(true);
    expect(run.outing).toMatchObject({
      adultEligible: true,
      adultContext: false,
      setting: "home",
    });
  });

test("a target that needs another group never changes the user's group or offers mismatched alternatives", async ({
  page,
}) => {
  await openOriginal(page, original());
  await page.getByRole("button", { name: "Solo", exact: true }).click();
  await reviewQuestPlans(page);
  const before = await savedOuting(page);
  await expect(page.locator(".quest-recovery")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No matches for these answers yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".quest-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(0);
  await expect(page.getByText(/This quest needs/)).toHaveCount(0);
  expect(await savedOuting(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Review my answers", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit group", exact: true }).click();
  await page.getByRole("button", { name: "Couple", exact: true }).click();
  await reviewQuestPlans(page);
  expect(await savedOuting(page)).toEqual({
    ...before,
    participants: 2,
    group: "couple",
  });
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
});

test("recovery never bypasses a confirmed custom boundary", async ({
  page,
}) => {
  await openOriginal(page, original(), {
    ...DEFAULT_PREFERENCES,
    otherExclusion: "No loud music",
    sources: { otherExclusion: "survey" },
  });
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "No matches for these answers yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        "Your custom boundary needs review. Select matching listed boundaries or edit it before choosing a quest.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile
          .preferences.otherExclusion,
    ),
  ).toBe("No loud music");
});
