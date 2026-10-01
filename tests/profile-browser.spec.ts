import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

async function startSurvey(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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

test("a first-run account reaches the account choice from Create before any preference question", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  const target = "/create?template=date_pit_crew_chill_v1";
  await page.goto(target);
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  await page
    .getByRole("link", { name: "Make it your kind of quest", exact: false })
    .click();
  await expect(page.getByText("Your account", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make Sidequest yours." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await page
    .getByRole("link", { name: "Make it your kind of quest", exact: false })
    .click();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Optional context", { exact: true }),
  ).toBeVisible();
  expect((await storedProfile(page)).accountType).toBe("personal");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByText("1 of 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  // With a stated account type the same nudge opens the direct editor.
  await page
    .getByRole("link", { name: "Make it your kind of quest", exact: false })
    .click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
});

test("guided preferences return to the exact selected quest after Back, saving, completion and refresh", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  // State the account type first: the direct editor is for accounts that
  // already made that choice; first-run accounts start with it.
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Optional context", { exact: true }),
  ).toBeVisible();
  const target =
    "/create?template=date_pit_crew_chill_v1&from=55555555-5555-4555-8555-555555555555";
  await page.goto(target);
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  const before = await page.evaluate(() => ({
    outing: sessionStorage.getItem("sq-outing"),
    flow: sessionStorage.getItem("sq-quest-flow"),
  }));
  const enterProfile = () =>
    page
      .getByRole("link", { name: "Make it your kind of quest", exact: false })
      .click();
  await enterProfile();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await enterProfile();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  await page
    .getByRole("button", {
      name: "No preference for this question",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await enterProfile();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  await page.reload();
  for (let step = 1; step < 11; step++) {
    await expect(
      page.getByText(`${step + 1} of 11`, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Who’s coming?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Friends", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() => ({
      outing: sessionStorage.getItem("sq-outing"),
      flow: sessionStorage.getItem("sq-quest-flow"),
    })),
  ).toEqual(before);
  expect(
    await page.evaluate(() => sessionStorage.getItem("sq-return-to")),
  ).toBeNull();
});

test("sequential typing preserves spaces in boundaries, humor examples and other skills through save and refresh", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/profile/import");
  await page
    .locator("summary")
    .filter({ hasText: "Interests & useful skills" })
    .click();
  await page.locator("summary").filter({ hasText: "Firm boundaries" }).click();
  const phrases = [
    ["Another skill (optional)", "  live sound mixing  ", "live sound mixing"],
    [
      "Creators or examples (optional)",
      "  dry comedy sketches  ",
      "dry comedy sketches",
    ],
    [
      "Another boundary (optional; needs review before recommendations)",
      "  no loud music  ",
      "no loud music",
    ],
  ];
  for (const [label, raw, saved] of phrases) {
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.pressSequentially(raw, { delay: 5 });
    await expect(input).toHaveValue(raw);
    await input.press("Tab");
    await expect(input).toHaveValue(saved);
  }
  await page
    .getByRole("button", { name: "Save confirmed preferences", exact: true })
    .click();
  await expect(
    page.getByText("Confirmed preferences saved.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page
    .locator("summary")
    .filter({ hasText: "Interests & useful skills" })
    .click();
  await page.locator("summary").filter({ hasText: "Firm boundaries" }).click();
  for (const [label, , saved] of phrases)
    await expect(
      page.getByRole("textbox", { name: label, exact: true }),
    ).toHaveValue(saved);
  expect((await storedProfile(page)).preferences).toMatchObject({
    otherSkill: "live sound mixing",
    humorExamples: "dry comedy sketches",
    otherExclusion: "no loud music",
  });
});

test("account describes confirmed participation and preparation while an unanswered profile stays unknown", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/account");
  await expect(
    page.getByText("No preferences confirmed yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page.evaluate(
    (preferences) => {
      const saved = JSON.parse(localStorage.getItem("sidequest-demo-v1")!);
      saved.me.profile.preferences = preferences;
      localStorage.setItem("sidequest-demo-v1", JSON.stringify(saved));
    },
    {
      ...DEFAULT_PREFERENCES,
      premises: ["open_mic"],
      preparation: "a_few_things",
      sources: { premises: "survey", preparation: "survey" },
    },
  );
  await page.reload();
  await expect(
    page.getByText("Would perform at an open mic", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Happy to collect a few things", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No preferences confirmed yet.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
});
