import { expect, test, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import type { SeriesDetail, SeriesPart, SeriesSummary } from "../shared/series";

const ownerId = "11111111-1111-4111-8111-111111111111";
const seriesId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const runId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const firstId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const draftId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const summary: SeriesSummary = {
  id: seriesId,
  authorId: ownerId,
  authorName: "Series creator",
  title: "A few neighborhood stories",
  premise: "A small adventure in every chapter.",
  cover: "forest",
  kind: "ongoing",
  state: "published",
  version: 1,
  partCount: 2,
  publishedPartCount: 2,
  following: false,
  followerCount: 0,
  createdAt: "2026-09-29T12:00:00.000Z",
};

function part(
  id: string,
  title: string,
  position: number,
  published = true,
): SeriesPart {
  return {
    id,
    title,
    position,
    published,
    templateId: catalog[0].id,
    templateVersion: 1,
    prerequisitePartId: null,
    prerequisiteReason: "",
    locked: false,
    quest: catalog[0],
    available: published,
    unavailableReason: published ? null : "This part is still a private draft.",
  };
}

const publicDetail: SeriesDetail = {
  ...summary,
  formatLocked: true,
  parts: [
    part(firstId, "The opening chapter", 1),
    part(secondId, "A second small adventure", 2),
  ],
  progress: null,
  isOwner: false,
};
const ownerDetail: SeriesDetail = {
  ...summary,
  formatLocked: true,
  partCount: 3,
  following: true,
  parts: [
    ...publicDetail.parts,
    part(draftId, "Owner-only unreleased chapter", 3, false),
  ],
  progress: {
    completedPartIds: [firstId],
    currentPartId: secondId,
    activeRunId: runId,
    complete: false,
    caughtUp: false,
  },
  isOwner: true,
};

async function seriesFixture(page: Page, signedIn = false) {
  let holdGuestDetail = false;
  let releaseGuestDetail = () => {};
  const guestDetailGate = new Promise<void>((resolve) => {
    releaseGuestDetail = resolve;
  });
  const requests: { path: string; actor: string | null }[] = [];
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO = false;
      let actor = ${signedIn ? JSON.stringify(ownerId) : "null"};
      const listeners = new Set();
      const session = () => actor ? {access_token:"test-"+actor,user:{id:actor}} : null;
      export const supabase = {auth:{
        getSession:async()=>({data:{session:session()}}),
        onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}},
        signInWithOtp:async()=>({error:null})
      }};
      export const accessToken = async()=>session()?.access_token;
      addEventListener("series-test-signout",()=>{actor=null;for(const callback of listeners)callback("SIGNED_OUT",null)});`,
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const actor =
      route.request().headers().authorization?.replace("Bearer test-", "") ||
      null;
    requests.push({ path, actor });
    if (path === "/api/community/me") {
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
          creator: null,
          posts: [],
          drafts: [],
          brand: null,
          offers: [],
          activity: [],
          blocks: [],
        },
      });
    }
    if (path === "/api/series") return route.fulfill({ json: [summary] });
    if (path === `/api/series/${seriesId}`) {
      if (!actor && holdGuestDetail) await guestDetailGate;
      return route.fulfill({
        json: actor === ownerId ? ownerDetail : publicDetail,
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "No fixture for this request." },
    });
  });
  return {
    requests,
    holdGuestDetail: () => {
      holdGuestDetail = true;
    },
    releaseGuestDetail,
  };
}

async function expectNoPrivateSeriesState(page: Page) {
  await expect(
    page.getByRole("link", { name: "Edit series", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Your series", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".series-progress")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Resume this part", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Try this part again", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Owner-only unreleased chapter", { exact: true }),
  ).toHaveCount(0);
}

test("anonymous visitors can browse the public Series library without owner tabs or private requests", async ({
  page,
}) => {
  const fixture = await seriesFixture(page);
  await page.goto("/series");
  await expect(
    page.getByRole("heading", { name: "Series", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-card")).toContainText(summary.title);
  await expectNoPrivateSeriesState(page);
  expect(
    fixture.requests.some(
      (request) => request.path === "/api/series" && !request.actor,
    ),
  ).toBe(true);
  expect(
    fixture.requests.some((request) =>
      ["/api/series/mine", "/api/community/me"].includes(request.path),
    ),
  ).toBe(false);
  // A series grows out of a quest, so the library offers no authoring entry
  // to anyone, signed in or not.
  await expect(
    page.getByRole("link", { name: /Create a series|Start a series/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Your series", exact: true }),
  ).toHaveCount(0);
});

test("anonymous public Series detail hides personal progress and preserves the sign-in follow destination", async ({
  page,
}) => {
  await seriesFixture(page);
  await page.goto(`/series/${seriesId}`);
  await expect(
    page.getByRole("heading", { name: summary.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Start series", exact: true }),
  ).toBeVisible();
  await expectNoPrivateSeriesState(page);
  await expect(
    page.getByRole("button", { name: /Follow series|Following/ }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Sign in to follow", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("sq-return-to")),
  ).toBe(`/series/${seriesId}`);
});

test("Series logout clears owner progress and unreleased parts immediately while the public detail read is held", async ({
  page,
}) => {
  const fixture = await seriesFixture(page, true);
  await page.goto(`/series/${seriesId}`);
  await expect(
    page.getByRole("link", { name: "Edit series", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed. Your progress is private.",
  );
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toHaveAttribute("href", `/runs/${runId}`);
  await expect(
    page.getByRole("heading", {
      name: "Owner-only unreleased chapter",
      exact: true,
    }),
  ).toBeVisible();
  fixture.holdGuestDetail();
  await page.evaluate(() =>
    window.dispatchEvent(new Event("series-test-signout")),
  );
  await expect
    .poll(() =>
      fixture.requests.some(
        (request) =>
          request.path === `/api/series/${seriesId}` && !request.actor,
      ),
    )
    .toBe(true);
  await expectNoPrivateSeriesState(page);
  await expect(page.locator(".series-detail")).toHaveCount(0);
  fixture.releaseGuestDetail();
  await expect(
    page.getByRole("heading", { name: summary.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to follow", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-part")).toHaveCount(2);
  await expectNoPrivateSeriesState(page);
});
