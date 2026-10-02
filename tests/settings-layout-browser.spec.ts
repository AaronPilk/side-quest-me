import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PREFERENCES } from "../shared/domain";

async function start(page: Page) {
  await page.addInitScript((preferences) => {
    sessionStorage.setItem("sq-demo-started", "1");
    if (!localStorage.getItem("sidequest-demo-v1"))
      localStorage.setItem(
        "sidequest-demo-v1",
        JSON.stringify({
          me: {
            profile: {
              accountType: "personal",
              displayName: "Settings tester",
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
  await page.goto("/settings");
}

for (const width of [320, 390, 430]) {
  for (const enlarged of [false, true]) {
    test(`grouped settings fit ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await start(page);
      await page.evaluate(() =>
        document.documentElement.classList.add("native-app"),
      );
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      await expect(
        page.getByRole("heading", { name: "Settings", exact: true }),
      ).toBeVisible();
      const settings = page.getByRole("navigation", {
        name: "Settings",
        exact: true,
      });
      await expect(settings.getByRole("link")).toHaveCount(8);
      const layout = await settings
        .locator(".settings-row")
        .evaluateAll((rows) =>
          rows.map((row) => {
            const bounds = row.getBoundingClientRect();
            const icon = row
              .querySelector(".settings-row-icon")!
              .getBoundingClientRect();
            const copy = row
              .querySelector(".settings-row-copy")!
              .getBoundingClientRect();
            return {
              width: bounds.width,
              height: bounds.height,
              left: bounds.left,
              right: bounds.right,
              iconInset: icon.left - bounds.left,
              copyLeft: copy.left,
              contained: [...row.children].every((child) => {
                const rect = child.getBoundingClientRect();
                return (
                  rect.left >= bounds.left &&
                  rect.right <= bounds.right &&
                  rect.top >= bounds.top &&
                  rect.bottom <= bounds.bottom
                );
              }),
            };
          }),
        );
      for (const row of layout) {
        expect(row.height).toBeGreaterThanOrEqual(44);
        expect(row.left).toBeGreaterThanOrEqual(0);
        expect(row.right).toBeLessThanOrEqual(width);
        expect(row.iconInset).toBeGreaterThanOrEqual(14);
        expect(row.contained).toBe(true);
        expect(row.copyLeft).toBe(layout[0].copyLeft);
        if (!enlarged) expect(row.height).toBeLessThan(140);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const back = page.locator(".settings-page > .back");
      await expect(back).toHaveAttribute("href", "/profile");
      expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await settings.getByRole("link", { name: /^Account settings/ }).focus();
      await expect(
        settings.getByRole("link", { name: /^Account settings/ }),
      ).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath("settings.png"),
        fullPage: true,
      });
    });
  }
}

test("settings preserves account, preference, journal and demo destinations", async ({
  page,
}) => {
  await start(page);
  for (const [name, path] of [
    ["Account settings", "/account/security"],
    ["Account & quest preferences", "/account"],
    ["Private journal", "/journal"],
    ["Demo tools", "/settings/demo-tools"],
    ["Help & support", "/support"],
    ["Privacy policy", "/privacy"],
    ["Terms of use", "/terms"],
    ["Community guidelines", "/community-guidelines"],
  ]) {
    const settings = page.getByRole("navigation", {
      name: "Settings",
      exact: true,
    });
    await settings.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await page.goto("/settings");
  }
  await page.locator(".settings-page > .back").click();
  await expect(page).toHaveURL(/\/profile$/);
});

test("workspaces follow business and operator access while demo tools remain available", async ({
  page,
}) => {
  await start(page);
  for (const identity of ["creator", "brand", "operator"]) {
    await page.goto("/settings/demo-tools");
    await page
      .getByRole("combobox", { name: "Demo view", exact: true })
      .selectOption(identity);
    await expect(page).toHaveURL(/\/discover$/);
    await page.goto("/settings");
    const settings = page.getByRole("navigation", {
      name: "Settings",
      exact: true,
    });
    await expect(
      settings.getByRole("link", { name: /^Demo tools/ }),
    ).toBeVisible();
    await expect(
      settings.getByRole("link", { name: /^Business workspace/ }),
    ).toHaveCount(identity === "brand" ? 1 : 0);
    await expect(settings.getByRole("link", { name: /^Admin/ })).toHaveCount(
      identity === "operator" ? 1 : 0,
    );
    await expect(
      settings.getByRole("link", { name: /^Operator tools/ }),
    ).toHaveCount(identity === "operator" ? 1 : 0);
  }
});

test("failed account settings keep navigation and gated workspace recovery reachable", async ({
  page,
}) => {
  await page.route("**/src/lib/community-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const settingsRead = communityApi.read;
        communityApi.read = async (view, input = {}) => {
          if (view === "me" && !window.__settingsRecovered) throw new Error("Settings temporarily unavailable.");
          return settingsRead(view, input);
        };`,
    });
  });
  await start(page);
  await expect(page.getByRole("alert")).toHaveText(
    "Settings temporarily unavailable.",
  );
  const settings = page.getByRole("navigation", {
    name: "Settings",
    exact: true,
  });
  await expect(
    settings.getByRole("link", { name: /^Account settings/ }),
  ).toBeVisible();
  await expect(
    settings.getByRole("link", { name: /^Account & quest preferences/ }),
  ).toBeVisible();
  await expect(
    settings.getByRole("link", { name: /^Business workspace/ }),
  ).toHaveAttribute("href", "/business");
  await expect(settings.getByRole("link", { name: /^Admin/ })).toHaveAttribute(
    "href",
    "/admin",
  );
  await expect(
    settings.getByRole("link", { name: /^Operator tools/ }),
  ).toHaveCount(0);
  await page.evaluate(() => Reflect.set(window, "__settingsRecovered", true));
  await page
    .getByRole("button", { name: "Retry account settings", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    settings.getByRole("link", { name: /^Business workspace|^Admin/ }),
  ).toHaveCount(0);
});

test("blocked-account controls remain available and unblock persists", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const modulePath = "/src/lib/community-api.ts";
    const { communityApi } = await import(modulePath);
    await communityApi.mutate("block", {
      userId: "22222222-2222-4222-8222-222222222222",
      blocked: true,
    });
  });
  await page.reload();
  await page.locator(".settings-blocks > summary").click();
  await expect(
    page.getByRole("button", { name: "Unblock", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unblock", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Account unblocked.");
  await page.reload();
  await expect(page.locator(".settings-blocks")).toHaveCount(0);
});
