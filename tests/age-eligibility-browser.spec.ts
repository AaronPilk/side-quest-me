import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_OUTING,
  DEFAULT_PREFERENCES,
  type Preferences,
} from "../shared/domain";

async function start(
  page: Page,
  ageBand: Preferences["ageBand"] = null,
  path = "/create",
) {
  await page.addInitScript(
    ({ ageBand, outing, preferences }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      if (!localStorage.getItem("sidequest-demo-v1"))
        localStorage.setItem(
          "sidequest-demo-v1",
          JSON.stringify({
            me: {
              profile: {
                accountType: "personal",
                displayName: "Alex",
                timezone: "UTC",
                locale: "en",
                summary: "",
                onboardingCompleted: true,
                preferences: {
                  ...preferences,
                  ageBand,
                  sources: ageBand ? { ageBand: "survey" } : {},
                },
              },
              wallet: { xp: 0, points: 0, version: 0 },
              roles: [],
            },
            runs: [],
          }),
        );
      if (!sessionStorage.getItem("sq-outing"))
        sessionStorage.setItem("sq-outing", JSON.stringify(outing));
      if (!sessionStorage.getItem("sq-quest-flow"))
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
      ageBand,
      preferences: DEFAULT_PREFERENCES,
      outing: {
        ...DEFAULT_OUTING,
        category: "demon",
        intensity: "full_send",
        group: "friends",
        participants: 5,
        setting: "venue",
        durationMinutes: 180,
        budgetMinor: 25000,
      },
    },
  );
  await page.goto(path);
}

test("account age is explicit, private, saved and can be cleared without changing style answers", async ({
  page,
}) => {
  await start(page, null, "/preferences?step=account&returnTo=%2Fcreate");
  await expect(
    page.getByRole("group", { name: "What’s your age group?" }),
  ).toBeVisible();
  for (const name of ["Under 18", "18–20", "21+"])
    await expect(
      page.getByRole("radio", { name, exact: true }),
    ).not.toBeChecked();
  await page.getByRole("radio", { name: "21+", exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start", exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile
        .preferences,
  );
  expect(saved).toMatchObject({
    ageBand: "21_plus",
    sources: { ageBand: "survey" },
    categories: null,
  });
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.goto("/preferences?step=account&returnTo=%2Fcreate");
  await expect(
    page.getByRole("radio", { name: "21+", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Prefer not to say", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile
          .preferences.ageBand,
    ),
  ).toBeNull();
  await expect(
    page.getByRole("link", {
      name: "Set your age group for adult experiences",
      exact: true,
    }),
  ).toBeVisible();
});

test("venue discovery requires both saved adult age and separate group opt-in", async ({
  page,
}) => {
  await start(page, "21_plus");
  const groupAge = page.getByRole("checkbox", {
    name: "Everyone is an adult and can meet the age rules for the venues we choose.",
  });
  const nightlife = page.getByRole("checkbox", {
    name: "Include adult nightlife. Everyone in our group is up for it.",
  });
  await expect(groupAge).not.toBeChecked();
  await expect(nightlife).toBeDisabled();
  await groupAge.check();
  await nightlife.check();
  await page.reload();
  await expect(nightlife).toBeChecked();
  await groupAge.uncheck();
  await expect(nightlife).not.toBeChecked();
  await expect(nightlife).toBeDisabled();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem("sq-outing")!)),
  ).toMatchObject({ adultEligible: false, adultContext: false });
});

test("under-18 and unknown accounts get age setup instead of adult opt-in", async ({
  page,
}) => {
  await start(page, "under_18");
  await expect(
    page.getByRole("link", {
      name: "Set your age group for adult experiences",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /Include adult nightlife/ }),
  ).toHaveCount(0);
  await page
    .getByRole("link", {
      name: "Set your age group for adult experiences",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("radio", { name: "Under 18", exact: true }),
  ).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("clearing age leaves an explicit way to remove stale adult nightlife choices", async ({
  page,
}) => {
  await start(page, "21_plus");
  await page
    .getByRole("checkbox", {
      name: "Everyone is an adult and can meet the age rules for the venues we choose.",
    })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Include adult nightlife. Everyone in our group is up for it.",
    })
    .check();
  await page.goto("/preferences?step=account&returnTo=%2Fcreate");
  await page
    .getByRole("button", { name: "Prefer not to say", exact: true })
    .click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page
    .getByRole("button", {
      name: "Find ideas without adult nightlife",
      exact: true,
    })
    .click();
  expect(
    await page.evaluate(() => JSON.parse(sessionStorage.getItem("sq-outing")!)),
  ).toMatchObject({ adultContext: false, adultEligible: false });
  await expect(
    page.getByRole("button", { name: "Find my quests", exact: true }),
  ).toBeEnabled();
});
