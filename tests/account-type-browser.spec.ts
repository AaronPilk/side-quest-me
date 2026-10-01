import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

async function start(page: Page, path = "/onboarding") {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(path);
}
async function profile(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile,
  );
}

test("first onboarding account choice is explicit, survives refresh, and leaves survey answers unknown", async ({
  page,
}) => {
  await start(page);
  await expect(
    page.getByRole("heading", { name: "Make Sidequest yours." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: /^Personal account/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Brand account/ }),
  ).not.toBeChecked();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: /^Personal account/ }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  expect((await profile(page)).accountType).toBe("personal");
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  for (let index = 0; index < 11; index++)
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await page.reload();
  expect((await profile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: /Business workspace/ }),
  ).toHaveCount(0);
  await page.goto("/business");
  await expect(page).toHaveURL(/\/account$/);
});

test("brand onboarding includes quest guidance without granting approval and account switching persists independently", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("radio", { name: /^Brand account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
  expect((await profile(page)).accountType).toBe("brand");
  expect((await profile(page)).onboardingCompleted).toBe(false);
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish later", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Finish preferences later" }),
  ).toContainText("Without your interests");
  await page
    .getByRole("button", { name: "Save and explore for now", exact: true })
    .click();
  await expect(page).toHaveURL(/\/business$/);
  await expect(
    page.getByRole("heading", { name: "Start with your business profile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Available videos" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Business workspace", exact: true }),
  ).toBeVisible();
  expect((await profile(page)).accountType).toBe("brand");
  expect((await profile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: /Business workspace/ }),
  ).toBeVisible();
  await page.goto("/create");
  const reminder = page.getByRole("link", {
    name: "Make it your kind of quest",
    exact: false,
  });
  await expect(reminder).toBeVisible();
  await expect(reminder).toHaveAttribute(
    "href",
    "/preferences?returnTo=%2Fcreate",
  );
  await page.goto("/account");
  await page.getByRole("link", { name: /^Account details/ }).click();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /^Personal account/ }),
  ).toBeChecked();
  expect((await profile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page.goto("/settings");
  await expect(
    page.getByRole("link", { name: /Business workspace/ }),
  ).toHaveCount(0);
  await page.goto("/business");
  await expect(page).toHaveURL(/\/account$/);
});

test("header menu is removed and profile still opens Settings", async ({
  page,
}) => {
  await start(page, "/profile");
  await expect(page.locator(".brandbar .space-menu")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Your space" })).toHaveCount(0);
  await page
    .getByRole("link", { name: "Profile settings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("link", { name: /Account settings/ }),
  ).toBeVisible();
});

test("an older ten-question survey draft resumes review and preserves the account choice already saved", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("radio", { name: /^Brand account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me
      .profile;
    delete saved.accountType;
    sessionStorage.setItem(
      "sq-profile-draft",
      JSON.stringify({
        ownerId: "demo:11111111-1111-4111-8111-111111111111",
        profile: saved,
        step: 10,
        reviewingAnswer: false,
      }),
    );
  });
  await page.goto("/onboarding");
  await expect(
    page.getByRole("button", { name: "Brand account · Edit", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/business$/);
  expect((await profile(page)).accountType).toBe("brand");
});

test("skipping account details and finishing later leaves them unknown and keeps setup easy to revisit", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("radio", { name: /^Brand account/ }).check();
  await page
    .getByRole("textbox", { name: /What should we call you/ })
    .fill("Unsaved nickname");
  await page
    .getByRole("button", { name: "Skip this step", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("sq-profile-draft")!).profile
          .accountType,
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Finish later", exact: true }).click();
  await page
    .getByRole("button", { name: "Save and explore for now", exact: true })
    .click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await profile(page)).accountType).toBeNull();
  expect((await profile(page)).displayName).not.toBe("Unsaved nickname");
  expect((await profile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  expect((await profile(page)).onboardingCompleted).toBe(true);
  await page.goto("/profile");
  await page
    .getByRole("link", { name: /^Account & quest preferences/ })
    .click();
  await expect(page).toHaveURL(/\/preferences\?returnTo=%2Fprofile$/);
  await expect(
    page.getByRole("heading", {
      name: "Account & quest preferences",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start setup", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /^Personal account/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /^Brand account/ }),
  ).not.toBeChecked();
});
