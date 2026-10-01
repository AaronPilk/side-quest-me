import { expect, test } from "@playwright/test";
import type { SeriesSummary } from "../shared/series";

const series: SeriesSummary = {
  id: "44444444-4444-4444-8444-444444444444",
  authorId: "22222222-2222-4222-8222-222222222222",
  authorName: "A creator with an adventurous story to share",
  title: "Three tiny detours around the city, each with a story worth keeping",
  premise:
    "Find an overlooked corner, make something from what you find, then return with a new perspective. Each chapter is a real quest you can try in your own way.",
  cover: "night",
  kind: "ongoing",
  state: "published",
  version: 1,
  partCount: 3,
  publishedPartCount: 1,
  following: false,
  followerCount: 0,
  createdAt: "2026-10-01T12:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

for (const width of [320, 390, 430]) {
  for (const enlarged of [false, true]) {
    test(`Series library actions and cards fit ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/src/lib/series-api.ts*", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          body: `${await response.text()}\nseriesApi.list=async(creatorId,mine=false)=>mine?[]:${JSON.stringify([series])};`,
        });
      });
      await page.goto("/series");
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      await expect(page.locator(".series-card")).toHaveCount(1);
      await expect(page.locator(".series-card")).toContainText(
        "1 part available",
      );
      await expect(page.locator(".series-card")).toContainText("Ongoing");
      await expect(page.locator(".series-card")).toHaveAttribute(
        "href",
        `/series/${series.id}`,
      );
      // No authoring entry: a series grows out of a quest from the journal.
      await expect(
        page.getByRole("link", { name: /Create a series|Start a series/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Series", exact: true }),
      ).toBeVisible();
      const sections = page.getByRole("navigation", {
        name: "Discover sections",
      });
      await expect(
        sections.getByRole("link", { name: "Series", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page
          .getByRole("navigation", { name: "Primary" })
          .getByRole("link", { name: "Discover", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("series-library-card.png"),
        fullPage: true,
      });

      const collection = page.getByRole("group", { name: "Series collection" });
      await collection
        .getByRole("button", { name: "Your series", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your next story starts with a quest.",
          exact: true,
        }),
      ).toBeVisible();
      for (const name of ["Find a quest", "Open your journal"]) {
        const link = page.getByRole("link", { name, exact: true });
        await expect(link).toBeVisible();
        expect(
          await link.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= innerWidth &&
              bounds.height >= 44
            );
          }),
        ).toBe(true);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("series-library-empty.png"),
        fullPage: true,
      });
      await sections.getByRole("link", { name: "Quests", exact: true }).click();
      await expect(page).toHaveURL(/\/discover$/);
    });
  }
}

test("Profile provides a second route to the Series library and the dead authoring route points back to quests", async ({
  page,
}) => {
  await page.goto("/profile?tab=series");
  const browse = page.getByRole("link", {
    name: "Browse all series",
    exact: true,
  });
  await expect(browse).toBeVisible();
  await browse.click();
  await expect(page).toHaveURL(/\/series$/);
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Discover", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("link", { name: "Create a series", exact: true }),
  ).toHaveCount(0);
  await page.goto("/series/new");
  await expect(
    page.getByRole("heading", {
      name: "A series starts with a quest you did.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Find a quest", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(
    page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Create", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
