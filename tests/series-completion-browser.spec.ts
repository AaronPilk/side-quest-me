import { expect, test, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import { reviewQuestPlans } from "./quest-wizard-helpers";
import { selectDemoPersona } from "./demo-persona-helper";
import type { Run } from "../src/lib/types";

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
  await page.goto("/series/new");
  await page
    .getByLabel("Series title", { exact: true })
    .fill("A story in three experiments");
  await page
    .getByLabel("Premise", { exact: true })
    .fill(
      "An independent middle chapter opens the way to the final experiment.",
    );
  const editParts = page.locator(".series-edit-part");
  for (const [index, title, template] of [
    [0, "The opening discovery", "day_tiny_discovery_chill_v1"],
    [1, "The middle menu draft", "date_menu_draft_chill_v1"],
    [2, "Build on the menu", "day_tiny_discovery_chill_v1"],
  ] as const) {
    if (index)
      await page.getByRole("button", { name: "Add part", exact: true }).click();
    const part = editParts.nth(index);
    await part.getByLabel("Part title", { exact: true }).fill(title);
    await part
      .getByLabel("Reviewed quest", { exact: true })
      .selectOption(template);
    await part
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
    .fill("Use the menu you created in the middle chapter.");
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A story in three experiments",
      exact: true,
    }),
  ).toBeVisible();
  const seriesUrl = page.url();
  const seriesPath = new URL(seriesUrl).pathname;
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
  await page
    .getByRole("button", { name: "Publish series", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("link", { name: "Edit caption or manage publication" })
    .click();
  const postUrl = page.url();
  const postId = new URL(postUrl).pathname.split("/").at(-1);
  await expect(page.locator(".series-post-link")).toContainText(
    "A story in three experiments",
  );
  await expect(page.locator(".series-post-link")).toContainText(
    "Part 2 · The middle menu draft",
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
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-part").nth(1)).not.toContainText(
    "Completed",
  );
  await expect(page.locator(".series-part").nth(2)).toContainText(
    "Complete the required earlier part",
  );
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
