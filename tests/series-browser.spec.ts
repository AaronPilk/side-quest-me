import { expect, test } from "@playwright/test";
import { selectDemoPersona } from "./demo-persona-helper";
import {
  openPartOptions,
  reachSeriesParts,
  reviewSeries,
} from "./series-authoring-helpers";
import {
  acceptQuest,
  createNextPart,
  markRunFinalized,
  turnIntoSeries,
} from "./series-growth-helpers";

test.use({ actionTimeout: 15_000 });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

test("Series grown from a quest: private drafts, prerequisites, publication, following, and participant resume survive refresh", async ({
  page,
}) => {
  // The author does the quest three times; each attempt becomes a part.
  const first = await acceptQuest(page);
  await markRunFinalized(page, first);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page, "Three small stories");
  const second = await createNextPart(page, 2);
  await markRunFinalized(page, second);
  await page.goto(seriesUrl);
  const third = await createNextPart(page, 3);
  await markRunFinalized(page, third);
  await page.goto(seriesUrl);
  await expect(page.locator(".series-progress")).toContainText(
    "3 parts completed.",
  );
  await page.reload();
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.getByRole("alert")).toContainText(
    "This series is not available.",
  );
  // The editor shapes the story (planned, prerequisites, titles) but adds no quests.
  await selectDemoPersona(page, "creator");
  await page.goto(seriesUrl);
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await page
    .getByLabel("Premise", { exact: true })
    .fill(
      "Start with a tiny discovery, then build on the result or take an independent detour.",
    );
  await reachSeriesParts(page, "planned");
  const parts = page.locator(".series-edit-part");
  await expect(parts).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Add part", exact: true }),
  ).toHaveCount(0);
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("Use the first result");
  await openPartOptions(parts.nth(1));
  await parts
    .nth(1)
    .getByLabel("Prerequisite", { exact: true })
    .selectOption({ index: 1 });
  await parts
    .nth(1)
    .getByLabel("Why is that part required?", { exact: true })
    .fill("Bring your first discovery to inspire the next one.");
  await parts
    .nth(2)
    .getByLabel("Part title", { exact: true })
    .fill("An independent detour");
  for (const index of [0, 1, 2]) {
    await openPartOptions(parts.nth(index));
    await parts
      .nth(index)
      .getByLabel("Include this part when the series is published")
      .check();
  }
  await reviewSeries(page);
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(page.getByText("3 PART STORY", { exact: true })).toBeVisible();
  // A published planned story keeps its part count.
  await expect(
    page.getByRole("button", { name: "Create Part 4", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("A published planned story keeps its part count.", {
      exact: false,
    }),
  ).toBeVisible();
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
  // The author's own progress is separate from the viewer's.
  await selectDemoPersona(page, "creator");
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".series-progress")).toContainText(
    "Series complete.",
  );
});

test("Ongoing Series publishes later parts with one Activity update and no invented final count", async ({
  page,
}) => {
  const first = await acceptQuest(page);
  await markRunFinalized(page, first);
  await page.reload();
  const url = await turnIntoSeries(page, "A story still growing");
  await page
    .getByRole("button", { name: "Publish Part 1", exact: true })
    .click();
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
  const second = await createNextPart(page, 2);
  await markRunFinalized(page, second);
  await page.goto(url);
  await page
    .getByRole("button", { name: "Publish Part 2", exact: true })
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
