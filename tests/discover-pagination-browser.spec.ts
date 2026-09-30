import { test, expect, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import type { CommunityPost } from "../shared/community";

function post(index: number, quest = catalog[0]): CommunityPost {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    creator: {
      id: "22222222-2222-4222-8222-222222222222",
      displayName: "Pagination fixture creator",
      avatarKey: "mint",
      bio: "Browser verification fixture",
      openToBrands: true,
      version: 1,
      publishedCount: 65,
      attemptCount: 0,
      authoredCount: 0,
    },
    quest,
    questAuthor: null,
    caption: `Pagination fixture ${index}`,
    brandOptIn: true,
    state: "published",
    version: 1,
    createdAt: "2026-09-29T12:00:00.123456+00:00",
    attemptCount: 65,
    mediaUrl: "",
    thumbnailUrl: "",
    sponsorDisclosure: null,
    inspiredByPostId: null,
  };
}
const cursor = (item: CommunityPost) => `${item.createdAt}|${item.id}`;

async function mockFeedTransport(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  // Replace only feed transport; the real component, routing, filters, loading,
  // and cursor handling still run in the app. Other community reads stay local.
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: `${body}\n
      const originalRead = communityApi.read;
      communityApi.read = async (view, input = {}) => {
        if (view !== 'feed') return originalRead(view, input);
        const response = await fetch('/__pagination-feed?' + new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
      };`,
    });
  });
}

// Retain the deferred request so the test chooses when a response arrives.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Discover loads every page, retries without losing videos, deduplicates overlaps, and shows the end", async ({
  page,
}) => {
  await mockFeedTransport(page);
  const posts = Array.from({ length: 65 }, (_, index) => post(index + 1));
  const nextPage = deferred();
  let initialFailure = true;
  let retry = false;
  const seen: URLSearchParams[] = [];
  await page.route("**/__pagination-feed?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    seen.push(params);
    if (initialFailure) {
      return route.fulfill({
        status: 503,
        json: { error: "Feed unavailable for this test." },
      });
    }
    const before = params.get("before");
    if (!before)
      return route.fulfill({
        json: { posts: posts.slice(0, 30), nextCursor: cursor(posts[29]) },
      });
    if (before === cursor(posts[29])) {
      if (!retry) {
        retry = true;
        await nextPage.promise;
        return route.fulfill({
          status: 503,
          json: { error: "Next page unavailable for this test." },
        });
      }
      return route.fulfill({
        json: { posts: posts.slice(29, 60), nextCursor: cursor(posts[59]) },
      });
    }
    return route.fulfill({
      json: { posts: posts.slice(60), nextCursor: null },
    });
  });
  await page.goto("/discover");
  await expect(page.getByText("Feed unavailable for this test.")).toBeVisible();
  initialFailure = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".public-post")).toHaveCount(30);
  await page.getByRole("button", { name: "Load more videos" }).click();
  await expect(
    page.getByRole("button", { name: "Loading more…" }),
  ).toBeDisabled();
  await expect(page.locator(".public-post")).toHaveCount(30);
  nextPage.resolve();
  await expect(
    page.getByText("Next page unavailable for this test."),
  ).toBeVisible();
  await expect(page.locator(".public-post")).toHaveCount(30);
  await page.getByRole("button", { name: "Try loading more again" }).click();
  await expect(page.locator(".public-post")).toHaveCount(60);
  await expect(
    page.getByText("Pagination fixture 30", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Load more videos" }).click();
  await expect(page.locator(".public-post")).toHaveCount(65);
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more videos" }),
  ).toHaveCount(0);
  expect(seen.map((params) => params.get("before")).filter(Boolean)).toEqual([
    cursor(posts[29]),
    cursor(posts[29]),
    cursor(posts[59]),
  ]);
  expect(seen.every((params) => params.get("limit") === "30")).toBe(true);
});

test("changing feed filters rejects stale pages and paginates only the selected quest’s attempts", async ({
  page,
}) => {
  await mockFeedTransport(page);
  const oldNext = deferred();
  const start = post(1);
  const stale = post(2);
  const branded = post(3, catalog[3]);
  const attempts = [
    post(4, catalog[3]),
    post(5, catalog[3]),
    post(6, catalog[3]),
  ];
  const seen: URLSearchParams[] = [];
  await page.route("**/__pagination-feed?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    seen.push(params);
    if (params.get("templateId")) {
      expect(params.get("templateId")).toBe(branded.quest.id);
      const shown = params.get("brandOnly")
        ? [attempts[2]]
        : params.get("before")
          ? [attempts[1], attempts[2]]
          : [attempts[0]];
      return route.fulfill({
        json: {
          posts: shown,
          nextCursor:
            shown.length === 1 && !params.get("brandOnly")
              ? cursor(attempts[0])
              : null,
        },
      });
    }
    if (params.get("brandOnly"))
      return route.fulfill({ json: { posts: [branded], nextCursor: null } });
    if (params.get("before")) {
      await oldNext.promise;
      return route.fulfill({ json: { posts: [stale], nextCursor: null } });
    }
    return route.fulfill({
      json: { posts: [start], nextCursor: cursor(start) },
    });
  });
  await page.goto("/discover");
  await expect(
    page.getByText("Pagination fixture 1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more videos" }).click();
  await expect(
    page.getByRole("button", { name: "Loading more…" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Open to brands", exact: true })
    .click();
  await expect(
    page.getByText("Pagination fixture 3", { exact: true }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/__pagination-feed" &&
      url.searchParams.get("before") === cursor(start)
    );
  });
  oldNext.resolve();
  await staleResponse;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  await expect(page.locator(".public-post")).toHaveCount(1);
  await expect(
    page.getByText("Pagination fixture 2", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Other attempts · 65" }).click();
  await expect(page).toHaveURL(new RegExp(`template=${branded.quest.id}`));
  await expect(
    page.getByText("Pagination fixture 4", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more videos" }).click();
  await expect(page.locator(".public-post")).toHaveCount(3);
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
  await page
    .getByRole("button", { name: "Open to brands", exact: true })
    .click();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await expect(
    page.getByText("Pagination fixture 6", { exact: true }),
  ).toBeVisible();
  expect(
    seen
      .filter((params) => params.get("brandOnly"))
      .every((params) => !params.has("before")),
  ).toBe(true);
  expect(
    seen.some(
      (params) =>
        params.get("templateId") === branded.quest.id &&
        params.get("before") === cursor(attempts[0]),
    ),
  ).toBe(true);
});

test("a late error from the previous filter does not replace the current feed", async ({
  page,
}) => {
  await mockFeedTransport(page);
  const oldPage = deferred();
  await page.route("**/__pagination-feed?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("brandOnly"))
      return route.fulfill({ json: { posts: [post(7)], nextCursor: null } });
    await oldPage.promise;
    return route.fulfill({
      status: 503,
      json: { error: "Stale filter failure" },
    });
  });
  await page.goto("/discover");
  await page
    .getByRole("button", { name: "Open to brands", exact: true })
    .click();
  await expect(
    page.getByText("Pagination fixture 7", { exact: true }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/__pagination-feed?") &&
      response.status() === 503,
  );
  oldPage.resolve();
  await staleResponse;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  await expect(page.getByText("Stale filter failure")).toHaveCount(0);
  await expect(page.locator(".public-post")).toHaveCount(1);
  await expect(page.getByText("You’re all caught up.")).toBeVisible();
});
