import { allowContentReview } from "./content-review-helper";
import { reviewPendingReel } from "./reel-publication-helper";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import { reviewQuestPlans } from "./quest-wizard-helpers";
import { selectDemoPersona } from "./demo-persona-helper";
import type { Run } from "../src/lib/types";
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

async function verifyLayouts(page: Page, info: TestInfo, surface: string) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (surface === "series-episode") {
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Close reel" })).toHaveCount(
        1,
      );
      const bounds = await page.locator(".reel-viewer-header").boundingBox();
      expect(bounds?.x).toBe(0);
      expect(bounds?.width).toBe(width);
    }
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`${surface}-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath(`${surface}-320-text200.png`),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize({ width: 390, height: 844 });
}

async function acceptTarget(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await page.locator(".quest-card").click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
}

test("a real Series attempt completes privately, publishes a frozen episode, and inspires a separate linked attempt", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // The author does the quest three times; the series grows one part per attempt.
  const firstRun = await acceptQuest(page);
  await markRunFinalized(page, firstRun);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page, "A story in three experiments");
  for (const position of [2, 3]) {
    const run = await createNextPart(page, position);
    await markRunFinalized(page, run);
    await page.goto(seriesUrl);
  }
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await page
    .getByLabel("Premise", { exact: true })
    .fill(
      "An independent middle chapter opens the way to the final experiment.",
    );
  await reachSeriesParts(page, "planned");
  const editParts = page.locator(".series-edit-part");
  await expect(editParts).toHaveCount(3);
  for (const [index, title] of [
    [1, "The middle discovery"],
    [2, "Build on the middle"],
  ] as const) {
    await editParts
      .nth(index)
      .getByLabel("Part title", { exact: true })
      .fill(title);
  }
  for (const index of [0, 1, 2]) {
    await openPartOptions(editParts.nth(index));
    await editParts
      .nth(index)
      .getByLabel("Include this part when the series is published")
      .check();
  }
  await editParts
    .nth(2)
    .getByLabel("Prerequisite", { exact: true })
    .selectOption({ index: 2 });
  await editParts
    .nth(2)
    .getByLabel("Why is that part required?", { exact: true })
    .fill("Use what you found in the middle chapter.");
  await reviewSeries(page);
  await allowContentReview(page);
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(
    page.getByRole("heading", {
      name: "A story in three experiments",
      exact: true,
    }),
  ).toBeVisible();
  const seriesPath = new URL(seriesUrl).pathname;
  await expect(page.locator(".series-part")).toHaveCount(3);
  const sourcePartIds = await page
    .locator(".series-part")
    .evaluateAll((parts) => parts.map((part) => part.id.slice(5)));

  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.locator(".series-part").nth(2)).toContainText(
    "Complete the required earlier part",
  );
  await page
    .locator(".series-part")
    .nth(1)
    .getByRole("link", { name: "Try your own version", exact: true })
    .click();
  await acceptTarget(page);
  const runUrl = page.url();
  await page
    .getByRole("button", { name: "Record or import video", exact: true })
    .click();
  const capture = page.getByRole("dialog", { name: "Record your quest" });
  await expect(capture.getByLabel("Import video")).toBeEnabled();
  await capture
    .getByLabel("Import video")
    .setInputFiles(path.resolve(".local/fixtures/landscape-with-audio.mp4"));
  await capture
    .getByRole("button", { name: "Save video", exact: true })
    .click();
  await expect(capture).toBeHidden();
  await page
    .getByRole("checkbox", { name: "I genuinely attempted", exact: false })
    .check();
  await page
    .getByRole("checkbox", { name: "I have permission", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Complete quest", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save video", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Keep private", exact: true }).click();
  const completed = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("sidequest-demo-v1:viewer")!);
    return { run: data.runs[0] as Run, wallet: data.me.wallet };
  });
  expect(completed.run.status).toBe("finalized");
  expect(completed.run.clips).toHaveLength(1);
  expect(completed.run.clips[0]).toMatchObject({
    mode: "session",
    slot: 0,
    start: 0,
  });
  expect(completed.run.render?.status).toBe("ready");
  expect(completed.run.series?.partId).toBe(sourcePartIds[1]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Complete quest", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1:viewer")!).me.wallet,
    ),
  ).toEqual(completed.wallet);
  await page.goto("/discover");
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page.goto(seriesUrl);
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed. Your progress is private.",
  );
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "Part 2 of 3 · Completed",
  );
  await expect(
    page
      .locator(".series-part")
      .nth(2)
      .getByRole("link", { name: "Try your own version", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed.",
  );
  await verifyLayouts(page, testInfo, "series-detail");

  // A later metadata edit cannot rewrite attribution attached to an accepted attempt.
  await selectDemoPersona(page, "creator");
  await page.goto(`${seriesUrl}/edit`);
  await page
    .getByLabel("Series title", { exact: true })
    .fill("The renamed three experiments");
  await reachSeriesParts(page);
  await reviewSeries(page);
  await allowContentReview(page);
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(
    page.getByRole("heading", {
      name: "The renamed three experiments",
      exact: true,
    }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(runUrl);
  await page
    .locator("summary")
    .filter({ hasText: /^Publish to Sidequest$/ })
    .click();
  await page
    .getByRole("textbox", { name: "Public caption", exact: true })
    .fill("The middle chapter, shared deliberately.");
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Edit caption or manage publication" })
    .click();
  const postUrl = page.url();
  await reviewPendingReel(page, "viewer");
  const postId = new URL(postUrl).pathname.split("/").at(-1);
  await expect(page.locator(".series-post-link")).toContainText(
    "A story in three experiments",
  );
  await expect(page.locator(".series-post-link")).toContainText(
    "Part 2 · The middle discovery",
  );
  const episodes = page.getByRole("navigation", {
    name: "Series episodes",
    exact: true,
  });
  await expect(
    episodes.getByRole("link", { name: /Previous part/ }),
  ).toHaveAttribute("href", `${seriesPath}#part-${sourcePartIds[0]}`);
  await expect(
    episodes.getByRole("link", { name: /Next part/ }),
  ).toHaveAttribute("href", `${seriesPath}#part-${sourcePartIds[2]}`);
  await verifyLayouts(page, testInfo, "series-episode");
  await episodes.getByRole("link", { name: /Next part/ }).click();
  await expect(page).toHaveURL(`${seriesUrl}#part-${sourcePartIds[2]}`);
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed.",
  );

  await selectDemoPersona(page, "creator");
  await page.goto(postUrl);
  await page.getByRole("link", { name: "Try this quest", exact: true }).click();
  expect(new URL(page.url()).searchParams.get("from")).toBe(postId);
  expect(new URL(page.url()).searchParams.get("seriesPart")).toBe(
    sourcePartIds[1],
  );
  await acceptTarget(page);
  const inspired = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0] as Run,
  );
  expect(inspired.id).not.toBe(completed.run.id);
  expect(inspired.inspiredByPostId).toBe(postId);
  expect(inspired.series?.partId).toBe(sourcePartIds[1]);
  expect(inspired.clips).toEqual([]);
  // The author's new attempt at Part 2 sits beside their earlier completion.
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveAttribute("href", `/runs/${inspired.id}`);
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "Part 2 of 3 · Completed",
  );
  await expect(
    page
      .locator(".series-part")
      .nth(1)
      .getByRole("link", { name: "Resume this part", exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed.",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1:viewer")!).me.wallet,
    ),
  ).toEqual(completed.wallet);
  expect(errors).toEqual([]);
});
