import { reviewPendingReel } from "./reel-publication-helper";
import { expect, test, type Page } from "@playwright/test";
import type { Run } from "../src/lib/types";
import { selectDemoPersona } from "./demo-persona-helper";
import {
  acceptQuest,
  DEMO_DATA_KEY,
  markRunFinalized,
  turnIntoSeries,
} from "./series-growth-helpers";

async function savedState(page: Page) {
  return page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    const community = JSON.parse(
      localStorage.getItem("sidequest-community-demo-v1")!,
    );
    return {
      run: data.runs[0] as Run,
      count: data.runs.length,
      wallet: data.me.wallet,
      posts: community?.posts ?? [],
    };
  }, DEMO_DATA_KEY);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

test("accepting a quest never asks about a series; the quest can become one later and canceling setup keeps the same attempt", async ({
  page,
}) => {
  await acceptQuest(page);
  const before = await savedState(page);
  expect(before.count).toBe(1);
  expect(before.run.status).toBe("accepted");
  expect(before.run.series).toBeUndefined();
  await page
    .getByRole("link", { name: "Turn into a series", exact: true })
    .click();
  await expect(page).toHaveURL(/\/series\/new\?run=/);
  expect(new URL(page.url()).searchParams.get("run")).toBe(before.run.id);
  await page
    .getByLabel("Series title", { exact: true })
    .fill("A thought I haven’t committed to");
  await page.getByRole("link", { name: "Your quest", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/runs/${before.run.id}$`));
  expect(await savedState(page)).toEqual(before);
  await page.goto("/journal");
  await page
    .locator(".journal-card")
    .getByRole("link", { name: "Turn into a series", exact: true })
    .click();
  await expect(page).toHaveURL(/\/series\/new\?run=/);
  const seriesUrl = await turnIntoSeries(page, "The story grew later");
  const after = await savedState(page);
  expect(after.run.series).toMatchObject({
    title: "The story grew later",
    position: 1,
  });
  expect({ ...after.run, series: undefined }).toEqual(before.run);
  expect(after.count).toBe(1);
  expect(after.wallet).toEqual(before.wallet);
  expect(after.posts).toEqual(before.posts);
  // The series lands privately with the unfinished attempt as Part 1.
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  await expect(page.locator(".notice")).toContainText(
    "Series saved privately.",
  );
  await expect(page.locator(".series-part")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveAttribute("href", `/runs/${before.run.id}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "The story grew later", exact: true }),
  ).toBeVisible();
  await page.goto("/journal");
  await expect(
    page
      .locator(".journal-card")
      .getByRole("link", { name: "Turn into a series", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".journal-card")
    .getByRole("link", { name: "View series", exact: true })
    .click();
  await expect(page).toHaveURL(seriesUrl);
  // The one-time "saved" notice belongs to the save, not to the series page.
  await expect(page.locator(".notice")).toHaveCount(0);
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.getByRole("alert")).toContainText(
    "This series is not available.",
  );
});

for (const published of [false, true]) {
  test(`a saved completed ${published ? "published" : "private"} quest becomes a series without changing footage, rewards, or publication`, async ({
    page,
  }) => {
    const runId = await acceptQuest(page);
    // This saved-run fixture covers conversion of existing completed accounts;
    // series-completion-browser separately verifies capture, real rendering and completion.
    await markRunFinalized(page, runId);
    await page.evaluate((key) => {
      const data = JSON.parse(localStorage.getItem(key)!);
      data.me.wallet = { xp: 40, points: 15, version: 1 };
      localStorage.setItem(key, JSON.stringify(data));
    }, DEMO_DATA_KEY);
    await page.reload();
    await expect(
      page.getByLabel("Your finished Sidequest reel", { exact: true }),
    ).toBeVisible();
    if (published) {
      await page
        .locator("summary")
        .filter({ hasText: /^Publish to Sidequest$/ })
        .click();
      await page
        .getByRole("textbox", { name: "Public caption", exact: true })
        .fill("Shared before this became a series.");
      await page
        .getByRole("button", { name: "Submit for review", exact: true })
        .click();
      await expect(
        page.getByRole("link", { name: "Edit caption or manage publication" }),
      ).toBeVisible();
      await reviewPendingReel(page, "creator");
    }
    const before = await savedState(page);
    await page.goto("/journal");
    await page
      .locator(".journal-card")
      .getByRole("link", { name: "Turn into a series", exact: true })
      .click();
    await expect(page).toHaveURL(/\/series\/new\?run=/);
    const seriesUrl = await turnIntoSeries(
      page,
      "A later chapter worth keeping",
    );
    const after = await savedState(page);
    expect({ ...after.run, series: undefined }).toEqual(before.run);
    expect(after.count).toBe(before.count);
    expect(after.wallet).toEqual(before.wallet);
    expect(after.posts).toEqual(before.posts);
    await expect(
      page.getByText("PRIVATE DRAFT", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".series-progress")).toContainText(
      "1 part completed.",
    );
    await expect(
      page.getByRole("button", { name: "Create Part 2", exact: true }),
    ).toBeEnabled();
    // The finished quest itself is untouched: no re-completion, same reel.
    await page.goto(`/runs/${runId}`);
    await expect(
      page.getByRole("button", { name: "Complete quest", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Your finished Sidequest reel", { exact: true }),
    ).toBeVisible();
    expect((await savedState(page)).wallet).toEqual(before.wallet);
    await page
      .getByRole("link", { name: "Open series · Create Part 2", exact: true })
      .click();
    await expect(page).toHaveURL(seriesUrl);
    await page.goto("/profile?tab=series");
    await page
      .locator(".series-card")
      .filter({ hasText: "A later chapter worth keeping" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "A later chapter worth keeping",
        exact: true,
      }),
    ).toBeVisible();
    if (published) {
      const publicPost = before.posts.find(
        (post: { runId: string; id: string }) => post.runId === before.run.id,
      );
      expect(publicPost).toBeTruthy();
      await selectDemoPersona(page, "viewer");
      await page.goto(`/posts/${publicPost.id}`);
      await expect(page.locator(".reel-viewer")).toBeVisible();
      await expect(page.locator(".series-post-link")).toHaveCount(0);
      await expect(
        page.getByText("A later chapter worth keeping", { exact: true }),
      ).toHaveCount(0);
    }
  });
}
