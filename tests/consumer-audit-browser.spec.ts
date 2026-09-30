import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import { catalog } from "../shared/catalog";
import { INTEREST_OPTIONS, SURVEY_QUESTIONS } from "../shared/profile";

async function start(page: Page, path: string) {
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

async function mockAccount(page: Page) {
  const profile = {
    displayName: "Audit account",
    timezone: "UTC",
    locale: "en",
    summary: "",
    onboardingCompleted: true,
    preferences: DEFAULT_PREFERENCES,
  };
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO=false;
      let active=true, attempts=0; const listeners=new Set();
      const session=()=>active?{access_token:"consumer-audit-fixture",user:{id:"11111111-1111-4111-8111-111111111111"}}:null;
      export const supabase={auth:{
        getSession:async()=>({data:{session:session()}}),
        onAuthStateChange(callback){listeners.add(callback);return {data:{subscription:{unsubscribe(){listeners.delete(callback)}}}}},
        async signOut(){attempts++;if(attempts===1)return {error:new Error("Sign out failed. Please try again.")};active=false;for(const callback of listeners)callback("SIGNED_OUT",null);return {error:null}},
        signInWithOtp:async()=>({error:null})
      }};
      export const accessToken=async()=>session()?.access_token;`,
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: { profile, wallet: { xp: 0, points: 0, version: 0 }, roles: [] },
      });
    if (path === "/api/community/me")
      return route.fulfill({
        json: {
          roles: [],
          blocks: [],
          posts: [],
          drafts: [],
          offers: [],
          activity: [],
        },
      });
    return route.fulfill({ json: [] });
  });
  return profile;
}

test("review chips edit the right answer, unknown answers are directly editable, and review edits survive refresh", async ({
  page,
}) => {
  await start(page, "/onboarding");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  for (let index = 0; index < 10; index++) {
    if (index === 4)
      await page
        .getByRole("button", { name: "Camera person", exact: true })
        .click();
    if (index === 9)
      await page.getByRole("button", { name: "Alcohol", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Prefers the camera role", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "What's your role?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mastermind", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Mastermind", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Return to review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your kind of side quest.",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "Edit any answer" }).click();
  await page
    .getByRole("button", {
      name: /How much preparation sounds fun\? Not answered/,
    })
    .click();
  await page.getByRole("button", { name: "Start now", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Likes to start now", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No alcohol", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Alcohol", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Return to review", exact: true })
    .click();
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await page.reload();
  expect((await savedProfile(page)).preferences).toMatchObject({
    role: "mastermind",
    preparation: "start_now",
    exclusions: ["alcohol"],
    skills: null,
    sharing: null,
  });
});

test("every survey question can be reviewed directly without changing unknown answers, and cancelling discards draft changes", async ({
  page,
}) => {
  await start(page, "/onboarding");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  for (let index = 0; index < 10; index++)
    await page
      .getByRole("button", { name: "Skip this question", exact: true })
      .click();
  for (const question of SURVEY_QUESTIONS) {
    await page
      .locator("summary")
      .filter({ hasText: "Edit any answer" })
      .click();
    await page
      .locator(".profile-answer-review")
      .getByRole("button", {
        name: `${question.title} Not answered · still unknown`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: question.title, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reset answer to unknown", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Return to review", exact: true })
      .click();
  }
  await expect(page.locator(".review-chips .chip")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit answers", exact: true }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect(
    await page.evaluate(() => localStorage.getItem("sidequest-demo-v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => sessionStorage.getItem("sq-profile-draft")),
  ).toBeNull();
});

test("summary prompt copy failure is recoverable and discarding draft text and preferences does not save either", async ({
  page,
}) => {
  await start(page, "/profile/import");
  await page
    .locator("summary")
    .filter({ hasText: "Get a summary from ChatGPT" })
    .click();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Select and copy the prompt below",
  );
  await expect(page.locator(".prompt-details pre")).not.toBeEmpty();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) =>
          sessionStorage.setItem("test-copied-prompt", text),
      },
    }),
  );
  await page.getByRole("button", { name: "Copy prompt", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prompt copied", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-copied-prompt")),
  ).toContain("summary");
  await page
    .getByRole("textbox", { name: "Review what you’re sharing", exact: true })
    .fill("I like games.");
  await page
    .locator("summary")
    .filter({ hasText: "Interests & useful skills" })
    .click();
  await page
    .getByRole("group", { name: "Interests to explore", exact: true })
    .getByRole("button", { name: "Games", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard unsaved edits", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Review what you’re sharing",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Save confirmed preferences",
      exact: true,
    }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("textbox", {
      name: "Review what you’re sharing",
      exact: true,
    }),
  ).toHaveValue("");
  expect(
    await page.evaluate(() => localStorage.getItem("sidequest-demo-v1")),
  ).toBeNull();
});

test("private nickname saves with immediate feedback, survives refresh, and reports save failure without losing the draft", async ({
  page,
}) => {
  await start(page, "/account");
  const name = page.getByRole("textbox", {
    name: "What should we call you?",
    exact: true,
  });
  await name.fill("Avery private");
  await name.press("Enter");
  await expect(page.locator("form").getByRole("status")).toHaveText(
    "Profile saved.",
  );
  await page.reload();
  await expect(name).toHaveValue("Avery private");
  await name.fill("Keep my draft");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "sidequest-demo-v1")
        throw new Error("Save unavailable. Please retry.");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Save unavailable",
  );
  await expect(name).toHaveValue("Keep my draft");
  await page.reload();
  await expect(name).toHaveValue("Avery private");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Reset entire local demo", exact: true })
    .click();
  await expect(name).toHaveValue("Avery private");
  await page
    .getByRole("link", { name: "Edit your public profile", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
});

for (const path of ["/account", "/profile/import", "/onboarding"]) {
  test(`${path} can retry a failed initial profile load`, async ({ page }) => {
    await mockAccount(page);
    let failed = true;
    await page.route("**/api/me", async (route) => {
      if (failed)
        return route.fulfill({
          status: 503,
          json: { error: "Profile is temporarily unavailable." },
        });
      await route.fallback();
    });
    await page.goto(path);
    await expect(page.getByRole("alert")).toContainText(
      "Profile is temporarily unavailable",
    );
    failed = false;
    await page
      .getByRole("button", { name: "Retry profile", exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
}

test("sign out failure stays on account with feedback and a successful retry clears the authenticated page", async ({
  page,
}) => {
  await mockAccount(page);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Sign out failed. Please try again.",
  );
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", {
      name: "What should we call you?",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("public quest preview includes accurate filming and preparation, shares only the quest, and opens its matching Create flow", async ({
  page,
}) => {
  const quest = catalog.find((item) => item.id === "date_pit_crew_chill_v1")!;
  await start(page, `/quests/${quest.id}`);
  await expect(page.locator(".page-title .eyebrow")).toHaveText(
    "Date Night · Chill",
  );
  for (const beat of quest.beats) {
    await expect(page.getByText(beat.action, { exact: true })).toBeVisible();
    await expect(page.getByText(beat.filming, { exact: true })).toBeVisible();
  }
  await page.locator("summary").filter({ hasText: "What you’ll need" }).click();
  for (const item of [...quest.requirements, ...quest.materials])
    await expect(page.getByText(item, { exact: true })).toBeVisible();
  await expect(page.getByText(quest.fallback, { exact: true })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) =>
          sessionStorage.setItem("test-shared-url", text),
      },
    });
  });
  await page.getByRole("button", { name: "Share quest", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Quest link copied");
  expect(
    await page.evaluate(() => sessionStorage.getItem("test-shared-url")),
  ).toBe(`http://127.0.0.1:5173/quests/${quest.id}`);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Share quest", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Copy this page’s address",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    }),
  );
  await page.getByRole("button", { name: "Share quest", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try this quest", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/create\\?template=${quest.id}$`));
  await expect(
    page.getByText(`Make your version of`, { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show other quests", exact: true })
    .click();
  await expect(page).toHaveURL(/\/create$/);
});

test("unavailable public quest has retry and a reliable Discover exit", async ({
  page,
}) => {
  await mockAccount(page);
  let failed = true;
  const quest = catalog[0];
  await page.route(`**/api/quests/${quest.id}`, (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: "Quest temporarily unavailable." },
        })
      : route.fulfill({ json: quest }),
  );
  await page.goto(`/quests/${quest.id}`);
  await expect(page.getByRole("alert")).toContainText(
    "Quest temporarily unavailable",
  );
  failed = false;
  await page.getByRole("button", { name: "Retry quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: quest.title, exact: true }),
  ).toBeVisible();
  await page
    .locator("main")
    .getByRole("link", { name: "Discover", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover$/);
});

test("all survey choice controls toggle honestly and reset leaves each answer unknown", async ({
  page,
}) => {
  await start(page, "/onboarding");
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  for (const question of SURVEY_QUESTIONS) {
    const group = page.getByRole("group", {
      name:
        question.key === "skills"
          ? "Skills I am willing to use"
          : question.title,
      exact: true,
    });
    for (const option of question.options) {
      const control = group.getByRole("button", {
        name: option.label,
        exact: true,
      });
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "false");
    }
    if (question.key === "skills") {
      const interests = page.getByRole("group", {
        name: "Interests to explore",
        exact: true,
      });
      for (const option of INTEREST_OPTIONS) {
        const control = interests.getByRole("button", {
          name: option.label,
          exact: true,
        });
        await control.click();
        await expect(control).toHaveAttribute("aria-pressed", "true");
        await control.click();
        await expect(control).toHaveAttribute("aria-pressed", "false");
      }
    }
    if (question.key === "categories") {
      await page
        .getByRole("button", { name: "Select all", exact: true })
        .click();
      await expect(group.locator('[aria-pressed="true"]')).toHaveCount(
        question.options.length,
      );
    }
    if (question.key === "exclusions") {
      await page
        .getByRole("button", { name: "No listed boundaries", exact: true })
        .click();
      const draft = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("sq-profile-draft")!),
      );
      expect(draft.profile.preferences.exclusions).toEqual([]);
    }
    await page
      .getByRole("button", { name: "Reset answer to unknown", exact: true })
      .click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.locator(".review-chips .chip")).toHaveCount(0);
  await page.getByRole("button", { name: "Looks right", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  expect((await savedProfile(page)).preferences).toEqual(DEFAULT_PREFERENCES);
});

test("corrupt survey drafts recover to the saved account instead of crashing", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("sq-demo-started", "1");
    sessionStorage.setItem(
      "sq-profile-draft",
      JSON.stringify({ profile: { displayName: 12 }, step: 4.5 }),
    );
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", {
      name: "Bring your ChatGPT context",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: SURVEY_QUESTIONS[0].title, exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("settings links and all demo identities remain reachable, and a blocked creator can be unblocked with persistence", async ({
  page,
}) => {
  await start(page, "/settings");
  for (const [name, path] of [
    ["Account settings", "/account"],
    ["Private journal", "/journal"],
    ["Business workspace", "/business"],
    ["Demo tools", "/settings/demo-tools"],
  ]) {
    await page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: new RegExp(name) })
      .click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto("/settings");
  }
  for (const identity of ["viewer", "brand", "operator", "creator"]) {
    await page.goto("/settings/demo-tools");
    await page
      .getByRole("combobox", { name: "Demo view", exact: true })
      .selectOption(identity);
    await expect(page).toHaveURL(/\/discover$/);
    await page.goto("/settings");
    await expect(
      page
        .getByRole("navigation", { name: "Settings", exact: true })
        .getByRole("link", { name: /^Admin/ }),
    ).toHaveCount(identity === "operator" ? 1 : 0);
  }
  await page.goto("/creators/22222222-2222-4222-8222-222222222222");
  await page.locator(".profile-video-tile").first().click();
  await page
    .locator("summary")
    .filter({ hasText: /^Report or block$/ })
    .click();
  await page
    .getByRole("button", { name: "Block this creator", exact: true })
    .click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.goto("/settings");
  await page
    .locator("summary")
    .filter({ hasText: "Blocked accounts · 1" })
    .click();
  await page.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Account unblocked.");
  await page.reload();
  await expect(
    page.locator("summary").filter({ hasText: "Blocked accounts" }),
  ).toHaveCount(0);
  await page.goto("/creators/22222222-2222-4222-8222-222222222222");
  await expect(page.locator(".profile-video-tile")).toHaveCount(1);
});

test("settings account-load failure can retry without hiding ordinary navigation", async ({
  page,
}) => {
  await mockAccount(page);
  let failed = true;
  await page.route("**/api/community/me", async (route) =>
    failed
      ? route.fulfill({
          status: 503,
          json: { error: "Settings temporarily unavailable." },
        })
      : route.fallback(),
  );
  await page.goto("/settings");
  await expect(page.getByRole("alert")).toHaveText(
    "Settings temporarily unavailable.",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: /Account settings/ }),
  ).toBeVisible();
  failed = false;
  await page
    .getByRole("button", { name: "Retry account settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
