import { expect, test, type Page } from "@playwright/test";
import type { LicenseOffer, LicenseTerms } from "../shared/community";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import { DEMO_PEOPLE } from "../src/lib/demo-identity";
import { selectDemoPersona } from "./demo-persona-helper";

const creator = DEMO_PEOPLE.creator.id;
const brand = DEMO_PEOPLE.brand.id;
const terms: LicenseTerms = {
  paymentMinor: 12500,
  platformFeeMinor: 500,
  currency: "USD",
  channels: ["brand_social"],
  startDate: "2026-09-29",
  durationDays: 30,
  editingPermissions: "none",
  message: "Browser fixture exact-video agreement.",
};
function offer(index: number, patch: Partial<LicenseOffer> = {}): LicenseOffer {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    creatorId: creator,
    creatorName: "Fixture creator",
    brandId: brand,
    brandName: "Fixture business",
    postId: "55555555-5555-4555-8555-555555555555",
    assetId: "66666666-6666-4666-8666-666666666666",
    postTitle: `Fixture story ${index}`,
    state: "proposed",
    version: 1,
    proposerId: brand,
    terms,
    acceptedTerms: null,
    acceptedAt: null,
    history: [],
    fulfillment: null,
    mediaUrl: null,
    createdAt: "2026-09-29T10:00:00Z",
    suspended: false,
    moderationReason: null,
    demo: true,
    ...patch,
  };
}
async function seed(page: Page) {
  const paid = offer(1, {
    state: "completed",
    version: 3,
    acceptedTerms: terms,
    acceptedAt: "2026-09-29T11:00:00Z",
    fulfillment: {
      paymentReference: "Fixture bank payment 123",
      permissionReference: "Fixture permission record",
      usageStartsAt: "2026-09-29T00:00:00Z",
      usageEndsAt: "2026-10-29T00:00:00Z",
      completedAt: "2026-09-29T12:00:00Z",
    },
  });
  const pending = offer(2, {
    state: "pending_fulfillment",
    acceptedTerms: { ...terms, paymentMinor: 6000 },
    acceptedAt: "2026-09-29T11:00:00Z",
  });
  await page.addInitScript(
    ({ offers, people, preferences }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      const creatorId = people.creator.id;
      if (!localStorage.getItem("sidequest-demo-v1"))
        localStorage.setItem(
          "sidequest-demo-v1",
          JSON.stringify({
            me: {
              profile: {
                displayName: "Fixture creator",
                timezone: "UTC",
                locale: "en",
                summary: "",
                onboardingCompleted: true,
                preferences,
              },
              wallet: { xp: 700, points: 73, version: 0 },
              roles: [],
            },
            runs: [],
          }),
        );
      if (!localStorage.getItem("sidequest-community-demo-v1"))
        localStorage.setItem(
          "sidequest-community-demo-v1",
          JSON.stringify({
            creators: Object.fromEntries(
              Object.values(people).map((person) => [
                person.id,
                {
                  id: person.id,
                  displayName:
                    person.id === creatorId ? "Fixture creator" : person.name,
                  avatarKey: "mint",
                  bio: "Local verification fixture",
                  openToBrands: true,
                  version: 1,
                  publishedCount: 0,
                  attemptCount: 0,
                  authoredCount: 0,
                  demo: true,
                },
              ]),
            ),
            posts: [],
            drafts: [],
            brands: [
              {
                id: people.brand.id,
                ownerId: people.brand.id,
                name: "Fixture business",
                website: "https://example.com",
                contactEmail: "fixture@example.com",
                state: "approved",
                version: 1,
                reviewNotes: "Local fixture",
              },
            ],
            offers,
            activity: [],
            reports: [],
            blocks: [],
            readIds: [],
            requests: {},
          }),
        );
    },
    {
      offers: [
        paid,
        {
          ...paid,
          version: 2,
          state: "pending_fulfillment",
          fulfillment: null,
        },
        pending,
        offer(3, { terms: { ...terms, paymentMinor: 99900 } }),
        offer(4, {
          state: "countered",
          terms: { ...terms, paymentMinor: 80000 },
        }),
        offer(5, { state: "declined" }),
        offer(6, {
          ...paid,
          id: "00000000-0000-4000-8000-000000000006",
          creatorName: "Another creator",
          brandId: creator,
          creatorId: DEMO_PEOPLE.viewer.id,
        }),
      ],
      people: DEMO_PEOPLE,
      preferences: DEFAULT_PREFERENCES,
    },
  );
}

test("five primary destinations work and local identity tools stay in Settings with staff access gated", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/create");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const primary = page.getByRole("navigation", { name: "Primary" });
    await expect(primary.getByRole("link")).toHaveText([
      "Discover",
      "Activity",
      "Create",
      "Rewards",
      "Profile",
    ]);
    for (const label of [
      "Discover",
      "Activity",
      "Create",
      "Rewards",
      "Profile",
    ])
      await expect(
        primary.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("combobox", { name: "Demo view", exact: true }),
    ).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".space-menu")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Profile", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Profile settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: /^Admin|Business workspace/ }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: /Demo tools/ }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/Staff access is required/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record verified fulfillment" }),
  ).toHaveCount(0);
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/rewards\?tab=offers$/);
  await selectDemoPersona(page, "operator");
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Operator review", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: /^Admin/ }),
  ).toBeVisible();
  await selectDemoPersona(page, "brand");
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/business$/);
  await expect(
    page.getByRole("heading", { name: "Business workspace", exact: true }),
  ).toBeVisible();
});

test("Rewards keeps verified income, accepted pending amounts, proposals and points distinct after refresh", async ({
  page,
}, testInfo) => {
  await seed(page);
  await page.goto("/rewards");
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toContainText("$125.00");
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toContainText("1 payment verified manually");
  await expect(
    page.getByRole("region", {
      name: "Accepted awaiting payment",
      exact: true,
    }),
  ).toContainText("$60.00");
  await expect(page.locator(".payment-row")).toHaveCount(2);
  await expect(
    page.getByText("Payment reference: Fixture bank payment 123", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.getByText("$999.00", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /withdraw|payout/i }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toContainText("$125.00");
  await page.getByRole("tab", { name: "Brand offers", exact: true }).click();
  await expect(page).toHaveURL(/tab=offers/);
  await expect(
    page.getByRole("heading", { name: "Active offers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Past deals", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Fixture story 3/ }),
  ).toContainText("$999.00");
  await expect(page.getByRole("link", { name: /Fixture story 1/ })).toHaveCount(
    1,
  );
  await page.getByRole("link", { name: /Fixture story 1/ }).click();
  await expect(page).toHaveURL(
    /\/offers\/00000000-0000-4000-8000-000000000001$/,
  );
  await expect(
    page.getByRole("heading", {
      name: "Verified manual fulfillment",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/rewards?tab=earnings");
  await page.getByRole("tab", { name: "Earnings", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Perks", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("SIMULATED AVAILABLE POINTS", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wallet-card strong")).toHaveText("73points");
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Perks", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Earnings", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("rewards-earnings-320-text200.png"),
    fullPage: true,
  });
});

test("Rewards shows failed reads honestly and retries without inventing a zero balance", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\n
      const originalRewardsRead = communityApi.read;
      communityApi.read = async (view, input = {}) => {
        if (view === 'me' && window.__rewardsReadFailed !== false) throw new Error('Fixture rewards read failed');
        return originalRewardsRead(view, input);
      };`,
    });
  });
  await page.goto("/rewards");
  await expect(
    page.getByText("Fixture rewards read failed", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Accepted awaiting payment",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => Reflect.set(window, "__rewardsReadFailed", false));
  await page
    .getByRole("button", { name: "Retry rewards", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Verified payments", exact: true }),
  ).toContainText("$125.00");
  await expect(
    page.getByText("Fixture rewards read failed", { exact: true }),
  ).toHaveCount(0);
});

test("signed-out visitors cannot open earnings or local identity tools using stored demo data", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/src/lib/auth.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "export const DEMO = false; export const supabase = null; export async function accessToken() { return undefined; }",
    }),
  );
  for (const route of [
    "/rewards?tab=earnings",
    "/settings/demo-tools",
    "/admin",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: /Make tonight/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Verified payments", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Fixture bank payment 123", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Demo view", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Record verified fulfillment" }),
    ).toHaveCount(0);
  }
});

test("primary navigation labels and page headings remain clear at narrow widths and enlarged text", async ({
  page,
}, testInfo) => {
  await seed(page);
  for (const route of ["rewards", "profile", "settings"]) {
    for (const size of [
      { width: 320, text: 100 },
      { width: 390, text: 100 },
      { width: 768, text: 100 },
      { width: 1440, text: 100 },
      { width: 320, text: 200 },
    ]) {
      const label = `${route}-${size.width}-text${size.text}`;
      await test.step(label, async () => {
        await page.setViewportSize({ width: size.width, height: 900 });
        await page.goto(`/${route}`);
        await expect(page.locator("main h1").first()).toBeVisible();
        await page.evaluate(
          (text) => (document.documentElement.style.fontSize = `${text}%`),
          size.text,
        );
        const layout = await page.evaluate(() => {
          const header = document
            .querySelector(".brandbar")!
            .getBoundingClientRect();
          const heading = document
            .querySelector("main h1")!
            .getBoundingClientRect();
          const navigation = document.querySelector(
            'nav[aria-label="Primary"]',
          )!;
          return {
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            headerBottom: header.bottom,
            headingTop: heading.top,
            labels: [...navigation.querySelectorAll("a span")].map((span) => {
              const range = document.createRange();
              range.selectNodeContents(span);
              const lines = [...range.getClientRects()];
              const anchor = span.closest("a")!.getBoundingClientRect();
              return {
                text: span.textContent,
                lineCount: new Set(lines.map((line) => Math.round(line.top)))
                  .size,
                fits: lines.every(
                  (line) =>
                    line.left >= anchor.left - 1 &&
                    line.right <= anchor.right + 1,
                ),
                visible:
                  anchor.left >= -1 &&
                  anchor.right <= innerWidth + 1 &&
                  anchor.bottom <= innerHeight + 1,
              };
            }),
          };
        });
        await page.screenshot({ path: testInfo.outputPath(`${label}.png`) });
        await testInfo.attach(`${label}-layout`, {
          body: JSON.stringify(layout, null, 2),
          contentType: "application/json",
        });
        expect
          .soft(layout.scrollWidth, label)
          .toBeLessThanOrEqual(layout.width + 1);
        if (size.width < 1120)
          expect
            .soft(layout.headerBottom, label)
            .toBeLessThanOrEqual(layout.headingTop + 1);
        expect.soft(layout.labels, label).toHaveLength(5);
        for (const item of layout.labels) {
          expect.soft(item.lineCount, `${label}: ${item.text}`).toBe(1);
          expect.soft(item.fits, `${label}: ${item.text}`).toBe(true);
          expect.soft(item.visible, `${label}: ${item.text}`).toBe(true);
        }
      });
    }
  }
});
