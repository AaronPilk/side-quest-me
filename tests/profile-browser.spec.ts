import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

async function startSurvey(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
}
async function storedProfile(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile,
  );
}

test("skipping all ten questions leaves unknown answers and never invents role rotation", async ({
  page,
}) => {
  await startSurvey(page);
  for (let step = 0; step < 10; step++) {
    await expect(
      page.getByText(`${step + 1} of 10`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  }
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".review-chips .chip")).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await storedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page.goto("/account");
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
});

test("moving past an answered question preserves it; explicit reset persists unknown", async ({
  page,
}) => {
  await startSurvey(page);
  for (let step = 0; step < 4; step++)
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  const rotate = page.getByRole("button", {
    name: "Rotate me around",
    exact: true,
  });
  await rotate.click();
  await page
    .getByRole("button", { name: "Skip this question", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Reset answer to unknown", exact: true })
    .click();
  await expect(rotate).toHaveAttribute("aria-pressed", "false");
  for (let step = 4; step < 10; step++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await storedProfile(page)).preferences.role).toBeNull();
});

test("manual summary review, immediate removal and error feedback preserve separate confirmed answers after refresh", async ({
  page,
}, testInfo) => {
  await page.addInitScript(
    (preferences) => {
      if (localStorage.getItem("sidequest-demo-v1")) return;
      sessionStorage.setItem("sq-demo-started", "1");
      localStorage.setItem(
        "sidequest-demo-v1",
        JSON.stringify({
          me: {
            profile: {
              displayName: "Profile test",
              timezone: "UTC",
              locale: "en",
              summary:
                "I watch prank videos. My willingness to perform is unknown. Product-design requests are not my preferences.",
              onboardingCompleted: true,
              preferences,
            },
            wallet: { xp: 0, points: 0, version: 0 },
            roles: [],
          },
          runs: [],
        }),
      );
    },
    {
      ...DEFAULT_PREFERENCES,
      role: "camera_person",
      exclusions: ["alcohol"],
      sources: { role: "survey", exclusions: "survey" },
    },
  );
  await page.goto("/profile/import");
  await expect(
    page.getByText("This is a manual review:", { exact: false }),
  ).toBeVisible();
  const summary = page.getByRole("textbox", {
    name: "Review what you’re sharing",
  });
  const text =
    "I like games, but not public performance. Maybe music. I watch pranks without wanting to do them.";
  await summary.fill(text);
  await page.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(
    page.getByText("Summary saved.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(summary).toHaveValue(text);
  expect((await storedProfile(page)).preferences.interests).toBeNull();
  expect((await storedProfile(page)).preferences.premises).toBeNull();
  await page
    .locator("summary")
    .filter({ hasText: "Interests & useful skills" })
    .click();
  await page
    .getByRole("group", { name: "Interests to explore", exact: true })
    .getByRole("button", { name: "Games", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save confirmed preferences", exact: true })
    .click();
  await expect(
    page.getByText("Confirmed preferences saved.", { exact: false }),
  ).toBeVisible();
  const confirmed = (await storedProfile(page)).preferences;
  expect(confirmed.interests).toEqual(["games"]);
  expect(confirmed.sources.interests).toBe("summary_review");
  expect(confirmed.sources.role).toBe("survey");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sidequest-demo-v1")
        throw new Error("Storage is full. Please try again.");
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole("button", { name: "Remove saved summary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Storage is full");
  await expect(summary).toHaveValue(text);
  await page.reload();
  await page
    .getByRole("button", { name: "Remove saved summary", exact: true })
    .click();
  await expect(
    page.getByText("Summary removed. Your confirmed answers are unchanged.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(summary).toHaveValue("");
  expect((await storedProfile(page)).preferences).toEqual(confirmed);
  await page.screenshot({
    path: testInfo.outputPath("profile-review-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("profile-review-desktop.png"),
    fullPage: true,
  });
});
