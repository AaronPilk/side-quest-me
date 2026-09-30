import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

test("Following is earned through a follow, persists, searches public stories, and removes unfollowed creators", async ({
  page,
}) => {
  await page.goto("/discover?view=following");
  await expect(
    page.getByRole("heading", { name: "Your people, their adventures." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All quests", exact: true }).click();
  const card = page.locator(".public-post").first();
  await card.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Following", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "Discover feed" })
    .getByRole("button", { name: "Following", exact: true })
    .click();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page
    .getByRole("searchbox", { name: "Search public stories" })
    .fill("another demo creator");
  await page.getByRole("button", { name: "Search stories" }).click();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page.getByRole("searchbox").fill("no story could match this phrase");
  await page.getByRole("button", { name: "Search stories" }).click();
  await expect(
    page.getByRole("heading", { name: "No matching stories yet." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page
    .locator(".public-post")
    .getByRole("button", { name: "Following", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your people, their adventures." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".public-post")).toHaveCount(0);
});

test("reel sharing exposes a usable fallback and close returns to the same search and feed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Clipboard denied");
        },
      },
    });
  });
  await page.goto("/discover?view=brands&q=pit");
  await page.getByRole("button", { name: "Share reel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Public reel link" }),
  ).toHaveValue(/\/posts\/55555555/);
  await page.getByRole("link", { name: "Watch reel", exact: true }).click();
  await expect(page.getByRole("region", { name: "Reel viewer" })).toBeVisible();
  await page.getByRole("link", { name: "Close reel" }).click();
  await expect(page).toHaveURL(/\/discover\?view=brands&q=pit$/);
  await expect(page.getByRole("searchbox")).toHaveValue("pit");
  await page.getByRole("link", { name: "Explore series", exact: true }).click();
  await expect(page).toHaveURL(/\/series$/);
});

test("feed follow failures are recoverable without a false follow state", async ({
  page,
}) => {
  await page.route("**/src/lib/social-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nconst originalFollow=socialApi.follow;let failures=1;socialApi.follow=async(...args)=>{if(failures-->0)throw Error('offline');return originalFollow(...args)};`,
    });
  });
  await page.goto("/discover");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not update your follow",
  );
  await expect(
    page.getByRole("button", { name: "Follow", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    page
      .locator(".public-post")
      .getByRole("button", { name: "Following", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("community retries reuse uncertain keys but later intentional actions get new keys", async ({
  page,
}) => {
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nconst originalMutation=communityApi.mutate;const keys=[];communityApi.mutate=async(action,input,key)=>{if(action!=='report')return originalMutation(action,input,key);keys.push(key);document.documentElement.dataset.testKeys=JSON.stringify(keys);if(keys.length===1)throw Error('Temporary report failure');return {ok:true};};`,
    });
  });
  await page.goto("/posts/55555555-5555-4555-8555-555555555555");
  await page.getByText("Report or block", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Reason for reporting" })
    .fill("Browser regression fixture");
  await page.getByRole("button", { name: "Report post", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Temporary report failure",
  );
  await page.getByRole("button", { name: "Report post", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Report sent");
  await page.getByRole("button", { name: "Report post", exact: true }).click();
  const keys = JSON.parse(
    (await page.locator("html").getAttribute("data-test-keys")) || "[]",
  );
  expect(keys).toHaveLength(3);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
});

test("activity filters and mark shown as read persist after refresh", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page.locator(".public-post")).toHaveCount(1);
  // Demo reads deliberately never write the fixture store. Seed it through a
  // real mutation (a follow), then replace the activity list for this test.
  const card = page.locator(".public-post").first();
  await card.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Following", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    const key = "sidequest-community-demo-v1";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.activity = ["creator_followed", "offer_received"].map((kind, i) => ({
      id: crypto.randomUUID(),
      recipientId: "11111111-1111-4111-8111-111111111111",
      actorId: "22222222-2222-4222-8222-222222222222",
      kind,
      text: i ? "Test brand proposal" : "Test new connection",
      href: "/discover",
      createdAt: new Date().toISOString(),
      readAt: null,
    }));
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto("/activity");
  await expect(page.locator(".activity-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(page.locator(".activity-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Mark shown as read" }).click();
  await expect(page.getByText("1 unread", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(page.locator(".activity-item")).toHaveCount(1);
  await page.getByRole("button", { name: "Mark shown as read" }).click();
  await expect(
    page.getByRole("heading", { name: "No updates in this view." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("All caught up", { exact: true })).toBeVisible();
});

test("auth session and email transport errors recover while preserving the requested business destination", async ({
  page,
}) => {
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      // React StrictMode double-invokes the mount effect in development, so a
      // "fail once" counter would be consumed by the discarded first run.
      // Fail while the flag is set; the test clears it before Retry.
      body: `export const DEMO=false;export const accessToken=async()=>undefined;window.__sqAuthOffline=true;let sends=0;export const supabase={auth:{getSession:async()=>{if(window.__sqAuthOffline)throw Error('offline');return {data:{session:null}}},onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithOtp:async()=>{if(sends++===0)throw Error('offline');return {error:null}}}};`,
    }),
  );
  await page.goto("/business");
  await expect(page.getByRole("alert")).toContainText(
    "Could not check your sign-in",
  );
  await page.evaluate(() => {
    (window as unknown as { __sqAuthOffline: boolean }).__sqAuthOffline = false;
  });
  await page.getByRole("button", { name: "Retry sign-in check" }).click();
  await page
    .getByRole("textbox", { name: "Your email" })
    .fill("audit@example.test");
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not send your sign-in link",
  );
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  expect(
    await page.evaluate(() => sessionStorage.getItem("sq-return-to")),
  ).toBe("/business");
});
