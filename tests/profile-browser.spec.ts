import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES, type Preferences } from "../shared/domain";

async function startSurvey(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
}
async function storedProfile(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile,
  );
}
async function seed(
  page: Page,
  preferences: Preferences = DEFAULT_PREFERENCES,
  summary = "",
) {
  await page.addInitScript(
    ({ preferences, summary }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      if (localStorage.getItem("sidequest-demo-v1")) return;
      localStorage.setItem(
        "sidequest-demo-v1",
        JSON.stringify({
          me: {
            profile: {
              accountType: "personal",
              displayName: "Profile test",
              timezone: "UTC",
              locale: "en",
              summary,
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
    { preferences, summary },
  );
}
async function skip(page: Page, count: number) {
  for (let index = 0; index < count; index++)
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
}
async function beginPreferences(page: Page) {
  await page.getByRole("button", { name: /^(Start|Continue) setup$/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
}

test("skipping all eleven questions leaves unknown answers and never invents role rotation", async ({
  page,
}) => {
  await startSurvey(page);
  for (let step = 0; step < 11; step++) {
    await expect(
      page.getByText(`${step + 1} of 11`, { exact: true }),
    ).toBeVisible();
    await skip(page, 1);
  }
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".review-chips .chip")).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await storedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await expect(
    page.getByRole("link", {
      name: "Make it your kind of quest",
      exact: false,
    }),
  ).toBeVisible();
  await page.goto("/account");
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
});

test("an answered role auto saves and survives skipping it; explicit reset persists unknown", async ({
  page,
}) => {
  await startSurvey(page);
  await skip(page, 4);
  const rotate = page.getByRole("button", {
    name: "Rotate me around",
    exact: true,
  });
  await rotate.click();
  await expect(page.getByText("6 of 11", { exact: true })).toBeVisible();
  expect((await storedProfile(page)).preferences.role).toBe("rotate");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await skip(page, 1);
  await page.reload();
  expect((await storedProfile(page)).preferences.role).toBe("rotate");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Reset answer to unknown", exact: true })
    .click();
  await expect(rotate).toHaveAttribute("aria-pressed", "false");
  await skip(page, 7);
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await storedProfile(page)).preferences.role).toBeNull();
});

test("summary editing and immediate removal persist after refresh without changing confirmed answers", async ({
  page,
}, testInfo) => {
  await seed(
    page,
    {
      ...DEFAULT_PREFERENCES,
      role: "camera_person",
      skills: ["music"],
      exclusions: ["alcohol"],
      sources: {
        role: "survey",
        skills: "summary_review",
        exclusions: "survey",
      },
    },
    "I watch prank videos. My willingness to perform is unknown. Product-design requests are not my preferences.",
  );
  await page.goto("/profile/import");
  await expect(page).toHaveURL(
    /\/preferences\?(?:step=summary&)?returnTo=%2Faccount$/,
  );
  await expect(
    page.getByText("This is a manual review:", { exact: false }),
  ).toBeVisible();
  const summary = page.getByRole("textbox", {
    name: "Review what you’re sharing",
  });
  const text =
    "I like games, but not public performance. Maybe music. I watch pranks without wanting to do them.";
  await summary.fill(text);
  await expect(
    page.getByRole("button", { name: "Continue to preferences", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save summary", exact: true }).click();
  await expect(
    page.getByText("Summary saved.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(summary).toHaveValue(text);
  const initial = (await storedProfile(page)).preferences;
  expect(initial.interests).toBeNull();
  expect(initial.premises).toBeNull();
  // Only a deliberate answer on the guided question becomes a preference.
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await skip(page, 7);
  await page
    .locator("summary")
    .filter({ hasText: "Use my summary as a reference" })
    .click();
  await expect(page.locator(".question-summary-reference")).toContainText(text);
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which skills would you enjoy using?",
      exact: true,
    }),
  ).toBeVisible();
  const confirmed = (await storedProfile(page)).preferences;
  expect(confirmed.interests).toEqual(["games"]);
  expect(confirmed.sources.interests).toBe("survey");
  expect(confirmed.sources.skills).toBe("summary_review");
  expect(confirmed.sources.role).toBe("survey");
  expect(confirmed.premises).toBeNull();
  await page
    .getByRole("button", { name: "ChatGPT summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start", exact: true }),
  ).toBeVisible();
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
  await page
    .locator("summary")
    .filter({ hasText: "I have a summary to paste" })
    .click();
  await expect(summary).toHaveValue("");
  expect((await storedProfile(page)).preferences).toEqual(confirmed);
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page.getByText("9 of 11", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Games", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await skip(page, 1);
  expect((await storedProfile(page)).preferences).toEqual(confirmed);
  await page.screenshot({
    path: testInfo.outputPath("summary-reference-after-removal-iphone.png"),
    fullPage: true,
  });
});

test("first-run Create enters account choice, and finishing later preserves the exact quest destination", async ({
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
  await expect(
    page.getByRole("heading", { name: "Make Sidequest yours." }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Personal account/ }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish later", exact: true }).click();
  await page
    .getByRole("button", { name: "Keep personalizing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish later", exact: true }).click();
  await page
    .getByRole("button", { name: "Save and explore for now", exact: true })
    .click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  expect((await storedProfile(page)).onboardingCompleted).toBe(true);
  expect((await storedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page
    .getByRole("link", { name: "Make it your kind of quest", exact: false })
    .click();
  await expect(page).toHaveURL(/\/preferences\?returnTo=/);
  await expect(
    page.getByRole("heading", { name: "Account & quest preferences" }),
  ).toBeVisible();
});

test("guided preferences return to the selected quest after Back, saves, completion and refresh", async ({
  page,
}) => {
  await seed(page);
  const target =
    "/create?template=date_pit_crew_chill_v1&from=55555555-5555-4555-8555-555555555555";
  await page.goto(target);
  await page.getByRole("button", { name: "Friends", exact: true }).click();
  const before = await page.evaluate(() => ({
    outing: sessionStorage.getItem("sq-outing"),
    flow: sessionStorage.getItem("sq-quest-flow"),
  }));
  const enter = () =>
    page
      .getByRole("link", { name: "Make it your kind of quest", exact: false })
      .click();
  await enter();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await enter();
  await beginPreferences(page);
  await page
    .getByRole("button", {
      name: "No preference for this question",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:5173${target}`);
  await enter();
  await beginPreferences(page);
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  await page.reload();
  await skip(page, 10);
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
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
  expect((await storedProfile(page)).preferences.categories).toEqual([]);
});

test("sequential typing retains spaces in optional skills, humor and boundary details through saving and refresh", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/onboarding?preferences=1");
  await skip(page, 11);
  const phrases = [
    [
      "Another skill (optional)",
      "  live sound mixing  ",
      "live sound mixing",
      "otherSkill",
      "Which skills would you enjoy using?",
    ],
    [
      "Creators or examples (optional)",
      "  dry comedy sketches  ",
      "dry comedy sketches",
      "humorExamples",
      "What kind of funny works for you?",
    ],
    [
      "Another boundary (optional; needs review before recommendations)",
      "  no loud music  ",
      "no loud music",
      "otherExclusion",
      "What should we leave out?",
    ],
  ];
  for (const [label, raw, saved, key, title] of phrases) {
    const review = page.locator(".profile-answer-review");
    await review.locator("summary").click();
    await review
      .getByRole("button", { name: new RegExp(title.replace(/[?]/g, "\\?")) })
      .click();
    await page
      .locator("summary")
      .filter({ hasText: "Optional details" })
      .click();
    const input = page.getByRole("textbox", { name: label, exact: true });
    await input.pressSequentially(raw, { delay: 5 });
    await expect(input).toHaveValue(raw);
    await input.press("Tab");
    await expect(input).toHaveValue(saved);
    await page
      .getByRole("button", { name: "Return to review", exact: true })
      .click();
    await expect
      .poll(async () => (await storedProfile(page)).preferences[key])
      .toBe(saved);
    await page.reload();
    await review.locator("summary").click();
    await review
      .getByRole("button", { name: new RegExp(title.replace(/[?]/g, "\\?")) })
      .click();
    await expect(input).toHaveValue(saved);
    await page
      .getByRole("button", { name: "Return to review", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect((await storedProfile(page)).preferences).toMatchObject({
    otherSkill: "live sound mixing",
    humorExamples: "dry comedy sketches",
    otherExclusion: "no loud music",
  });
});

test("account hub presents only confirmed participation and preparation", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/account");
  await expect(
    page.getByRole("progressbar", { name: "Confirmed preference answers" }),
  ).toHaveAttribute("value", "0");
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("summary").filter({ hasText: "Your confirmed preferences" }),
  ).toHaveCount(0);
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
  await page
    .locator("summary")
    .filter({ hasText: "Your confirmed preferences" })
    .click();
  await expect(
    page.getByText("Would perform at an open mic", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Happy to collect a few things", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
});
