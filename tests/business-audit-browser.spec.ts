import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import type { Redemption } from "../src/lib/types";
import { selectDemoPersona } from "./demo-persona-helper";
import {
  openPartOptions,
  reachSeriesParts,
  reviewSeries,
} from "./series-authoring-helpers";
import {
  acceptQuest,
  createNextPart,
  DEMO_DATA_KEY,
  markRunFinalized,
  turnIntoSeries,
} from "./series-growth-helpers";

test.use({ actionTimeout: 15_000 });

async function openDemo(page: Page, route: string) {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(route);
}

async function rewardFixture(page: Page) {
  await page.route("**/src/lib/auth.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const DEMO = false; export const accessToken = async () => 'fixture';
      export const supabase = { auth: {
        getSession: async () => ({ data: { session: { access_token: 'fixture', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      } };`,
    }),
  );
  const state = { points: 300, reservations: [] as Redemption[] };
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: {
          displayName: "Rewards fixture",
          timezone: "UTC",
          locale: "en",
          summary: "",
          preferences: DEFAULT_PREFERENCES,
          onboardingCompleted: true,
        },
        wallet: { xp: 700, points: state.points, version: 1 },
        roles: [],
      },
    }),
  );
  await page.route("**/api/community/**", (route) =>
    route.fulfill({
      json: {
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        roles: [],
        publications: [],
        creator: null,
        posts: [],
        drafts: [],
        brand: null,
        offers: [],
        activity: [],
        blocks: [],
        items: [],
        unreadCount: 0,
      },
    }),
  );
  await page.route("**/api/rewards", (route) =>
    route.fulfill({
      json: [
        {
          id: "first",
          title: "First funded reward",
          merchant: "Fixture merchant",
          points: 40,
          terms: "Fixture terms",
          version: 1,
        },
        {
          id: "second",
          title: "Second funded reward",
          merchant: "Fixture merchant",
          points: 60,
          terms: "Fixture terms",
          version: 1,
        },
      ],
    }),
  );
  return state;
}

test("reward retries preserve reservation identity, new rewards use new keys, and canceled private codes disappear", async ({
  page,
}) => {
  const state = await rewardFixture(page);
  const keys: string[] = [];
  let failFirstRequest = true;
  let failFirstCode = true;
  await page.route("**/api/redemptions", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: state.reservations });
    keys.push(route.request().headers()["idempotency-key"]);
    if (failFirstRequest) {
      failFirstRequest = false;
      return route.fulfill({
        status: 503,
        json: { error: "Reservation service temporarily unavailable" },
      });
    }
    const { offerId } = route.request().postDataJSON();
    const points = offerId === "first" ? 40 : 60;
    const reservation: Redemption = {
      id: `reservation-${offerId}`,
      title: `${offerId === "first" ? "First" : "Second"} funded reward`,
      points,
      state: "reserved",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    state.points -= points;
    state.reservations.push(reservation);
    return route.fulfill({ json: reservation });
  });
  await page.route("**/api/redemptions/*/token", (route) => {
    if (failFirstCode) {
      failFirstCode = false;
      return route.fulfill({
        status: 503,
        json: { error: "Code service unavailable" },
      });
    }
    return route.fulfill({
      json: { token: `private-${route.request().url().split("/").at(-2)}` },
    });
  });
  await page.route("**/api/redemptions/*/cancel", (route) => {
    const id = route.request().url().split("/").at(-2);
    const reserved = state.reservations.find(
      (reservation) => reservation.id === id,
    )!;
    reserved.state = "canceled";
    state.points += reserved.points;
    return route.fulfill({ json: { id } });
  });
  await page.goto("/rewards?tab=perks");
  await page.getByRole("button", { name: /First funded reward/ }).click();
  await page
    .getByRole("button", { name: "Redeem 40 points", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm · Redeem 40 points", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Reservation service temporarily unavailable",
  );
  await page
    .getByRole("button", { name: "Confirm · Redeem 40 points", exact: true })
    .click();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await expect(
    page.getByText("Reward reserved. Your points balance has been updated."),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Your reward is reserved, but its private code could not load",
  );
  await page
    .getByRole("button", { name: "Show private code", exact: true })
    .click();
  await expect(page.getByLabel("Private redemption token")).toHaveValue(
    "private-reservation-first",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Cancel & refund", exact: true })
    .click();
  await expect(page.getByLabel("Private redemption token")).toHaveCount(0);
  await expect(
    page.getByText("Reservation canceled. Its points have been returned."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Second funded reward/ }).click();
  await page
    .getByRole("button", { name: "Redeem 60 points", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm · Redeem 60 points", exact: true })
    .click();
  await expect(page.getByLabel("Private redemption token")).toHaveValue(
    "private-reservation-second",
  );
  expect(keys).toHaveLength(3);
  expect(keys[2]).not.toBe(keys[1]);
  await page.getByRole("button", { name: "Hide code", exact: true }).click();
  await expect(page.getByLabel("Private redemption token")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".wallet-card strong")).toHaveText("240points");
  await expect(page.locator(".redemption")).toHaveCount(2);
});

test("Series editing keeps the source quest first and preserves accepted part history after cancellation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  const first = await acceptQuest(page);
  await markRunFinalized(page, first);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page, "A linked story");
  const second = await createNextPart(page, 2);
  await page.goto(seriesUrl);
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await page
    .getByLabel("Premise", { exact: true })
    .fill("Two discoveries linked by the first result.");
  await reachSeriesParts(page);
  const parts = page.locator(".series-edit-part");
  await expect(parts).toHaveCount(2);
  await expect(
    parts.nth(0).getByLabel("Part title", { exact: true }),
  ).toBeDisabled();
  await expect(parts.nth(0)).toContainText("Three Things You Never Noticed");
  await expect(
    page.getByRole("button", { name: /Choose a quest|Change quest|Add part/ }),
  ).toHaveCount(0);
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("Build on it");
  await openPartOptions(parts.nth(1));
  await parts
    .nth(1)
    .getByLabel("Prerequisite", { exact: true })
    .selectOption({ index: 1 });
  await parts
    .nth(1)
    .getByLabel("Why is that part required?", { exact: true })
    .fill("Use the discovery from the first part.");
  await openPartOptions(parts.nth(0));
  await expect(
    page.getByRole("button", { name: "Remove part 1", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move part 1 down", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move part 2 up", exact: true }),
  ).toBeDisabled();
  // Part 2 is being filmed, so it cannot be dropped either.
  await expect(
    page.getByRole("button", { name: "Remove part 2", exact: true }),
  ).toBeDisabled();
  await reviewSeries(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(
    page.getByRole("heading", { name: "A linked story", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "Requires an earlier part: Use the discovery from the first part.",
  );
  await page.reload();
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await reachSeriesParts(page);
  await openPartOptions(parts.nth(1));
  await expect(
    parts.nth(1).getByLabel("Why is that part required?", { exact: true }),
  ).toHaveValue("Use the discovery from the first part.");
  await parts
    .nth(1)
    .getByLabel("Prerequisite", { exact: true })
    .selectOption("");
  // The source quest stays Part 1 whatever happens to later parts.
  await expect(
    page.getByRole("button", { name: "Move part 2 up", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remove part 2", exact: true }),
  ).toBeDisabled();
  // Canceling an attempt retains its attribution and part identity.
  await page.evaluate(
    ({ key, runId }) => {
      const data = JSON.parse(localStorage.getItem(key)!);
      const run = data.runs.find((item: { id: string }) => item.id === runId);
      run.status = "abandoned";
      localStorage.setItem(key, JSON.stringify(data));
    },
    { key: DEMO_DATA_KEY, runId: second },
  );
  await page.goto(`${seriesUrl}/edit`);
  // The unsaved edit resumes where it left off: on the parts step.
  await expect(page.locator(".series-editor-footnote")).toContainText(
    "Your draft was restored.",
  );
  await expect(parts).toHaveCount(2);
  await openPartOptions(parts.nth(1));
  await expect(
    parts.nth(1).getByLabel("Prerequisite", { exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Remove part 2", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Move part 2 up", exact: true }),
  ).toBeDisabled();
  await expect(parts.nth(1)).toContainText("This part has a saved attempt");
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("Try again later");
  await reviewSeries(page);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A linked story", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".series-part")).toHaveCount(2);
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "Try again later",
  );
  const canceled = await page.evaluate(
    ({ key, runId }) =>
      JSON.parse(localStorage.getItem(key)!).runs.find(
        (run: { id: string }) => run.id === runId,
      ),
    { key: DEMO_DATA_KEY, runId: second },
  );
  expect(canceled.series.partTitle).toBe("Part 2");
  expect(canceled.series.position).toBe(2);
});

test("business registration is reviewed before available videos and requests are enabled", async ({
  page,
}) => {
  await openDemo(page, "/onboarding");
  await page.getByRole("radio", { name: /Brand account/ }).check();
  await page
    .getByRole("button", { name: "Continue to brand setup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Start with your business profile",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Set up business profile", exact: true })
    .click();
  await expect(page.getByLabel("Business name", { exact: true })).toBeFocused();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Sidequest audit business");
  await page
    .getByLabel("Business website", { exact: true })
    .fill("https://example.com");
  await page
    .getByLabel("Business contact email", { exact: true })
    .fill("business@example.com");
  await page
    .getByRole("button", { name: "Submit business for review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your business is in review",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore available videos", exact: true }),
  ).toHaveCount(0);
  await selectDemoPersona(page, "operator");
  await page.goto("/admin");
  const review = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: /^Sidequest audit business$/ }),
  });
  await review.locator("summary").click();
  await review
    .getByRole("combobox", { name: "Review decision", exact: true })
    .selectOption("reject");
  await review
    .getByLabel("Verification notes", { exact: true })
    .fill("Please confirm the business website.");
  await review
    .getByRole("button", { name: "Record business review", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await selectDemoPersona(page, "creator");
  await page.goto("/business");
  await expect(
    page.getByText("Please confirm the business website."),
  ).toBeVisible();
  await page
    .getByLabel("Business website", { exact: true })
    .fill("https://example.com/verified");
  await page
    .getByRole("button", { name: "Submit business for review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your business is in review",
      exact: true,
    }),
  ).toBeVisible();
  await selectDemoPersona(page, "operator");
  await page.goto("/admin");
  await review.locator("summary").click();
  await review
    .getByRole("combobox", { name: "Review decision", exact: true })
    .selectOption("approve");
  await review
    .getByLabel("Verification notes", { exact: true })
    .fill("Fixture business identity verified.");
  await review
    .getByRole("button", { name: "Record business review", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await selectDemoPersona(page, "creator");
  await page.goto("/business");
  await page
    .getByRole("link", { name: "Explore available videos", exact: true })
    .click();
  await expect(page).toHaveURL(/#brand-videos$/);
  await expect(
    page.getByRole("heading", {
      name: "Videos open to brand inquiries",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Find your next story", exact: true }),
  ).toBeVisible();
});

test("perks recover from failed wallet and catalog reads without treating the balance as zero", async ({
  page,
}) => {
  await rewardFixture(page);
  let failed = true;
  await page.route("**/api/rewards", async (route) => {
    if (failed)
      return route.fulfill({
        status: 503,
        json: { error: "Rewards catalog unavailable" },
      });
    await route.fallback();
  });
  await page.route("**/api/me", async (route) => {
    if (failed)
      return route.fulfill({
        status: 503,
        json: { error: "Points balance unavailable" },
      });
    await route.fallback();
  });
  await page.route("**/api/redemptions", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/rewards?tab=perks");
  await expect(page.locator(".wallet-card strong")).toHaveText("—points");
  await expect(
    page.getByRole("button", { name: "Retry perks", exact: true }),
  ).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Retry perks", exact: true }).click();
  await expect(page.locator(".wallet-card strong")).toHaveText("300points");
  await expect(
    page.getByRole("button", { name: /First funded reward/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry perks", exact: true }),
  ).toHaveCount(0);
});

test("creator, business and Series editor failures have working local retry actions", async ({
  page,
}) => {
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nconst originalAuditRead = communityApi.read;
      communityApi.read = async (view, input = {}) => {
        if (view === 'me' && window.__auditReadRetry !== true) throw new Error('Fixture account read failed');
        return originalAuditRead(view, input);
      };`,
    });
  });
  await openDemo(page, "/profile");
  await expect(
    page.getByRole("button", { name: "Retry profile", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "__auditReadRetry", true));
  await page
    .getByRole("button", { name: "Retry profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByRole("radio", { name: /^Brand account/ }).check();
  await page
    .getByRole("button", { name: "Save account type", exact: true })
    .click();
  await expect(
    page.getByText("Account type saved.", { exact: true }),
  ).toBeVisible();
  await page.goto("/business");
  await expect(
    page.getByRole("button", { name: "Retry account access", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "__auditReadRetry", true));
  await page
    .getByRole("button", { name: "Retry account access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Business workspace", exact: true }),
  ).toBeVisible();
  await page.goto("/series/new");
  await expect(
    page.getByRole("button", { name: "Retry series editor", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => Reflect.set(window, "__auditReadRetry", true));
  await page
    .getByRole("button", { name: "Retry series editor", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "A series starts with a quest you did.",
      exact: true,
    }),
  ).toBeVisible();
});
