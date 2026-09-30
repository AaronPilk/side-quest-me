import { test, expect, type Page } from "@playwright/test";
import { reviewQuestPlans } from "./quest-wizard-helpers";

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
  await page.getByRole("spinbutton", { name: "Budget in dollars" }).fill("25");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "1 hour", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: setting, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How are you getting there?",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".quest-location summary").click();
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
  await page
    .getByRole("spinbutton", { name: "Round-trip travel (min)", exact: true })
    .fill("10");
  await page
    .getByRole("spinbutton", { name: "Travel estimate (USD)", exact: true })
    .fill("3");
  await pickMockPlace(page);
  expect(await draft(page)).toMatchObject({
    applePlaceId: mockPlace.id,
    budgetMinor: 2500,
    participants: 2,
    durationMinutes: 60,
    area: "Seattle",
    travelMinutes: 10,
    travelCostMinor: 300,
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
    travelMinutes: 10,
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
  await page
    .getByRole("spinbutton", { name: "Round-trip travel (min)", exact: true })
    .fill("10");
  await page
    .getByRole("spinbutton", { name: "Travel estimate (USD)", exact: true })
    .fill("3");
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Edit arrangements", exact: true })
    .click();
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
