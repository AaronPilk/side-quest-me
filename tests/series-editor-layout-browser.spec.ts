import { allowContentReview } from "./content-review-helper";
import { expect, test, type Page } from "@playwright/test";
import { openPartOptions, reviewSeries } from "./series-authoring-helpers";
import { selectDemoPersona } from "./demo-persona-helper";
import { acceptQuest, turnIntoSeries } from "./series-growth-helpers";

async function fitsScreen(page: Page, action = "Continue") {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const next = page.getByRole("button", { name: action, exact: true });
  if (await next.isVisible()) {
    await next.scrollIntoViewIfNeeded();
    const bounds = await next.boundingBox();
    const navigation = await page
      .getByRole("navigation", { name: "Primary", exact: true })
      .boundingBox();
    expect(
      bounds &&
        bounds.x >= 0 &&
        bounds.x + bounds.width <= (page.viewportSize()?.width ?? 0) + 1 &&
        bounds.height >= 44,
    ).toBeTruthy();
    expect(
      bounds && navigation && bounds.y + bounds.height <= navigation.y,
    ).toBeTruthy();
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

test("a series setup draft survives refresh, stays scoped to its author, and the saved series reopens in the editor", async ({
  page,
}) => {
  const runId = await acceptQuest(page);
  await page.goto(`/series/new?run=${runId}`);
  await page
    .getByLabel("Series title", { exact: true })
    .fill("A story I can come back to");
  await page.getByRole("radio", { name: "Ocean", exact: true }).check();
  await page.reload();
  await expect(page.getByLabel("Series title", { exact: true })).toHaveValue(
    "A story I can come back to",
  );
  await expect(
    page.getByRole("radio", { name: "Ocean", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".series-editor-footnote")).toContainText(
    "Your draft was restored.",
  );
  // Another person cannot open this quest's setup, let alone its draft.
  await selectDemoPersona(page, "viewer");
  await page.goto(`/series/new?run=${runId}`);
  await expect(page.getByLabel("Series title", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("alert")).toBeVisible();
  await selectDemoPersona(page, "creator");
  await page.goto(`/series/new?run=${runId}`);
  await expect(page.getByLabel("Series title", { exact: true })).toHaveValue(
    "A story I can come back to",
  );
  await page
    .getByRole("button", { name: "Turn into a series", exact: true })
    .click();
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page.reload();
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await expect(page.getByLabel("Series title", { exact: true })).toHaveValue(
    "A story I can come back to",
  );
  await page
    .locator(".series-editor-top")
    .getByRole("link", { name: "Series", exact: true })
    .click();
  await expect(page).toHaveURL(detailUrl);
});

for (const width of [320, 390, 430]) {
  for (const enlarged of [false, true]) {
    test(`Series setup is one screen and the editor presents one step at a time at ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const runId = await acceptQuest(page);
      await page.goto(`/series/new?run=${runId}`);
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      // Turning a quest into a series is a single screen: no steps to walk.
      const progress = page.getByRole("progressbar", {
        name: "Series setup progress",
        exact: true,
      });
      await expect(progress).toHaveCount(0);
      await expect(
        page.getByLabel("Series title", { exact: true }),
      ).toHaveValue("Three Things You Never Noticed");
      await expect(
        page.getByRole("group", { name: "Cover", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".series-edit-part")).toHaveCount(0);
      await page
        .getByLabel("Series title", { exact: true })
        .fill("Small detours with a story worth returning to");
      await page
        .getByLabel("Premise", { exact: true })
        .fill(
          "Find the small adventures hiding in ordinary places, then connect the chapters as the story grows.",
        );
      await fitsScreen(page, "Turn into a series");
      await page.screenshot({
        path: testInfo.outputPath("setup.png"),
        fullPage: true,
      });
      await turnIntoSeries(page);
      await page
        .getByRole("link", { name: "Edit series", exact: true })
        .click();
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      await expect(progress).toHaveAttribute("max", "4");
      await expect(progress).toHaveAttribute("value", "1");
      await expect(
        page.getByLabel("Series title", { exact: true }),
      ).toHaveValue("Small detours with a story worth returning to");
      await expect(
        page.getByRole("group", { name: "Story format", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".series-edit-part")).toHaveCount(0);
      await fitsScreen(page);
      await page.screenshot({
        path: testInfo.outputPath("story.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(progress).toHaveAttribute("value", "2");
      await expect(
        page.getByLabel("Series title", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("radio", { name: /Growing story/ }),
      ).toBeChecked();
      await page.getByRole("radio", { name: "Night", exact: true }).check();
      await fitsScreen(page);
      await page.screenshot({
        path: testInfo.outputPath("format.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(progress).toHaveAttribute("value", "3");
      const first = page.locator(".series-edit-part").first();
      // Part 1 is the quest the series grew from: its content is locked and
      // nothing lets the author add an unrelated quest.
      await expect(
        first.getByLabel("Part title", { exact: true }),
      ).toBeDisabled();
      await expect(first).toContainText("Three Things You Never Noticed");
      await expect(
        page.getByRole("button", { name: "Add part", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: /Choose a quest|Change quest/ }),
      ).toHaveCount(0);
      await openPartOptions(first);
      await expect(
        first.getByLabel("Prerequisite", { exact: true }),
      ).toHaveValue("");
      await fitsScreen(page);
      await page.screenshot({
        path: testInfo.outputPath("parts.png"),
        fullPage: true,
      });
      await reviewSeries(page);
      await expect(progress).toHaveAttribute("value", "4");
      await expect(page.locator(".series-edit-part")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Save draft", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByRole("button", { name: "Publish series", exact: true }),
      ).toBeDisabled();
      await allowContentReview(page);
      await expect(
        page.getByRole("button", { name: "Publish series", exact: true }),
      ).toBeEnabled();
      await fitsScreen(page);
      await page.screenshot({
        path: testInfo.outputPath("review.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(first).toContainText("Three Things You Never Noticed");
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByRole("radio", { name: "Night", exact: true }),
      ).toBeChecked();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByLabel("Series title", { exact: true }),
      ).toHaveValue("Small detours with a story worth returning to");
      await expect(page.getByLabel("Premise", { exact: true })).toHaveValue(
        /connect the chapters/,
      );
      await fitsScreen(page);
    });
  }
}
