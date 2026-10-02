import { expect, test, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import type { CommunityPost, CreatorProfile } from "../shared/community";

const ownerId = "11111111-1111-4111-8111-111111111111";
const viewerId = "22222222-2222-4222-8222-222222222222";
const postId = "55555555-5555-4555-8555-555555555555";
const owner: CreatorProfile = {
  id: ownerId,
  displayName: "Reel owner",
  avatarKey: "mint",
  bio: "Public profile",
  openToBrands: false,
  version: 1,
  publishedCount: 1,
  authoredCount: 0,
  attemptCount: 1,
};

function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function reelFixture(page: Page, state: CommunityPost["state"]) {
  const meGate = deferred();
  const postGate = deferred();
  const otherMeRequests: (string | null)[] = [];
  const setupReads: (string | null)[] = [];
  const post: CommunityPost = {
    id: postId,
    creator: owner,
    quest: catalog[0],
    questAuthor: null,
    caption:
      state === "published"
        ? "Public reel caption"
        : "Owner-only unpublished caption",
    brandOptIn: false,
    state,
    version: 1,
    createdAt: "2026-09-29T12:00:00.000Z",
    attemptCount: 1,
    mediaUrl: "/api/local-media/demo-reel",
    thumbnailUrl: "/api/local-media/demo-reel?thumbnail=1",
    sponsorDisclosure: null,
    inspiredByPostId: null,
  };
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO = false;
      let actor = "${ownerId}";
      const listeners = new Set();
      const session = () => actor ? {access_token:"test-"+actor,user:{id:actor}} : null;
      export const supabase = {auth:{
        getSession:async()=>({data:{session:session()}}),
        onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}}
      }};
      export const accessToken = async()=>session()?.access_token;
      addEventListener("reel-test-account",event=>{actor=event.detail;for(const callback of listeners)callback(actor?"SIGNED_IN":"SIGNED_OUT",session())});`,
    }),
  );
  await page.route("**/api/me", (route) => {
    const actor =
      route.request().headers().authorization?.replace("Bearer test-", "") ||
      null;
    setupReads.push(actor);
    if (!actor)
      return route.fulfill({
        status: 401,
        json: { error: "Sign in to continue." },
      });
    return route.fulfill({
      json: {
        profile: {
          accountType: "personal",
          displayName: actor === ownerId ? "Reel owner" : "Reel viewer",
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
  });
  await page.route("**/api/community/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const actor =
      route.request().headers().authorization?.replace("Bearer test-", "") ||
      null;
    if (path === "/api/community/me") {
      if (actor !== ownerId) {
        otherMeRequests.push(actor);
        await meGate.promise;
      }
      if (!actor)
        return route.fulfill({
          status: 401,
          json: { error: "Sign in to continue." },
        });
      return route.fulfill({
        json: {
          userId: actor,
          roles: [],
          publications: [],
          creator: actor === ownerId ? owner : null,
          posts: actor === ownerId ? [post] : [],
          drafts: [],
          brand: null,
          offers: [],
          activity: [],
          blocks: [],
        },
      });
    }
    if (path === `/api/community/posts/${postId}`) {
      if (state !== "published" && actor !== ownerId) {
        await postGate.promise;
        return route.fulfill({
          status: 404,
          json: { error: "This post is unavailable." },
        });
      }
      return route.fulfill({ json: post });
    }
    return route.fulfill({
      status: 404,
      json: { error: "No fixture for this request." },
    });
  });
  await page.goto(`/posts/${postId}`);
  const edit = page
    .locator("summary")
    .filter({ hasText: /^Manage publication$/ });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(
    page.getByRole("button", { name: "Unpublish post", exact: true }),
  ).toBeVisible();
  return { meGate, postGate, otherMeRequests, setupReads, post };
}

async function changeAccount(page: Page, id: string | null) {
  await page.evaluate(
    (actor) =>
      window.dispatchEvent(
        new CustomEvent("reel-test-account", { detail: actor }),
      ),
    id,
  );
}

async function expectNoOwnerControls(page: Page) {
  await expect(
    page.locator("summary").filter({ hasText: /^Manage publication$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Unpublish post", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Public caption", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save post changes", exact: true }),
  ).toHaveCount(0);
}

test("public reel sign-out clears owner controls immediately and never issues an anonymous account read", async ({
  page,
}) => {
  const fixture = await reelFixture(page, "published");
  await changeAccount(page, null);
  await expect(page.getByRole("region", { name: "Reel viewer" })).toBeVisible();
  await expectNoOwnerControls(page);
  // Anonymous viewers must not call the private account endpoint at all; the
  // reel's account read is gated on a signed-in session.
  expect(fixture.otherMeRequests).not.toContain(null);
  expect(fixture.setupReads).not.toContain(null);
  await expect(
    page.getByText("Public reel caption", { exact: true }),
  ).toBeVisible();
  await expectNoOwnerControls(page);
  await expect(
    page.locator("summary").filter({ hasText: /^Report or block$/ }),
  ).toHaveCount(0);
  fixture.meGate.release();
  await expectNoOwnerControls(page);
});

test("swapping signed-in accounts clears an unpublished reel before new private reads resolve", async ({
  page,
}) => {
  const fixture = await reelFixture(page, "unpublished");
  await expect(page.locator(".post-caption")).toHaveText(
    "Owner-only unpublished caption",
  );
  await expect(
    page.getByRole("link", {
      name: "Watch your private original in the journal",
      exact: true,
    }),
  ).toBeVisible();
  await changeAccount(page, viewerId);
  await expect
    .poll(() => fixture.otherMeRequests.includes(viewerId))
    .toBe(true);
  await expectNoOwnerControls(page);
  await expect(
    page.getByText("Owner-only unpublished caption", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "Watch your private original in the journal",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Reel viewer" })).toHaveCount(
    0,
  );
  fixture.meGate.release();
  fixture.postGate.release();
  await expect(page.getByRole("alert")).toHaveText("This post is unavailable.");
  await expectNoOwnerControls(page);
  await expect(
    page.getByText("Owner-only unpublished caption", { exact: true }),
  ).toHaveCount(0);
});
