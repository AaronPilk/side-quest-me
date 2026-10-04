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

test("Create is centered and asks one question at a time, preserving answers through Back, refresh and review edits", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCreate(page);
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link"),
  ).toHaveText(["Discover", "Activity", "Create", "Rewards", "Profile"]);
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
  const slider = page.getByRole("slider", { name: "Budget slider in dollars" });
  await expect(slider).toHaveValue("0");
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue("5");
  expect((await draft(page)).budgetMinor).toBe(500);
  await slider.press("Home");
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Each person", exact: true }).click();
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
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
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

test("new quest planning omits generic booking requirements and preserves visible transport choices", async ({
  page,
}) => {
  await openCreate(page);
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At a venue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose a town", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Town or neighborhood", exact: true })
    .fill("Riverside");
  await page
    .getByRole("button", { name: "Public transit", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Getting there" }),
  ).toHaveCount(0);
  await reviewQuestPlans(page);
  const nightlife = page.getByRole("region", {
    name: "Adult nightlife preferences",
    exact: true,
  });
  await expect(nightlife).toBeVisible();
  await expect(
    nightlife.getByRole("link", {
      name: "Set your age group for adult experiences",
      exact: true,
    }),
  ).toHaveAttribute("href", "/preferences?step=account&returnTo=%2Fcreate");
  // Age setup is available at review, but adult opt-in and generic booking
  // confirmations must not be silently enabled for an unanswered account.
  await expect(nightlife.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator("details.quest-arrangements")).toHaveCount(0);
  await expect(
    page.getByRole("spinbutton", { name: /confirmed.*cost/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: /booking|equipment|permission|filming/i,
    }),
  ).toHaveCount(0);
  await page.reload();
  expect(await draft(page)).toMatchObject({
    setting: "venue",
    area: "Riverside",
    transport: "transit",
    venuePermission: false,
    arrangementConfirmed: false,
    confirmedVenueCostMinor: null,
    adultEligible: false,
    adultContext: false,
  });
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await reviewQuestPlans(page);
  await expect(nightlife).toHaveCount(0);
  expect(await draft(page)).toMatchObject({
    setting: "home",
    transport: "none",
    adultContext: false,
  });
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

test("without AI, an unmatched Full Send outdoor date keeps its answers and reports no fit honestly", async ({
  page,
}) => {
  await openCreate(page);
  const configuration = await page.evaluate(async () => {
    const modulePath =
      performance
        .getEntriesByType("resource")
        .filter(
          (entry) =>
            new URL(entry.name).pathname === "/src/lib/ai-quest-api.ts",
        )
        .reverse()[0]?.name || "/src/lib/ai-quest-api.ts";
    return (await import(modulePath)).aiQuestApi.config();
  });
  expect(configuration).toEqual({
    configured: false,
    provider: null,
    model: null,
  });
  const discoveryRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/quests/discover")
      discoveryRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await next(page, "How far are we taking this?");
  await page.getByRole("button", { name: "Full Send", exact: true }).click();
  await next(page, "Who’s coming?");
  await page.getByRole("button", { name: "Couple", exact: true }).click();
  await next(page, "What’s your budget?");
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
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
  await expect(page.locator(".quest-arrangements")).toHaveCount(0);
  await expect(page.locator(".quest-recovery")).toHaveCount(0);
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No matches for these answers yet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Quest matching help", exact: true }),
  ).toContainText(
    "Your choices are saved. We haven’t found a published quest that meets all of them.",
  );
  await expect(page.locator(".quest-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Try / })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toHaveCount(0);
  expect(discoveryRequests).toEqual([]);
  expect(await draft(page)).toEqual(before);
  expect(await draft(page)).toMatchObject({
    category: "date_night",
    intensity: "full_send",
    group: "couple",
    participants: 2,
    budgetMinor: 10000,
    durationMinutes: 180,
    setting: "outside",
  });
  await page
    .getByRole("button", { name: "Review my answers", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit intensity", exact: true }),
  ).toContainText("Full Send");
  await expect(
    page.getByRole("button", { name: "Edit group", exact: true }),
  ).toContainText("Couple · 2 people");
  await expect(
    page.getByRole("button", { name: "Edit setting", exact: true }),
  ).toContainText("Outside");
  expect(await draft(page)).toEqual(before);
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

test("ordinary questions fit a 393 by 852 iPhone with bottom actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openCreate(page);
  for (const title of [
    "What’s the plan?",
    "How far are we taking this?",
    "Who’s coming?",
    "What’s your budget?",
    "How much time do you have?",
    "Where are we doing this?",
  ]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const measurements = await page.evaluate(() => ({
      height: window.innerHeight,
      scroll: document.documentElement.scrollHeight,
      footer: document
        .querySelector(".quest-flow-actions")!
        .getBoundingClientRect().bottom,
      nav: document.querySelector(".bottom-nav")!.getBoundingClientRect().top,
    }));
    expect(measurements.scroll).toBeLessThanOrEqual(measurements.height + 2);
    expect(measurements.footer).toBeLessThan(measurements.nav);
    expect(measurements.nav - measurements.footer).toBeLessThan(95);
    if (title !== "Where are we doing this?")
      await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
});

test("native travel fits above navigation and keeps town and place options accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
  });
  await page.addInitScript(
    (outing) => {
      sessionStorage.setItem("sq-demo-started", "1");
      if (!sessionStorage.getItem("sq-outing")) {
        sessionStorage.setItem("sq-outing", JSON.stringify(outing));
        sessionStorage.setItem(
          "sq-quest-flow",
          JSON.stringify({
            version: 3,
            targetId: null,
            step: "travel",
            editing: false,
            confirmed: [],
            requiredFields: [],
          }),
        );
      }
    },
    { ...DEFAULT_OUTING, setting: "venue", area: "", applePlaceId: null },
  );
  await page.goto("/create");
  await page.evaluate(() =>
    document.documentElement.classList.add("native-app"),
  );
  await expect(
    page.getByRole("heading", { name: "Where should we go?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use my current area", exact: true }),
  ).toBeVisible();
  const town = page.getByRole("button", { name: "Choose a town", exact: true });
  await expect(town).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("textbox", { name: "Town or neighborhood", exact: true }),
  ).toHaveCount(0);
  const measurements = await page.evaluate(() => ({
    height: innerHeight,
    scroll: document.documentElement.scrollHeight,
    footer: document
      .querySelector(".quest-flow-actions")!
      .getBoundingClientRect().bottom,
    nav: document.querySelector(".bottom-nav")!.getBoundingClientRect().top,
  }));
  expect(measurements.scroll).toBeLessThanOrEqual(measurements.height + 2);
  expect(measurements.footer).toBeLessThan(measurements.nav);
  await page.screenshot({ path: ".local/beta-travel-native-393.png" });
  await page
    .getByRole("button", { name: "Public transit", exact: true })
    .click();
  expect((await draft(page)).transport).toBe("transit");
  await town.click();
  await expect(town).toHaveAttribute("aria-expanded", "true");
  await page
    .getByRole("textbox", { name: "Town or neighborhood", exact: true })
    .fill("Riverside");
  await page.reload();
  await expect(town).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("textbox", { name: "Town or neighborhood", exact: true }),
  ).toHaveValue("Riverside");
  await expect(
    page.getByRole("button", { name: "Explore this area", exact: true }),
  ).toBeVisible();
  const specific = page.getByRole("button", {
    name: "Have a specific place?",
    exact: true,
  });
  await expect(specific).toHaveAttribute("aria-expanded", "false");
  await specific.click();
  await expect(specific).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".apple-place-picker")).toBeVisible();
});
