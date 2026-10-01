import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { reviewQuestPlans } from "./quest-wizard-helpers";

export const DEMO_DATA_KEY = "sidequest-demo-v1";
export const GROWTH_TEMPLATE = "day_tiny_discovery_chill_v1";

/** Accept a quest with the default outing and land on its run page. */
export async function acceptQuest(
  page: Page,
  templateId = GROWTH_TEMPLATE,
  search = "",
): Promise<string> {
  await page.goto(`/create?template=${templateId}${search}`);
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await page.locator(".quest-card").click();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeVisible();
  // No story choice stands between a person and their quest.
  await expect(
    page.getByRole("group", { name: "Quest story format", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  return page.url().split("/runs/")[1];
}

/** Stand in for capture, rendering and completion: series-completion-browser
 * verifies the real media path separately. Marks the given run finalized with
 * a fixture reel so the journal, series progress and publication behave. */
export async function markRunFinalized(page: Page, runId: string) {
  await page.route("**/fixture/completed-quest.mp4", (route) =>
    route.fulfill({
      contentType: "video/mp4",
      body: readFileSync(
        path.resolve(".local/fixtures/landscape-with-audio.mp4"),
      ),
    }),
  );
  await page.evaluate(
    ({ key, runId }) => {
      const data = JSON.parse(localStorage.getItem(key)!);
      const run = data.runs.find((item: { id: string }) => item.id === runId);
      run.status = "finalized";
      run.completedAt = new Date().toISOString();
      run.clips = [
        {
          mode: "session",
          id: crypto.randomUUID(),
          generation: 1,
          slot: 0,
          duration: 21,
          start: 0,
          end: 21,
          mime: "video/mp4",
          previewUrl: "/fixture/completed-quest.mp4",
          fit: "fit",
          crop: 0.5,
          mute: false,
          caption: "Our saved adventure",
        },
      ];
      run.render = {
        id: crypto.randomUUID(),
        status: "ready",
        url: "/fixture/completed-quest.mp4",
      };
      run.rewardDecision = { xp: 40, points: 15, reason: "eligible" };
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: DEMO_DATA_KEY, runId },
  );
}

/** From a run page: the one-screen "Turn into a series" setup. Returns the
 * series URL. The title is prefilled from the quest unless one is given. */
export async function turnIntoSeries(page: Page, title?: string) {
  // Callers may already have opened the setup screen (from the journal, say);
  // clicking again mid-navigation would race the route change.
  if (!/\/series\/new\?run=/.test(page.url()))
    await page
      .getByRole("link", { name: "Turn into a series", exact: true })
      .click();
  await expect(page).toHaveURL(/\/series\/new\?run=/);
  await expect(
    page.getByRole("heading", {
      name: "Turn this quest into a series",
      exact: true,
    }),
  ).toBeVisible();
  const titleField = page.getByLabel("Series title", { exact: true });
  await expect(titleField).not.toHaveValue("");
  await expect(page.getByLabel("Premise", { exact: true })).not.toHaveValue("");
  // No multi-step setup and no quest picking: the quest supplies the story.
  await expect(
    page.getByRole("progressbar", { name: "Series setup progress" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toHaveCount(0);
  if (title) await titleField.fill(title);
  await page
    .getByRole("button", { name: "Turn into a series", exact: true })
    .click();
  await expect(page).toHaveURL(/\/series\/[a-f0-9-]+$/);
  return page.url();
}

/** Accept a finished series' next part from its detail page: Create Part N
 * adds the part and opens Create for the same quest; the wizard then accepts. */
export async function createNextPart(page: Page, position: number) {
  await page
    .getByRole("button", { name: `Create Part ${position}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/create\?template=.*seriesPart=/);
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  return page.url().split("/runs/")[1];
}

export async function savedRuns(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).runs,
    DEMO_DATA_KEY,
  );
}
