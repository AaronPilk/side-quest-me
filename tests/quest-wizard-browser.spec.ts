import { expect, test, type Page } from "@playwright/test";
import { reviewQuestPlans } from "./quest-wizard-helpers";

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
  ).toHaveText(["Create", "Discover", "Activity", "Profile"]);
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
  await page.getByRole("button", { name: "2 hours", exact: true }).click();
  await next(page, "Where are we doing this?");
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await next(page, "Anything already arranged?");
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
    durationMinutes: 120,
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

test("venue questions keep permission explicit and returning home clears travel and adult nightlife context", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCreate(page);
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At a venue", exact: true }).click();
  // Editing the setting includes its newly applicable travel and permissions.
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit travel", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How are you getting there?",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".quest-location summary").click();
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Riverside");
  await page
    .getByRole("spinbutton", { name: "Round-trip travel (min)", exact: true })
    .fill("20");
  await page
    .getByRole("spinbutton", { name: "Travel estimate (USD)", exact: true })
    .fill("8");
  await page
    .getByRole("combobox", { name: "Getting there", exact: true })
    .selectOption("transit");
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Edit arrangements", exact: true })
    .click();
  const permission = page.getByRole("checkbox", {
    name: "We have permission for the activity and filming.",
    exact: true,
  });
  const adultEligibility = page.getByRole("checkbox", {
    name: "All participants meet the venue’s legal age requirement.",
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
    travelMinutes: 20,
    travelCostMinor: 800,
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
  await expect(page.locator(".quest-card")).toHaveCount(2);
  expect(errors).toEqual([]);
});
