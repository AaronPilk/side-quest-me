import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { DEFAULT_PREFERENCES } from "../shared/domain";
const creator = "11111111-1111-4111-8111-111111111111";
const viewer = "22222222-2222-4222-8222-222222222222";
async function start(page: Page, route = "/profile") {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(route);
}
async function asViewer(page: Page) {
  await page.goto("/settings/demo-tools");
  await page
    .getByRole("combobox", { name: "Demo view" })
    .selectOption("viewer");
  await page.goto("/profile");
}
async function overflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("public identity and actual photo persist, removal saves immediately, and private tabs stay owner-only", async ({
  page,
}, testInfo) => {
  await start(page);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Public display name", exact: true })
    .fill("Avery Makes Stories");
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("Avery_Stories");
  await page
    .getByRole("textbox", { name: "Short public bio", exact: true })
    .fill("Small adventures, remembered well.");
  await page
    .getByRole("button", { name: "Save public profile", exact: true })
    .click();
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("@avery_stories", { exact: true })).toBeVisible();
  const photo = await sharp({
    create: { width: 512, height: 384, channels: 3, background: "#1d68ee" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "PRIVATE_META_TEST" } } })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({
    name: "photo.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await expect(
    page.getByText("Profile photo saved.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".social-profile-top img")).toBeVisible();
  expect(
    await page.locator(".social-profile-top img").evaluate((element) => {
      const image = element.getBoundingClientRect();
      const avatar = element.parentElement!.getBoundingClientRect();
      return image.width <= avatar.width && image.height <= avatar.height;
    }),
  ).toBe(true);
  await page.reload();
  await expect(page.getByText("@avery_stories", { exact: true })).toBeVisible();
  await expect(page.locator(".social-profile-top img")).toBeVisible();
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Your private space" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("social-own-private-mobile.png"),
    fullPage: true,
  });
  await overflow(page);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove profile photo", exact: true })
    .click();
  await expect(
    page.getByText("Profile photo removed.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".social-profile-top img")).toHaveCount(0);
  await asViewer(page);
  await page.goto(`/creators/${creator}?tab=private`);
  await expect(
    page.getByRole("heading", { name: "Avery Makes Stories", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Private", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Your private space" }),
  ).toHaveCount(0);
  await expect(page.getByText("@avery_stories", { exact: true })).toBeVisible();
  await overflow(page);
});

test("follow counts survive refresh, public thumbnail grid opens a focused reel, and blocking removes the relationship", async ({
  page,
}, testInfo) => {
  await start(page, `/creators/${viewer}`);
  await expect(
    page.getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".social-counts")).toContainText("1Followers");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  const tile = page.locator(".profile-video-tile");
  await expect(tile).toHaveCount(1);
  expect(
    await page
      .locator(".profile-video-grid")
      .evaluate(
        (element) =>
          getComputedStyle(element).gridTemplateColumns.split(" ").length,
      ),
  ).toBe(3);
  await expect
    .poll(() =>
      tile
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("social-public-video-grid.png"),
    fullPage: true,
  });
  await overflow(page);
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("social-public-desktop.png"),
    fullPage: true,
  });
  await overflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await tile.click();
  await expect(page.getByRole("region", { name: "Reel viewer" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Try this quest", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Close reel", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/creators/${viewer}$`));
  await page.getByRole("button", { name: "Following", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Follow", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".social-counts")).toContainText("0Followers");
  await page.getByRole("button", { name: "Follow", exact: true }).click();
  await tile.click();
  await page
    .locator("summary")
    .filter({ hasText: /^Report or block$/ })
    .click();
  await page
    .getByRole("button", { name: "Block this creator", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover$/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-social-demo-v1")!).follows,
    ),
  ).toHaveLength(0);
  await page.goto(`/creators/${viewer}`);
  await expect(page.getByRole("alert")).toContainText("unavailable");
});

test("signing out of a public owner profile clears private content before refetch and offers sign-in with a safe return", async ({
  page,
}) => {
  const profile = {
    id: creator,
    displayName: "Private owner",
    avatarKey: "mint",
    bio: "Public bio",
    openToBrands: false,
    publishedCount: 0,
    authoredCount: 0,
    version: 1,
  };
  let signedOut = false;
  let releaseRead = () => {};
  const blockedRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let privateReadsAfterSignOut = 0;
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO = false;
      let active = true;
      const listeners = new Set();
      const session = () => active ? {access_token:"test-owner-token",user:{id:"${creator}"}} : null;
      export const supabase = {auth:{
        getSession:async()=>({data:{session:session()}}),
        onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}},
        signInWithOtp:async()=>({error:null})
      }};
      export const accessToken = async()=>session()?.access_token;
      addEventListener("social-test-signout",()=>{active=false;for(const callback of listeners)callback("SIGNED_OUT",null)});`,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") {
      if (!route.request().headers().authorization)
        return route.fulfill({
          status: 401,
          json: { error: "Sign in to continue." },
        });
      return route.fulfill({
        json: {
          profile: {
            accountType: "personal",
            displayName: "Private owner",
            timezone: "UTC",
            locale: "en",
            summary: "",
            preferences: DEFAULT_PREFERENCES,
            onboardingCompleted: true,
          },
          wallet: { xp: 0, points: 0, version: 0 },
          roles: [],
        },
      });
    }
    if (path === "/api/community/me") {
      if (signedOut) privateReadsAfterSignOut += 1;
      return route.fulfill({
        json: {
          userId: creator,
          creator: profile,
          posts: [],
          drafts: [],
          offers: [],
          activity: [],
          roles: [],
        },
      });
    }
    if (path === `/api/community/creators/${creator}`)
      return route.fulfill({
        json: { creator: profile, posts: [], quests: [] },
      });
    if (path === `/api/social/profile/${creator}`) {
      if (signedOut) await blockedRead;
      return route.fulfill({
        json: {
          creatorId: creator,
          username: "private_owner",
          photoUrl: null,
          followersCount: 0,
          followingCount: 0,
          isFollowing: false,
          isOwn: !signedOut,
        },
      });
    }
    if (path === "/api/runs") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: "No fixture for this request." },
    });
  });
  await page.goto(`/creators/${creator}?tab=private`);
  await expect(
    page.getByRole("region", { name: "Your private space" }),
  ).toBeVisible();
  signedOut = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("social-test-signout")),
  );
  await expect(
    page.getByRole("region", { name: "Your private space" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Private", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in to follow", exact: true }),
  ).toBeVisible();
  expect(privateReadsAfterSignOut).toBe(0);
  releaseRead();
  await page
    .getByRole("link", { name: "Sign in to follow", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("sq-return-to")),
  ).toBe(`/creators/${creator}?tab=private`);
});

test("username collisions and unsupported photos show errors without false success", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("unique_handle");
  await page
    .getByRole("button", { name: "Save public profile", exact: true })
    .click();
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Profile photo", { exact: true }).setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(page.getByRole("alert")).toContainText("JPEG, PNG, or WebP");
  await expect(page.locator(".social-profile-top img")).toHaveCount(0);
  await asViewer(page);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("UNIQUE_HANDLE");
  await page
    .getByRole("button", { name: "Save public profile", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("already taken");
  await page.reload();
  await expect(page.getByText("@unique_handle", { exact: true })).toHaveCount(
    0,
  );
});
