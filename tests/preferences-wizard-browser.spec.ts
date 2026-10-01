import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import { preferenceProgress } from "../shared/preference-progress";

async function start(page: Page, path = "/onboarding?preferences=1") {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto(path);
}
async function savedProfile(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("sidequest-demo-v1")!).me.profile,
  );
}
async function skip(page: Page, count: number) {
  for (let index = 0; index < count; index++) {
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
    // Advancing is a durable save, so wait for the next step before tapping again.
    await expect(
      page.getByRole("button", { name: "Skip this question", exact: true }),
    ).toBeEnabled();
  }
}

test("account preferences are in reach and leave the nickname and account choice intact", async ({
  page,
}) => {
  await start(page, "/account");
  const entry = page.getByRole("link", {
    name: "Set your preferences",
    exact: true,
  });
  const box = await entry.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(844);
  await entry.click();
  await expect(page).toHaveURL(
    /\/onboarding\?preferences=1&returnTo=%2Faccount$/,
  );
  await expect(
    page.getByRole("heading", { name: "What are you here for?", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make Sidequest yours." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Finish preferences", exact: true }),
  ).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
  expect((await savedProfile(page)).accountType).toBeNull();
  await page
    .getByRole("link", { name: "Finish preferences", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Which would you actually attempt?",
      exact: true,
    }),
  ).toBeVisible();
});

test("the guided form saves on advance, auto advances single answers, and resets unknown accurately", async ({
  page,
}) => {
  await start(page);
  await expect(
    page.getByRole("progressbar", { name: "1 of 11 questions" }),
  ).toHaveAttribute("aria-valuemax", "11");
  await skip(page, 4);
  await expect(
    page.getByRole("heading", { name: "What's your role?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Camera person", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "How do you feel about approaching new people?",
      exact: true,
    }),
  ).toBeVisible();
  expect((await savedProfile(page)).preferences.role).toBe("camera_person");
  await page.reload();
  await expect(page.getByText("6 of 11", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Camera person", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Reset answer to unknown", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip this question", exact: true })
    .click();
  await expect(page.getByText("6 of 11", { exact: true })).toBeVisible();
  await page.reload();
  expect((await savedProfile(page)).preferences.role).toBeNull();
  expect((await savedProfile(page)).preferences.categories).toBeNull();
  await expect(
    page.getByText("Happy to rotate roles", { exact: true }),
  ).toHaveCount(0);
});

test("interests and skills are separate pages and firm boundaries survive save and refresh", async ({
  page,
}) => {
  await start(
    page,
    "/onboarding?preferences=1&returnTo=%2Fprofile%3Ftab%3Dprivate",
  );
  await skip(page, 7);
  await expect(
    page.getByRole("heading", {
      name: "What would you like to explore?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Which skills would you enjoy using?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Music", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await skip(page, 2);
  await expect(
    page.getByRole("heading", {
      name: "What should we leave out?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Alcohol", exact: true }).click();
  await page.getByRole("button", { name: "Strangers", exact: true }).click();
  await page.getByRole("button", { name: "Save & leave", exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?tab=private$/);
  await page.reload();
  const preferences = (await savedProfile(page)).preferences;
  expect(preferences.interests).toEqual(["music"]);
  expect(preferences.skills).toBeNull();
  expect(preferences.exclusions).toEqual(["alcohol", "strangers"]);
  expect(preferences.sources).toMatchObject({
    interests: "survey",
    exclusions: "survey",
  });
});

test("failed saves keep the question editable and report a recoverable error", async ({
  page,
}) => {
  await start(page, "/account");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await page
    .getByRole("link", { name: "Set your preferences", exact: true })
    .click();
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sidequest-demo-v1")
        throw new Error("Cannot save right now.");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot save right now");
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Date Night", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
});

test("all eleven focused pages keep navigation in view on an iPhone sized screen", async ({
  page,
}, testInfo) => {
  await start(page);
  for (let index = 0; index < 11; index++) {
    await expect(
      page.getByText(`${index + 1} of 11`, { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const button = await page
          .getByRole("button", { name: "Continue", exact: true })
          .boundingBox();
        return button!.y + button!.height;
      })
      .toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if ([0, 7, 8, 10].includes(index))
      await page.screenshot({
        path: testInfo.outputPath(`preference-page-${index + 1}.png`),
      });
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  expect((await savedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
});

test("large text and reduced motion remain usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".preference-question-panel")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
});

test("explicit neutral answers can complete preferences without inventing interests or boundaries", async ({
  page,
}) => {
  await start(page);
  for (let index = 0; index < 11; index++) {
    await expect(
      page.getByText(`${index + 1} of 11`, { exact: true }),
    ).toBeVisible();
    if ([0, 1, 2, 7, 8].includes(index)) {
      await page
        .getByRole("button", {
          name: "No preference for this question",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    } else if (index === 10) {
      await page
        .getByRole("button", { name: "No listed boundaries", exact: true })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
    } else {
      await page.locator(".survey-options .survey-option").first().click();
    }
  }
  await page.locator("summary").filter({ hasText: "Edit any answer" }).click();
  await expect(
    page
      .locator(".profile-answer-review")
      .getByText("Not answered · still unknown", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  const preferences = (await savedProfile(page)).preferences;
  expect(preferenceProgress(preferences).complete).toBe(true);
  expect(preferences.interests).toEqual([]);
  expect(preferences.skills).toEqual([]);
  expect(preferences.exclusions).toEqual([]);
  await expect(
    page.getByRole("complementary", { name: "Quest preferences reminder" }),
  ).toHaveCount(0);
});

for (const [width, height] of [
  [390, 844],
  [402, 874],
]) {
  test(`native safe areas keep all preference actions reachable at ${width} × ${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 59, bottom: 34, left: 0, right: 0 },
    });
    await start(page);
    await page.evaluate(() =>
      document.documentElement.classList.add("native-app"),
    );
    // Exercise actual env() safe-area values, without replacing production rules.
    expect(
      await page
        .locator("body")
        .evaluate((element) => getComputedStyle(element, "::before").height),
    ).toBe("59px");
    const actionsInReach = async () => {
      for (const name of ["Continue", "Skip this question"]) {
        await expect
          .poll(async () => {
            const button = await page
              .getByRole("button", { name, exact: true })
              .boundingBox();
            return button!.y + button!.height;
          })
          .toBeLessThanOrEqual(height - 34);
      }
    };
    for (let index = 0; index < 11; index++) {
      await expect(
        page.getByText(`${index + 1} of 11`, { exact: true }),
      ).toBeVisible();
      await actionsInReach();
      if ([0, 1, 2, 7, 8].includes(index)) {
        await page
          .getByRole("button", {
            name: "No preference for this question",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Reset answer to unknown",
            exact: true,
          }),
        ).toBeVisible();
        await actionsInReach();
      }
      await page
        .getByRole("button", { name: "Skip this question", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Looks right", exact: true })
      .click();
    await expect(page).toHaveURL(/\/profile$/);
  });
}

test("skipping after an accidental tap keeps the saved answer and writes nothing", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Daytime", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Daytime", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Skip this question", exact: true })
    .click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Daytime", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Date Night", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Skip this question", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Skip this question", exact: true })
    .click();
  await expect(page.getByText("3 of 11", { exact: true })).toBeVisible();
  await page.reload();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
  expect((await savedProfile(page)).preferences.premises).toBeNull();
});
