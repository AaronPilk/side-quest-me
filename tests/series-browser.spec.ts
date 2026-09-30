import { expect, test } from "@playwright/test";
import { selectDemoPersona } from "./demo-persona-helper";

test.use({ actionTimeout: 15_000 });

test("Series authoring, private drafts, prerequisites, following, and participant resume survive refresh", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/series/new");
  await expect(
    page.getByRole("heading", { name: "Start a series", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Series title", { exact: true })
    .fill("Three small stories");
  await page
    .getByLabel("Premise", { exact: true })
    .fill(
      "Start with a menu draft, then build on the result or take an independent detour.",
    );
  const parts = page.locator(".series-edit-part");
  await parts
    .nth(0)
    .getByLabel("Part title", { exact: true })
    .fill("The opening menu draft");
  await parts
    .nth(0)
    .getByLabel("Reviewed quest", { exact: true })
    .selectOption("date_menu_draft_chill_v1");
  await page.getByRole("button", { name: "Add part", exact: true }).click();
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("Use the first result");
  await parts
    .nth(1)
    .getByLabel("Reviewed quest", { exact: true })
    .selectOption("day_tiny_discovery_chill_v1");
  await parts
    .nth(1)
    .getByLabel("Prerequisite", { exact: true })
    .selectOption({ index: 1 });
  await parts
    .nth(1)
    .getByLabel("Why is that part required?", { exact: true })
    .fill("Bring your first menu choice to inspire the next discovery.");
  await parts
    .nth(1)
    .getByLabel("Include this part when the series is published")
    .check();
  await page.getByRole("button", { name: "Add part", exact: true }).click();
  await parts
    .nth(2)
    .getByLabel("Part title", { exact: true })
    .fill("An independent broadcast");
  await parts
    .nth(2)
    .getByLabel("Reviewed quest", { exact: true })
    .selectOption("night_pocket_radio_bold_v1");
  await parts
    .nth(2)
    .getByLabel("Include this part when the series is published")
    .check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Three small stories", exact: true }),
  ).toBeVisible();
  const seriesUrl = page.url();
  await page.reload();
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.getByRole("alert")).toContainText(
    "This series is not available.",
  );
  await selectDemoPersona(page, "creator");
  await page.goto(seriesUrl);
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(page.getByText("3 PART STORY", { exact: true })).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  const cards = page.locator(".series-part");
  await expect(cards).toHaveCount(3);
  await expect(
    cards.nth(1).getByText(/Complete the required earlier part/),
  ).toBeVisible();
  await expect(
    cards.nth(1).getByRole("link", { name: "Try your own version" }),
  ).toHaveCount(0);
  await expect(
    cards.nth(2).getByRole("link", { name: "Try your own version" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Follow series", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Following · Unfollow", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Following · Unfollow", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start series", exact: true }).click();
  await expect(page).toHaveURL(/seriesPart=/);
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  for (const heading of [
    "What’s your budget?",
    "How much time do you have?",
    "Where are we doing this?",
    "Ready to find your quest?",
  ]) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\//);
  const runUrl = page.url();
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveAttribute("href", new URL(runUrl).pathname);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "creator");
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Start series", exact: true }),
  ).toBeVisible();
});

test("Ongoing Series publishes later parts with one Activity update and no invented final count", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/series/new");
  await page
    .getByLabel("Series title", { exact: true })
    .fill("A story still growing");
  await page
    .getByLabel("Premise", { exact: true })
    .fill("Independent adventures, published as they become ready.");
  await page
    .getByLabel("Story format", { exact: true })
    .selectOption("ongoing");
  const parts = page.locator(".series-edit-part");
  await parts
    .nth(0)
    .getByLabel("Part title", { exact: true })
    .fill("First available chapter");
  await parts
    .nth(0)
    .getByLabel("Reviewed quest", { exact: true })
    .selectOption("day_tiny_discovery_chill_v1");
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  const url = page.url();
  await expect(
    page.getByText("1 PARTS AVAILABLE · ONGOING", { exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(url);
  await page
    .getByRole("button", { name: "Follow series", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Following · Unfollow", exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "creator");
  await page.goto(url);
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await page.getByRole("button", { name: "Add part", exact: true }).click();
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("A second chapter");
  await parts
    .nth(1)
    .getByLabel("Reviewed quest", { exact: true })
    .selectOption("day_pitch_swap_bold_v1");
  await parts
    .nth(1)
    .getByLabel("Include this part when the series is published")
    .check();
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(
    page.getByText("2 PARTS AVAILABLE · ONGOING", { exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto("/activity");
  await expect(
    page.getByText("A new part of A story still growing is available.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByText("A new part of A story still growing is available.", {
      exact: true,
    }),
  ).toHaveCount(1);
  await page.goto(url);
  await expect(page.locator(".series-part")).toHaveCount(2);
  await expect(page.locator(".series-part").first()).not.toContainText("of 2");
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.evaluate(() => document.documentElement.clientWidth),
  );
});
