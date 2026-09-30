import { test, expect, type Page } from "@playwright/test";
import { reviewQuestPlans } from "./quest-wizard-helpers";
import { DEFAULT_OUTING } from "../shared/domain";

// These are explicitly mocked Apple SDK responses. They verify our integration
// and privacy behavior, not Apple authorization or live place accuracy.
const mockPlace = {
  id: "MOCK_APPLE_PLACE_123",
  name: "MOCK Harbor Park — browser fixture",
  formattedAddress: "MOCK 123 Harbor Avenue, Test City",
  coordinate: { latitude: 47.620123, longitude: -122.350456 },
};
const secondPlace = {
  ...mockPlace,
  id: "MOCK_APPLE_PLACE_456",
  name: "MOCK New Search Park",
};
const target = "day_tiny_discovery_chill_v1";

async function openTravel(
  page: Page,
  setting: "Outside" | "At a venue" = "Outside",
) {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(`/create?template=${target}`);
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Enter exact amount", exact: true })
    .click();
  await page.getByRole("spinbutton", { name: "Budget in dollars" }).fill("25");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: setting, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Where should we go?",
      exact: true,
    }),
  ).toBeVisible();
}

async function installMockSdk(page: Page, configFailure = false) {
  let failConfig = configFailure;
  await page.route("**/api/maps/config", (route) =>
    failConfig
      ? route.fulfill({
          status: 503,
          json: { error: "Mock initial connection failure" },
        })
      : route.fulfill({
          json: { token: "mock-apple-token-for-browser-verification" },
        }),
  );
  await page.route(
    "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `
      window.__appleMapsMock = { searches: [], lookups: [], libraries: [], maps: 0, destroyed: 0 };
      class MockSearch {
        async search(query, options) {
          window.__appleMapsMock.searches.push({ query, coordinate: options.coordinate || null });
          // Deliberately ignore AbortSignal to check the app's stale-result guard.
          const response = await fetch('/__apple-maps-fixture/search?' + new URLSearchParams({ query }));
          if (!response.ok) throw new Error('Mock Apple search failure');
          return response.json();
        }
      }
      class MockLookup {
        async getPlace(id) {
          window.__appleMapsMock.lookups.push(id);
          const response = await fetch('/__apple-maps-fixture/lookup?' + new URLSearchParams({ id }));
          if (!response.ok) throw new Error('Mock Apple lookup failure');
          return response.json();
        }
      }
      class MockMap {
        constructor(element) {
          this.element = element;
          element.textContent = 'MOCK Apple Maps preview — browser verification only';
          window.__appleMapsMock.maps++;
        }
        showItems(items) { this.element.dataset.mockPlaceId = items[0].place.id; }
        destroy() { window.__appleMapsMock.destroyed++; this.element.textContent = ''; }
      }
      class MockPlaceAnnotation { constructor(place) { this.place = place; } }
      window.mapkit = {
        Search: MockSearch, PlaceLookup: MockLookup, Map: MockMap, PlaceAnnotation: MockPlaceAnnotation,
        async load(libraries) { window.__appleMapsMock.libraries.push(libraries); return window.mapkit; }
      };
    `,
      }),
  );
  await page.route("**/__apple-maps-fixture/lookup?*", (route) =>
    route.fulfill({
      json: {
        ...mockPlace,
        id: new URL(route.request().url()).searchParams.get("id"),
      },
    }),
  );
  await page.route("**/__apple-maps-fixture/search?*", (route) =>
    route.fulfill({ json: { places: [mockPlace, mockPlace] } }),
  );
  return {
    retryConfig: () => {
      failConfig = false;
    },
  };
}

async function draft(page: Page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("sq-outing")!));
}
async function storageText(page: Page) {
  return page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
}
async function pickMockPlace(page: Page) {
  await page.getByRole("button", { name: "Find places", exact: true }).click();
  await expect(page.locator(".apple-place-result")).toHaveCount(1);
  await page.getByRole("button", { name: new RegExp(mockPlace.name) }).click();
  await expect(
    page.getByRole("region", { name: `Map of ${mockPlace.name}` }),
  ).toBeVisible();
}

test("unconfigured Apple Maps has an honest external browse fallback and no simulated results", async ({
  page,
}) => {
  let sdkRequests = 0;
  await page.route("**/api/maps/config", (route) =>
    route.fulfill({ json: { token: null } }),
  );
  await page.route("https://cdn.apple-mapkit.com/**", (route) => {
    sdkRequests++;
    return route.abort();
  });
  await openTravel(page);
  await expect(
    page.getByText(/In-app place search isn’t connected yet/),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Seattle");
  const href = await page
    .getByRole("link", { name: "Browse in Apple Maps" })
    .getAttribute("href");
  expect(new URL(href!).origin).toBe("https://maps.apple.com");
  expect(new URL(href!).searchParams.get("query")).toBe("parks in Seattle");
  await expect(
    page.getByRole("button", { name: "Find places", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".apple-place-result")).toHaveCount(0);
  expect(sdkRequests).toBe(0);
  await reviewQuestPlans(page);
  expect((await draft(page)).area).toBe("Seattle");
  expect((await draft(page)).applePlaceId ?? null).toBeNull();
});

test("mocked Apple search selection persists only its ID through review, acceptance, and refresh", async ({
  page,
}, testInfo) => {
  await installMockSdk(page);
  await openTravel(page);
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Seattle");
  await page
    .getByRole("combobox", { name: "Getting there", exact: true })
    .selectOption("walk");
  await pickMockPlace(page);
  expect(await draft(page)).toMatchObject({
    applePlaceId: mockPlace.id,
    budgetMinor: 2500,
    participants: 2,
    durationMinutes: 60,
    area: "Seattle",
    travelMinutes: 0,
    travelCostMinor: 0,
    venuePermission: false,
    arrangementConfirmed: false,
  });
  expect(
    await page
      .locator('script[data-callback="initMapKitLoaderV2"]')
      .getAttribute("data-token"),
  ).toBe("mock-apple-token-for-browser-verification");
  expect(
    await page.evaluate(() => Reflect.get(window, "__appleMapsMock").libraries),
  ).toContainEqual(["services", "full-map"]);
  await reviewQuestPlans(page);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Ready to find your quest?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: `Map of ${mockPlace.name}` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Check this quest", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await page.locator(".quest-card").click();
  const directions = new URL(
    (await page
      .getByRole("link", { name: "Get directions", exact: true })
      .getAttribute("href"))!,
  );
  expect(directions.origin).toBe("https://maps.apple.com");
  expect(directions.searchParams.get("destination-place-id")).toBe(
    mockPlace.id,
  );
  expect(directions.searchParams.get("mode")).toBe("walking");
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  let lookupUnavailable = true;
  await page.route("**/__apple-maps-fixture/lookup?*", (route) =>
    lookupUnavailable
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: mockPlace }),
  );
  await page.reload();
  await expect(
    page.getByText(/This place’s latest details aren’t available/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open in Apple Maps", exact: true }),
  ).toBeVisible();
  lookupUnavailable = false;
  await page
    .getByRole("button", { name: "Retry place details", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: `Map of ${mockPlace.name}` }),
  ).toBeVisible();
  const openLink = new URL(
    (await page
      .getByRole("link", { name: "Open in Apple Maps", exact: true })
      .getAttribute("href"))!,
  );
  expect(openLink.searchParams.get("place-id")).toBe(mockPlace.id);
  const run = await page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0],
  );
  expect(run.outing).toMatchObject({
    applePlaceId: mockPlace.id,
    budgetMinor: 2500,
    participants: 2,
    durationMinutes: 60,
    travelMinutes: 0,
  });
  const stored = await storageText(page);
  for (const field of [
    mockPlace.name,
    mockPlace.formattedAddress,
    "47.620123",
    "-122.350456",
    "formattedAddress",
    "coordinate",
  ])
    expect(stored).not.toContain(field);
  await page.screenshot({
    path: testInfo.outputPath("mock-apple-place-active-mobile.png"),
    fullPage: true,
  });
});

test("changing or removing a mocked place clears prior venue confirmations and home clears travel", async ({
  page,
}) => {
  await installMockSdk(page);
  await openTravel(page, "At a venue");
  await pickMockPlace(page);
  await reviewQuestPlans(page);
  const options = page.locator(".quest-arrangements");
  if (!(await options.getAttribute("open"))) {
    if (!(await options.evaluate((node) => (node as HTMLDetailsElement).open)))
      await options.locator("summary").click();
  }
  await page
    .getByRole("checkbox", {
      name: "We’ve arranged the required people, equipment or performance slot.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "We have permission for the activity and filming.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "All participants are adults and meet the venue’s legal age requirement.",
      exact: true,
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Include explicitly agreed adult nightlife contexts.",
      exact: true,
    })
    .check();
  await page
    .getByRole("spinbutton", {
      name: "Confirmed total admission / room cost (USD)",
      exact: true,
    })
    .fill("12");
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit travel", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove selected place", exact: true })
    .click();
  expect(await draft(page)).toMatchObject({
    applePlaceId: null,
    venuePermission: false,
    confirmedVenueCostMinor: null,
    arrangementConfirmed: false,
    adultEligible: false,
    adultContext: false,
  });
  await pickMockPlace(page);
  await reviewQuestPlans(page);
  await page.getByRole("button", { name: "Edit setting", exact: true }).click();
  await page.getByRole("button", { name: "At home", exact: true }).click();
  await reviewQuestPlans(page);
  expect(await draft(page)).toMatchObject({
    setting: "home",
    applePlaceId: null,
    travelMinutes: 0,
    travelCostMinor: 0,
    transport: "none",
    venuePermission: false,
    confirmedVenueCostMinor: null,
    adultEligible: false,
    adultContext: false,
  });
  await expect(
    page.getByRole("region", { name: "Your quest location", exact: true }),
  ).toHaveCount(0);
});

test("mocked Apple connection and search failures retry, stale results stay hidden, and denied location permits manual search", async ({
  page,
}) => {
  const config = await installMockSdk(page, true);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(
          _success: unknown,
          failure: (error: { code: number; message: string }) => void,
        ) {
          failure({ code: 1, message: "Mock permission denied" });
        },
      },
    }),
  );
  let failSearch = true;
  let releaseOld!: () => void;
  const oldSearch = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.route("**/__apple-maps-fixture/search?*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("query")!;
    if (failSearch) return route.fulfill({ status: 503, json: {} });
    if (query.startsWith("old search")) {
      await oldSearch;
      return route.fulfill({ json: { places: [mockPlace] } });
    }
    return route.fulfill({ json: { places: [secondPlace] } });
  });
  await openTravel(page);
  await expect(
    page.getByRole("button", { name: "Retry Apple Maps", exact: true }),
  ).toBeVisible();
  config.retryConfig();
  await page
    .getByRole("button", { name: "Retry Apple Maps", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use my current area", exact: true })
    .click();
  await expect(page.getByText(/Location access is off/)).toBeVisible();
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Seattle");
  await page.getByRole("button", { name: "Find places", exact: true }).click();
  await expect(page.getByText(/Places couldn’t load/)).toBeVisible();
  failSearch = false;
  await page
    .getByRole("textbox", { name: "Search Apple Maps", exact: true })
    .fill("old search");
  await page.getByRole("button", { name: "Find places", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Find places", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Search Apple Maps", exact: true })
    .fill("new search");
  await page.getByRole("button", { name: "Find places", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(secondPlace.name) }),
  ).toBeVisible();
  const staleResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/__apple-maps-fixture/search?") &&
      new URL(response.url()).searchParams.get("query") ===
        "old search in Seattle",
  );
  releaseOld();
  await staleResponse;
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  await expect(
    page.getByRole("button", { name: new RegExp(mockPlace.name) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: new RegExp(secondPlace.name) }),
  ).toBeVisible();
  expect((await draft(page)).applePlaceId ?? null).toBeNull();
});

test("current area works without Maps configuration and nearby events use that location without changing the quest", async ({
  page,
}) => {
  await page.route("**/api/maps/config", (route) =>
    route.fulfill({ json: { token: null } }),
  );
  await page.route("**/api/events/config", (route) =>
    route.fulfill({ json: { configured: true } }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: (value: unknown) => void) =>
          success({ coords: { latitude: 47.620123, longitude: -122.350456 } }),
      },
    }),
  );
  let fail = true;
  const requests: unknown[] = [];
  await page.route("**/api/events/nearby", (route) => {
    requests.push(route.request().postDataJSON());
    return fail
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({
          json: {
            configured: true,
            checkedAt: "2026-09-30T16:00:00Z",
            events: [
              {
                id: "fixture-event",
                name: "MOCK local concert — browser fixture",
                date: "2026-10-01",
                time: "19:30:00",
                venue: "MOCK venue",
                city: "Seattle",
                source: "Universe",
                price: null,
                url: "https://www.universe.com/events/fixture",
              },
            ],
          },
        });
  });
  await openTravel(page);
  await page
    .getByRole("button", { name: "Use my current area", exact: true })
    .click();
  await expect(
    page.getByText(/Using your current area for nearby searches/),
  ).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Browse in Apple Maps" })
    .getAttribute("href");
  expect(new URL(href!).searchParams.get("center")).toBe(
    "47.620123,-122.350456",
  );
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Find nearby events", exact: true })
    .click();
  await expect(page.getByText(/Nearby events couldn’t load/)).toBeVisible();
  fail = false;
  await page
    .getByRole("button", { name: "Find nearby events", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MOCK local concert — browser fixture" }),
  ).toBeVisible();
  expect(requests.at(-1)).toMatchObject({
    center: { latitude: 47.620123, longitude: -122.350456 },
    days: 7,
  });
  expect(await draft(page)).toEqual(before);
  await expect(
    page.getByText(/Check ticket price and availability/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use entered area instead", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "MOCK local concert — browser fixture" }),
  ).toHaveCount(0);
  const stored = await storageText(page);
  expect(stored).not.toContain("47.620123");
  expect(stored).not.toContain("MOCK local concert");
});

test("current area immediately searches real provider categories and keeps place context out of storage", async ({
  page,
}) => {
  await installMockSdk(page);
  await page.route("**/__apple-maps-fixture/search?*", (route) =>
    route.fulfill({
      json: { places: [{ ...mockPlace, pointOfInterestCategory: "Park" }] },
    }),
  );
  await page.addInitScript(() => {
    Reflect.set(window, "__geoRequests", 0);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: (value: unknown) => void) {
          Reflect.set(
            window,
            "__geoRequests",
            Reflect.get(window, "__geoRequests") + 1,
          );
          success({ coords: { latitude: 47.620123, longitude: -122.350456 } });
        },
      },
    });
  });
  await openTravel(page);
  expect(await page.evaluate(() => Reflect.get(window, "__geoRequests"))).toBe(
    0,
  );
  const before = await draft(page);
  await page
    .getByRole("button", { name: "Use my current area", exact: true })
    .click();
  await expect(page.locator(".apple-place-result")).toHaveCount(1);
  expect(await page.evaluate(() => Reflect.get(window, "__geoRequests"))).toBe(
    1,
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "__appleMapsMock").searches),
  ).toEqual([
    {
      query: "parks",
      coordinate: { latitude: 47.620123, longitude: -122.350456 },
    },
  ]);
  expect(await draft(page)).toEqual(before);
  await page.getByRole("button", { name: new RegExp(mockPlace.name) }).click();
  expect((await draft(page)).applePlaceId).toBe(mockPlace.id);
  const stored = await storageText(page);
  expect(stored).not.toContain("pointOfInterestCategory");
  expect(stored).not.toContain("47.620123");
  expect(stored).not.toContain(mockPlace.name);
});

test("the selected provider place category reaches quest ranking and disappears when unavailable", async ({
  page,
}) => {
  await installMockSdk(page);
  let category: string | null = "Park";
  await page.route("**/__apple-maps-fixture/lookup?*", (route) =>
    route.fulfill({
      json: { ...mockPlace, pointOfInterestCategory: category },
    }),
  );
  await page.addInitScript(
    ({ outing }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      sessionStorage.setItem("sq-outing", JSON.stringify(outing));
      sessionStorage.setItem(
        "sq-quest-flow",
        JSON.stringify({
          version: 3,
          targetId: null,
          step: "review",
          editing: false,
          confirmed: Object.keys(outing),
          requiredFields: [],
        }),
      );
    },
    {
      outing: {
        ...DEFAULT_OUTING,
        setting: "outside",
        applePlaceId: mockPlace.id,
      },
    },
  );
  await page.goto("/create");
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card").first()).toContainText(
    "Suggested for a park setting",
  );
  const selected = await draft(page);
  expect(selected).toMatchObject({
    intensity: "chill",
    participants: 2,
    durationMinutes: 60,
    budgetMinor: 0,
    setting: "outside",
  });
  // A new page has no cached category. Unknown provider data makes no fit claim.
  category = null;
  await page.reload();
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
  await expect(page.locator(".quest-card")).toHaveCount(3);
  await expect(page.locator(".quest-results")).not.toContainText(
    "Suggested for a park setting",
  );
});

test("entering a town takes precedence over a late current-location response", async ({
  page,
}) => {
  await installMockSdk(page);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: (value: unknown) => void) =>
          Reflect.set(window, "__deliverPosition", success),
      },
    }),
  );
  await openTravel(page);
  await page
    .getByRole("button", { name: "Use my current area", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Finding your area…", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Area", exact: true })
    .fill("Seattle");
  await page.evaluate(() =>
    Reflect.get(
      window,
      "__deliverPosition",
    )({ coords: { latitude: 47.62, longitude: -122.35 } }),
  );
  await expect(
    page.getByText(/Using your current area for nearby searches/),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Find places", exact: true }).click();
  await expect(page.locator(".apple-place-result")).toHaveCount(1);
  expect(
    await page.evaluate(() => Reflect.get(window, "__appleMapsMock").searches),
  ).toEqual([{ query: "parks in Seattle", coordinate: null }]);
});
