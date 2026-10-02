import { allowContentReview } from "./content-review-helper";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_OUTING, DEFAULT_PREFERENCES } from "../shared/domain";
import { catalog } from "../shared/catalog";

async function start(page: Page, route = "/profile?tab=series") {
  await page.addInitScript((preferences) => {
    sessionStorage.setItem("sq-demo-started", "1");
    if (!localStorage.getItem("sidequest-demo-v1"))
      localStorage.setItem(
        "sidequest-demo-v1",
        JSON.stringify({
          me: {
            profile: {
              accountType: "personal",
              displayName: "",
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
  await page.goto(route);
}

async function expectEditorInViewport(page: Page) {
  const dialog = page.getByRole("dialog", {
    name: "Edit profile",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  if (
    !(await dialog
      .getByRole("checkbox", { name: /^I allow my submitted public/ })
      .isChecked())
  ) {
    const activeField = dialog.locator(
      "input:focus, textarea:focus, select:focus",
    );
    const name = (await activeField.count())
      ? await activeField.getAttribute("name")
      : null;
    await allowContentReview(dialog);
    if (name) await dialog.locator(`[name="${name}"]`).focus();
  }
  await expect(
    dialog.getByRole("button", { name: "Save public profile", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  const layout = await dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const actions = element
      .querySelector(".profile-editor-actions")!
      .getBoundingClientRect();
    const body = element.querySelector(".profile-editor-body")!;
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      width: innerWidth,
      height: visualViewport?.height || innerHeight,
      actionsBottom: actions.bottom,
      bodyFits: body.scrollWidth <= body.clientWidth + 1,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height);
  expect(layout.actionsBottom).toBeLessThanOrEqual(layout.height);
  expect(layout.bodyFits).toBe(true);
  return dialog;
}

for (const width of [320, 393, 430]) {
  for (const enlarged of [false, true]) {
    test(`private journal and visible editor fit at ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 852 });
      const client = await page.context().newCDPSession(page);
      await client.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      });
      await start(page);
      await page.evaluate(() =>
        document.documentElement.classList.add("native-app"),
      );
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      // A series is never authored from the profile: it grows out of a quest
      // in the journal, and the section says so instead of offering a button.
      await expect(
        page.getByRole("heading", { name: "Your series", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "New series", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByText("A series starts from a quest you did", {
          exact: false,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("series-actions.png"),
        fullPage: true,
      });

      await page.getByRole("button", { name: "Private", exact: true }).click();
      const journal = page.getByRole("region", { name: "Your private space" });
      await expect(
        journal.getByRole("heading", { name: "Your journal", exact: true }),
      ).toBeVisible();
      await expect(
        journal.getByText(
          "Your completed stories and quests in progress will appear here.",
        ),
      ).toBeVisible();
      await expect(journal.getByRole("link")).toHaveCount(0);
      await expect(
        page.getByText("Drafts & submissions", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", {
          name: /Account & quest preferences|Start an original|Draft an original/,
        }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("region", { name: "Your quest milestones" }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("private-actions.png"),
        fullPage: true,
      });
      const edit = page.getByRole("button", {
        name: "Edit profile",
        exact: true,
      });
      await edit.click();
      const dialog = await expectEditorInViewport(page);
      await expect(
        dialog.getByRole("textbox", {
          name: "Public display name",
          exact: true,
        }),
      ).toBeFocused();
      await expect(
        dialog.getByRole("button", { name: "Cancel", exact: true }),
      ).toBeInViewport();
      await expect(
        dialog.getByRole("button", {
          name: "Save public profile",
          exact: true,
        }),
      ).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath("profile-editor.png"),
      });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(edit).toBeFocused();
    });
  }
}

test("preferences remain accessible outside Private and original authoring is absent from the profile", async ({
  page,
}) => {
  await start(page, "/profile");
  const preferences = page.getByRole("link", {
    name: /Account & quest preferences/,
  });
  await expect(preferences).toHaveCount(1);
  await preferences.click();
  await expect(page).toHaveURL(/\/preferences\?returnTo=%2Fprofile$/);
  await expect(
    page.getByRole("heading", {
      name: "Account & quest preferences",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/profile?tab=quests");
  await expect(
    page.getByRole("region", { name: "Authored quests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Draft an original|Start an original/ }),
  ).toHaveCount(0);
  await expect(preferences).toHaveCount(1);
});

test("Private shows saved journal entries and opens their existing quest records", async ({
  page,
}) => {
  await start(page, "/profile");
  const runId = "a629d95e-2fc3-452c-81ca-631fda635911";
  await page.evaluate(
    ({ id, quest, outing }) => {
      const saved = JSON.parse(localStorage.getItem("sidequest-demo-v1")!);
      saved.runs = [
        {
          id,
          quest,
          outing,
          role: null,
          status: "accepted",
          clips: [],
          createdAt: new Date().toISOString(),
        },
      ];
      localStorage.setItem("sidequest-demo-v1", JSON.stringify(saved));
    },
    {
      id: runId,
      quest: catalog.find((quest) => quest.id === "date_pit_crew_chill_v1")!,
      outing: DEFAULT_OUTING,
    },
  );
  await page.goto("/profile?tab=private");
  const journal = page.getByRole("region", { name: "Your private space" });
  const entries = journal.getByRole("link");
  await expect(entries).toHaveCount(1);
  await expect(entries).toHaveAttribute("href", `/runs/${runId}`);
  await expect(journal).not.toContainText("Drafts & submissions");
  await expect(journal).not.toContainText("preferences");
  await entries.click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
});

test("profile editor remains modal and returns focus without native dialog support", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.route("**/src/lib/social-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
      const originalHeldProfileSave = socialApi.save;
      socialApi.save = async (input, consent) => {
        await new Promise(resolve => { window.__finishProfileSave = resolve; });
        return originalHeldProfileSave(input, consent);
      };`,
    });
  });
  await start(page, "/profile");
  const edit = page.getByRole("button", { name: "Edit profile", exact: true });
  await edit.click();
  const dialog = await expectEditorInViewport(page);
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  await expect(
    dialog.getByRole("textbox", { name: "Public display name", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Save public profile", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(edit).toBeFocused();
  await edit.click();
  await allowContentReview(dialog);
  await dialog
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("pending_profile");
  const save = dialog.getByRole("button", {
    name: "Save public profile",
    exact: true,
  });
  await save.click();
  await expect(save).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog).toBeFocused();
  await page.evaluate(() =>
    (Reflect.get(window, "__finishProfileSave") as () => void)(),
  );
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("Public profile saved.", { exact: true }),
  ).toBeVisible();
});

test("visible profile editor saves, reloads, discards cancellation and stays usable above a phone keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await start(page, "/profile");
  const edit = page.getByRole("button", { name: "Edit profile", exact: true });
  await edit.click();
  const dialog = await expectEditorInViewport(page);
  const displayName = dialog.getByRole("textbox", {
    name: "Public display name",
    exact: true,
  });
  await expect(displayName).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Save public profile", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(displayName).toBeFocused();
  await displayName.fill("Riley’s Detours");
  await dialog
    .getByRole("textbox", { name: "Username", exact: true })
    .fill("riley_detours");
  const bio = dialog.getByRole("textbox", {
    name: "Short public bio",
    exact: true,
  });
  await page.setViewportSize({ width: 393, height: 460 });
  await bio.fill("Little quests, good stories.");
  await expect(bio).toBeFocused();
  await expectEditorInViewport(page);
  await expect(bio).toBeInViewport({ ratio: 1 });
  await allowContentReview(page);
  await dialog
    .getByRole("button", { name: "Save public profile", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Riley’s Detours", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 393, height: 852 });
  await page.reload();
  await expect(page.getByText("@riley_detours", { exact: true })).toBeVisible();
  await edit.click();
  await expect(bio).toHaveValue("Little quests, good stories.");
  await displayName.fill("Unsaved name");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(displayName).toHaveValue("Riley’s Detours");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("own-profile Settings stays reachable through loading, failure, and recovery", async ({
  page,
}) => {
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const originalProfileRead = communityApi.read;
        communityApi.read = async (view, input = {}) => {
          if (view === "me") {
            window.__profileReadGate ||= new Promise(resolve => { window.__releaseProfileRead = resolve; });
            await window.__profileReadGate;
            if (!window.__profileReadRecovered) throw new Error("Fixture profile read failed");
          }
          return originalProfileRead(view, input);
        };`,
    });
  });
  await start(page, "/profile");
  const settings = page.getByRole("link", {
    name: "Profile settings",
    exact: true,
  });
  await expect(settings).toBeVisible();
  await expect(settings).toHaveAttribute("href", "/settings");
  await page.evaluate(() =>
    (Reflect.get(window, "__releaseProfileRead") as () => void)(),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Fixture profile read failed",
  );
  await expect(settings).toHaveCount(1);
  await expect(settings).toBeVisible();
  await settings.click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Reflect.set(window, "__profileReadRecovered", true),
  );
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Edit profile", exact: true }),
  ).toBeVisible();
  await expect(settings).toHaveCount(1);
});
