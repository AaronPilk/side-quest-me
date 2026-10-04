import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import { preferenceProgress } from "../shared/preference-progress";
import { COPY_PROFILE_PROMPT } from "../shared/profile";

async function start(page: Page, path = "/onboarding?preferences=1") {
  await page.addInitScript((preferences) => {
    sessionStorage.setItem("sq-demo-started", "1");
    if (localStorage.getItem("sidequest-demo-v1")) return;
    localStorage.setItem(
      "sidequest-demo-v1",
      JSON.stringify({
        me: {
          profile: {
            accountType: "personal",
            displayName: "Private nickname",
            timezone: "UTC",
            locale: "en",
            summary: "",
            onboardingCompleted: true,
            preferences,
          },
          wallet: { xp: 0, points: 0, version: 0 },
          roles: [],
        },
        runs: [],
      }),
    );
  }, DEFAULT_PREFERENCES);
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
    // Wait for the next question before tapping again; a skip never writes.
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
  await expect(page).toHaveURL(/\/preferences\?returnTo=%2Faccount$/);
  await expect(
    page.getByRole("heading", {
      name: "Account & quest preferences",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue setup", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: /^Personal account/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("textbox", { name: /What should we call you/ }),
  ).toHaveValue("Private nickname");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
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
  expect((await savedProfile(page)).accountType).toBe("personal");
  expect((await savedProfile(page)).displayName).toBe("Private nickname");
  await page
    .getByRole("link", { name: "Finish preferences", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue setup", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
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
  await start(page);
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
  [393, 852],
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
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
      const footer = (await page.locator(".survey-footer").boundingBox())!;
      expect(footer.y + footer.height).toBeGreaterThanOrEqual(height - 34 - 16);
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

test("an explicit summary shortcut is consumed so later refresh stays on the current question", async ({
  page,
}) => {
  await start(page, "/preferences?step=summary&returnTo=%2Faccount");
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page).toHaveURL(/\/preferences\?returnTo=%2Faccount$/);
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).preferences.categories).toEqual([
    "date_night",
  ]);
});

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

test("combined account setup exposes the prompt action and copies only the static prompt before opening ChatGPT", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) =>
          Reflect.set(window, "__copiedPrompt", text),
      },
    });
    window.open = (() => ({
      opener: window,
      closed: false,
      location: {
        replace: (url: string) =>
          Reflect.set(window, "__chatGPTDestination", url),
      },
      close: () => Reflect.set(window, "__reservedChatGPTClosed", true),
    })) as unknown as typeof window.open;
  });
  await start(page, "/preferences");
  await expect(
    page.getByRole("heading", {
      name: "Account & quest preferences",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Continue setup", exact: true })
    .click();
  const nickname = page.getByRole("textbox", {
    name: /What should we call you/,
  });
  await nickname.fill("Private name does not go to ChatGPT");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start", exact: true }),
  ).toBeVisible();
  const before = await savedProfile(page);
  const prompt = page.getByRole("button", {
    name: "Copy prompt and open ChatGPT",
    exact: true,
  });
  await expect(prompt).toBeVisible();
  expect((await prompt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await prompt.click();
  await expect(
    page.getByText("Prompt copied. Paste it into ChatGPT", { exact: false }),
  ).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "__copiedPrompt"))).toBe(
    COPY_PROFILE_PROMPT,
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "__chatGPTDestination")),
  ).toBe("https://chatgpt.com/");
  expect(await savedProfile(page)).toEqual(before);
  expect((await savedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your ChatGPT head start", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("combined-preferences-chatgpt-iphone.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
});

test("a clipboard failure offers manual prompt copying without claiming success or saving preferences", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Fixture clipboard denied");
        },
      },
    });
    window.open = (() => ({
      opener: window,
      closed: false,
      location: { replace: () => Reflect.set(window, "__chatGPTOpened", true) },
      close: () => Reflect.set(window, "__reservedChatGPTClosed", true),
    })) as unknown as typeof window.open;
  });
  await start(page, "/preferences?step=summary");
  await page
    .getByRole("button", { name: "Copy prompt and open ChatGPT", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Copy is unavailable");
  await expect(page.getByText("Prompt copied.", { exact: false })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => Reflect.get(window, "__chatGPTOpened")),
  ).toBeUndefined();
  expect(
    await page.evaluate(() => Reflect.get(window, "__reservedChatGPTClosed")),
  ).toBe(true);
  await expect(page.locator(".prompt-fallback")).toHaveText(
    COPY_PROFILE_PROMPT,
  );
  expect((await savedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
});

test("summary drafts survive refresh and Continue saves before advancing, retaining text on failure", async ({
  page,
}) => {
  await start(page, "/preferences?step=summary&returnTo=%2Faccount");
  const summary = page.getByRole("textbox", {
    name: "Paste your ChatGPT summary",
  });
  const next = page.getByRole("button", {
    name: "Continue to preferences",
    exact: true,
  });
  await expect(summary).toBeVisible();
  await expect(page.getByText("View or manually copy the prompt")).toHaveCount(
    0,
  );
  const text = "I like music, but performing in public is unknown.";
  await summary.fill(text);
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save & leave", exact: true }),
  ).toBeDisabled();
  await expect(next).toBeEnabled();
  expect((await savedProfile(page)).summary).toBe("");
  await page.reload();
  await expect(summary).toHaveValue(text);
  await page
    .getByRole("button", { name: "Discard unsaved edits", exact: true })
    .click();
  await expect(summary).toHaveValue("");
  await summary.fill(text);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sidequest-demo-v1")
        throw new Error("Storage is full. Please try again.");
      return original.call(this, key, value);
    };
  });
  await next.click();
  await expect(page.getByRole("alert")).toContainText("Storage is full");
  await expect(summary).toHaveValue(text);
  await expect(next).toBeEnabled();
  expect((await savedProfile(page)).summary).toBe("");
  await page.reload();
  await expect(summary).toHaveValue(text);
  await next.click();
  await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  expect((await savedProfile(page)).summary).toBe(text);
  expect((await savedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
});

test("preference questions omit repeated ChatGPT controls while keeping the account summary shortcut", async ({
  page,
}) => {
  await start(page, "/preferences?step=summary&returnTo=%2Faccount");
  await page
    .getByRole("textbox", { name: "Paste your ChatGPT summary" })
    .fill("I like games.");
  await page
    .getByRole("button", { name: "Continue to preferences", exact: true })
    .click();
  for (let index = 0; index < 11; index++) {
    await expect(
      page.getByText(`${index + 1} of 11`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ChatGPT summary", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Use my summary as a reference")).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("link", { name: /ChatGPT summary/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Paste your ChatGPT summary" }),
  ).toHaveValue("I like games.");
});

for (const [width, height] of [
  [393, 852],
  [390, 844],
  [402, 874],
]) {
  test(`combined intro and account fit native safe areas at ${width} × ${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 59, bottom: 34, left: 0, right: 0 },
    });
    await start(page, "/preferences");
    await page.evaluate(() =>
      document.documentElement.classList.add("native-app"),
    );
    const containedAction = async (name: string) => {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect
        .poll(async () => {
          const box = (await button.boundingBox())!;
          return box.y + box.height;
        })
        .toBeLessThanOrEqual(height - 34);
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight + 1,
        ),
      ).toBe(true);
    };
    await containedAction("Continue setup");
    await page
      .getByRole("button", { name: "Continue setup", exact: true })
      .click();
    await containedAction("Continue");
    await containedAction("Skip this step");
    await page.getByRole("radio", { name: "21+", exact: true }).check();
    await containedAction("Prefer not to say");
    await containedAction("Continue");
    await containedAction("Skip this step");
    const ageChoices = page.locator(".age-band-options label");
    for (const choice of await ageChoices.all())
      expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (width === 393)
      await page.screenshot({ path: ".local/beta-account-393.png" });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await containedAction("Copy prompt and open ChatGPT");
    await containedAction("Continue to preferences");
    if (width === 393)
      await page.screenshot({ path: ".local/beta-summary-393.png" });
    await page
      .getByRole("button", { name: "Continue to preferences", exact: true })
      .click();
    await expect(page.getByText("1 of 11", { exact: true })).toBeVisible();
  });
}
