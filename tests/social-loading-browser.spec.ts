import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

const creatorId = "11111111-1111-4111-8111-111111111111";
const loadError = "Profile details could not be loaded. Please try again.";
const saveError = "Your profile could not be saved. Please try again.";

async function fixture(
  page: Page,
  options: {
    pendingRead?: "failure" | "stale-success";
    failSave?: boolean;
  } = {},
) {
  let readFailed = !options.pendingRead;
  const failSave = Boolean(options.failSave);
  let releaseRead = () => {};
  const pendingRead = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  let readBlocked = Boolean(options.pendingRead);
  const pendingReplies: Promise<void>[] = [];
  let profile = {
    id: creatorId,
    displayName: "Creator",
    username: "creator_name",
    avatarKey: "violet",
    bio: "A public bio",
    openToBrands: false,
    publishedCount: 0,
    authoredCount: 0,
    version: 1,
  };
  const details = () => ({
    creatorId,
    username: profile.username,
    photoUrl: null,
    followersCount: 3,
    followingCount: 2,
    isFollowing: false,
    isOwn: true,
  });
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO=false;
      const session={access_token:"test-social-owner",user:{id:"${creatorId}"}};
      export const supabase={auth:{
        getSession:async()=>({data:{session}}),
        onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}
      }};
      export const accessToken=async()=>session.access_token;`,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          profile: {
            accountType: "personal",
            displayName: "Creator",
            summary: "",
            locale: "en",
            timezone: "UTC",
            preferences: DEFAULT_PREFERENCES,
            onboardingCompleted: true,
          },
          wallet: { xp: 0, points: 0, version: 0 },
          roles: [],
        },
      });
    if (path === "/api/community/me")
      return route.fulfill({
        json: {
          userId: creatorId,
          creator: profile,
          posts: [],
          drafts: [],
          offers: [],
          activity: [],
          roles: [],
        },
      });
    if (path === "/api/social/me") {
      if (readBlocked && options.pendingRead) {
        // React StrictMode may issue both an obsolete and a current read.
        // Hold every read until the save so this exercises the active request.
        const reply = (async () => {
          await pendingRead;
          if (options.pendingRead === "failure")
            await route.fulfill({ status: 503, json: { error: loadError } });
          else
            await route.fulfill({
              json: {
                ...details(),
                username: "outdated_name",
                followersCount: 0,
                followingCount: 0,
              },
            });
        })();
        pendingReplies.push(reply);
        return reply;
      }
      return readFailed
        ? route.fulfill({ status: 503, json: { error: loadError } })
        : route.fulfill({ json: details() });
    }
    if (path === "/api/social/profile") {
      if (failSave)
        return route.fulfill({ status: 503, json: { error: saveError } });
      const input = route.request().postDataJSON();
      profile = { ...profile, ...input, version: profile.version + 1 };
      readFailed = false;
      readBlocked = false;
      return route.fulfill({ json: details() });
    }
    if (path === "/api/runs") return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: "No fixture for this request." },
    });
  });
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Creator", exact: true }),
  ).toBeVisible();
  return {
    releaseRead: async () => {
      releaseRead();
      await Promise.all(pendingReplies);
    },
    recoverRead: () => {
      readFailed = false;
    },
  };
}

async function saveProfile(page: Page) {
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Public display name", exact: true })
    .fill("Updated creator");
  await page
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("updated_creator");
  await page
    .getByRole("button", { name: "Save public profile", exact: true })
    .click();
}

test("social loading errors stay distinct from saved account details and clear after a successful profile save", async ({
  page,
}) => {
  await fixture(page);
  await expect(page.getByRole("alert")).toHaveText(
    new RegExp(loadError.replaceAll(".", "\\.")),
  );
  await expect(
    page.getByRole("button", { name: "Retry profile details", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".social-counts")).toContainText("—Followers");
  await saveProfile(page);
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Updated creator", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("@updated_creator", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry profile details", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".social-counts")).toContainText("3Followers");
  await page.reload();
  await expect(
    page.getByText("@updated_creator", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".social-counts")).toContainText("3Followers");
});

test("a failed save does not pretend to resolve a social read failure, while retrying the read does", async ({
  page,
}) => {
  const control = await fixture(page, { failSave: true });
  await expect(page.getByRole("alert")).toContainText(loadError);
  await saveProfile(page);
  await expect(
    page.getByRole("alert").filter({ hasText: loadError }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: saveError }),
  ).toBeVisible();
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toHaveCount(0);
  control.recoverRead();
  await page
    .getByRole("button", { name: "Retry profile details", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".social-counts")).toContainText("3Followers");
  await expect(page.getByText("@creator_name", { exact: true })).toBeVisible();
});

for (const pendingRead of ["failure", "stale-success"] as const) {
  test(`a delayed ${pendingRead} read cannot overwrite fresh successful profile-save details`, async ({
    page,
  }) => {
    const control = await fixture(page, { pendingRead });
    await expect(page.locator(".social-counts")).toContainText("—Followers");
    await saveProfile(page);
    await expect(
      page.getByText("Public profile saved.", { exact: true }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (result) => new URL(result.url()).pathname === "/api/social/me",
    );
    await control.releaseRead();
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByText("@updated_creator", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".social-counts")).toContainText("3Followers");
    await expect(page.getByText("@outdated_name", { exact: true })).toHaveCount(
      0,
    );
  });
}
