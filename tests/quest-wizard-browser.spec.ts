import { expect, test, type Page } from "@playwright/test";
import { reviewQuestPlans } from "./quest-wizard-helpers";
import { DEFAULT_OUTING } from "../shared/domain";

async function openCreate(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/create");
}

async function next(page: Page, heading: string) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
}

async function draft(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("sq-outing")!));
}

test("Create is first and asks one question at a time, preserving answers through Back, refresh and review edits", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCreate(page);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link"),
  ).toHaveText(["Create", "Discover", "Rewards", "Activity", "Profile"]);
  await expect(
    page.getByRole("heading", { name: "What’s the plan?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Budget in dollars" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Group", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Daytime", exact: true }).click();
  await next(page, "How far are we taking this?");
  await expect(
    page.getByRole("button", { name: "Daytime", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await next(page, "Who’s coming?");
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Group size", exact: true })
    .fill("5");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bold", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await next(page, "Who’s coming?");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Friends", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("spinbutton", { name: "Group size", exact: true }),
  ).toHaveValue("5");
  await next(page, "What’s your budget?");
  const budget = page.getByRole("spinbutton", { name: "Budget in dollars" });
  await expect(budget).toHaveValue("0");
  await budget.fill("");
  await expect(budget).toHaveValue("");
  await budget.pressSequentially("100");
  await expect(budget).toHaveValue("100");
  await budget.fill("0100");
  await expect(budget).toHaveValue("100");
  await budget.fill("-1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What’s your budget?", exact: true }),
  ).toBeVisible();
  await budget.fill("30");
  await page
    .getByRole("combobox", { name: "Budget is for", exact: true })
    .selectOption("per_person");
  await next(page, "How much time do you have?");
  await expect(
    page
      .getByRole("group", { name: "Available time", exact: true })
      .getByRole("button"),
  ).toHaveText(["1 hour", "3 hours", "5 hours", "Unlimited time"]);
  await expect(
    page.getByRole("spinbutton", {
      name: "Custom available time (minutes)",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Unlimited time", exact: true })
    .click();
  expect(await draft(page)).toMatchObject({ durationMinutes: null });
  await page.getByRole("button", { name: "5 hours", exact: true }).click();
  expect(await draft(page)).toMatchObject({ durationMinutes: 300 });
  await page.getByRole("button", { name: "3 hours", exact: true }).click();
  await next(page, "Where are we doing this?");
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await next(page, "Ready to find your quest?");
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit group", exact: true }).click();
  const groupSize = page.getByRole("spinbutton", {
    name: "Group size",
    exact: true,
  });
  // Per-person budget display must also tolerate invalid group-size drafts.
  for (const invalidSize of ["0", "13"]) {
    await groupSize.fill(invalidSize);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Who’s coming?", exact: true }),
    ).toBeVisible();
  }
  await groupSize.fill("5");
  await next(page, "Ready to find your quest?");
  await page.getByRole("button", { name: "Edit budget", exact: true }).click();
  await expect(budget).toHaveValue("30");
  await budget.fill("25");
  await next(page, "Ready to find your quest?");
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  expect(await draft(page)).toMatchObject({
    category: "daytime",
    intensity: "bold",
    group: "friends",
    participants: 5,
    budgetMinor: 2500,
    budgetScope: "per_person",
    durationMinutes: 180,
    setting: "home",
  });
  await page.screenshot({
    path: testInfo.outputPath("create-review-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit plans", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit budget", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit plans", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("optional venue details keep permission explicit and returning home clears adult nightlife context", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCreate(page);
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At a venue", exact: true }).click();
  // Editing an away setting includes its optional location step.
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit travel", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Where should we go?",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Riverside");
  await expect(
    page.getByRole("spinbutton", {
      name: "Round-trip travel (min)",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", {
      name: "Travel estimate (USD)",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Getting there", exact: true })
    .selectOption("transit");
  await reviewQuestPlans(page);
  await page.locator(".quest-arrangements summary").click();
  const permission = page.getByRole("checkbox", {
    name: "We have permission for the activity and filming.",
    exact: true,
  });
  const adultEligibility = page.getByRole("checkbox", {
    name: "All participants are adults and meet the venue’s legal age requirement.",
    exact: true,
  });
  const nightlife = page.getByRole("checkbox", {
    name: "Include explicitly agreed adult nightlife contexts.",
    exact: true,
  });
  await expect(permission).not.toBeChecked();
  await expect(adultEligibility).not.toBeChecked();
  await expect(nightlife).toBeDisabled();
  await expect(
    page.getByRole("spinbutton", {
      name: "Confirmed total admission / room cost (USD)",
      exact: true,
    }),
  ).toHaveValue("");
  await permission.check();
  await adultEligibility.check();
  await nightlife.check();
  await page
    .getByRole("spinbutton", {
      name: "Confirmed total admission / room cost (USD)",
      exact: true,
    })
    .fill("12");
  await reviewQuestPlans(page);
  await page.reload();
  expect(await draft(page)).toMatchObject({
    setting: "venue",
    area: "Riverside",
    travelMinutes: 0,
    travelCostMinor: 0,
    transport: "transit",
    venuePermission: true,
    adultEligible: true,
    adultContext: true,
    confirmedVenueCostMinor: 1200,
  });
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await reviewQuestPlans(page);
  await expect(
    page.getByRole("button", { name: "Edit travel", exact: true }),
  ).toHaveCount(0);
  expect(await draft(page)).toMatchObject({
    setting: "home",
    travelMinutes: 0,
    travelCostMinor: 0,
    transport: "none",
    adultContext: false,
  });
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("older arrangement drafts preserve their answers and expose saved travel estimates for explicit removal", async ({
  page,
}) => {
  await page.addInitScript(
    (outing) => {
      sessionStorage.setItem("sq-demo-started", "1");
      if (sessionStorage.getItem("sq-outing")) return;
      sessionStorage.setItem("sq-outing", JSON.stringify(outing));
      sessionStorage.setItem(
        "sq-quest-flow",
        JSON.stringify({
          version: 2,
          targetId: null,
          step: "arrangements",
          editing: false,
          confirmed: [],
          requiredFields: [],
        }),
      );
    },
    {
      ...DEFAULT_OUTING,
      category: "date_night",
      intensity: "full_send",
      setting: "outside",
      budgetMinor: 10000,
      durationMinutes: 120,
      travelMinutes: 20,
      travelCostMinor: 800,
    },
  );
  await page.goto("/create");
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit time", exact: true }),
  ).toContainText("2 hours");
  await expect(
    page.getByText("Your saved plan reserves 20 minutes and $8 for travel."),
  ).toBeVisible();
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Clear saved travel estimates", exact: true })
    .click();
  await page.reload();
  expect(await draft(page)).toEqual({
    ...before,
    travelMinutes: 0,
    travelCostMinor: 0,
  });
});

test("a Full Send outdoor date for two keeps every answer and finds a compatible quest", async ({
  page,
}) => {
  await openCreate(page);
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await next(page, "How far are we taking this?");
  await page.getByRole("button", { name: "Full Send", exact: true }).click();
  await next(page, "Who’s coming?");
  await page.getByRole("button", { name: "Couple", exact: true }).click();
  await next(page, "What’s your budget?");
  await page.getByRole("spinbutton", { name: "Budget in dollars" }).fill("100");
  await next(page, "How much time do you have?");
  await page.getByRole("button", { name: "3 hours", exact: true }).click();
  await next(page, "Where are we doing this?");
  await page.getByRole("button", { name: "Outside", exact: true }).click();
  await next(page, "Where should we go?");
  await expect(page.locator(".quest-recovery")).toHaveCount(0);
  await next(page, "Ready to find your quest?");
  await expect(
    page.getByRole("button", { name: "Edit intensity", exact: true }),
  ).toContainText("Full Send");
  await expect(
    page.getByRole("button", { name: "Edit group", exact: true }),
  ).toContainText("Couple · 2 people");
  await expect(page.locator(".quest-arrangements")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(page.locator(".quest-recovery")).toHaveCount(0);
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card").first()).toBeVisible();
  for (const card of await page.locator(".quest-card").all()) {
    await expect(card.locator(".eyebrow")).toHaveText("Date Night · Full Send");
    await expect(card).not.toContainText("Chill");
    await expect(card).not.toContainText("4–6");
  }
  expect(await draft(page)).toEqual(before);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  const run = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0],
  );
  expect(run.outing).toMatchObject({
    category: "date_night",
    intensity: "full_send",
    group: "couple",
    participants: 2,
    budgetMinor: 10000,
    durationMinutes: 180,
    setting: "outside",
  });
  expect(run.quest.intensity).toBe("full_send");
  expect(run.quest.minParticipants).toBeLessThanOrEqual(2);
  expect(run.quest.maxParticipants).toBeGreaterThanOrEqual(2);
  expect(run.quest.settings).toContain("outside");
});

test("more quest ideas explores distinct matching families without changing the plan", async ({
  page,
}) => {
  await openCreate(page);
  await reviewQuestPlans(page);
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(3);
  const first = await page.locator(".quest-card h2").allTextContents();
  await page
    .getByRole("button", { name: "More quest ideas", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(6);
  expect(
    (await page.locator(".quest-card h2").allTextContents()).slice(0, 3),
  ).toEqual(first);
  for (let pageNumber = 0; pageNumber < 8; pageNumber++) {
    const more = page.getByRole("button", {
      name: "More quest ideas",
      exact: true,
    });
    if (!(await more.isVisible())) break;
    await more.click();
  }
  await expect(
    page.getByText("You’ve seen all the activities that fit this plan."),
  ).toBeVisible();
  const titles = await page.locator(".quest-card h2").allTextContents();
  expect(titles.length).toBeGreaterThan(9);
  expect(new Set(titles).size).toBe(titles.length);
  expect(await draft(page)).toEqual(before);
  for (const text of await page
    .locator(".quest-card .eyebrow")
    .allTextContents())
    expect(text).toContain("Chill");
});
