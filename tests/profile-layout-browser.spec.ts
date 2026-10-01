import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

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

async function expectContainedPill(link: Locator) {
  await expect(link).toBeVisible();
  expect(
    await link.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        bounds.height >= 44 &&
        bounds.left >= 0 &&
        bounds.right <= innerWidth &&
        parseFloat(style.borderRadius) >= bounds.height / 2 &&
        [...element.children].every((child) => {
          const rect = child.getBoundingClientRect();
          return (
            rect.left >= bounds.left &&
            rect.right <= bounds.right &&
            rect.top >= bounds.top &&
            rect.bottom <= bounds.bottom
          );
        })
      );
    }),
  ).toBe(true);
}

for (const width of [320, 390, 430]) {
  for (const enlarged of [false, true]) {
    test(`profile actions align at ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await start(page);
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
      const links = page.locator(".social-private-links .button");
      const privateLinks = [
        page.getByRole("link", { name: "Private journal", exact: true }),
        page.getByRole("link", {
          name: "Account & quest preferences",
          exact: true,
        }),
        page.getByRole("link", { name: "Start an original", exact: true }),
      ];
      for (const link of privateLinks) await expectContainedPill(link);
      const rows = await links.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          const label = element.querySelector("span")!.getBoundingClientRect();
          const icon = element.querySelector("svg")!.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            labelLeft: label.left,
            iconLeft: icon.left,
          };
        }),
      );
      expect(rows[0]).toEqual(rows[1]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("private-actions.png"),
        fullPage: true,
      });
    });
  }
}

test("profile pill actions open their intended pages", async ({ page }) => {
  await start(page);
  for (const [name, path, heading] of [
    ["Private journal", "/journal", "Stories worth keeping."],
    ["Account & quest preferences", "/account", "Account & quest preferences"],
    ["Start an original", "/originals/new", "A quest only you would invent."],
  ]) {
    await page.goto("/profile?tab=private");
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
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
