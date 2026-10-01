import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

for (const width of [320, 390, 430]) {
  for (const enlarged of [false, true]) {
    test(`Discover navigation stays usable at ${width}px${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/discover");
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });

      const feed = page.getByRole("group", { name: "Discover feed" });
      await expect(feed.getByRole("button")).toHaveCount(3);
      const layout = await feed.evaluate((element) => {
        const row = element.getBoundingClientRect();
        const pills = [...element.querySelectorAll("button")].map((button) => {
          const bounds = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return {
            top: bounds.top,
            height: bounds.height,
            rounded: parseFloat(style.borderRadius) >= bounds.height / 2,
          };
        });
        return {
          rowContained: row.left >= 0 && row.right <= innerWidth,
          overflowX: getComputedStyle(element).overflowX,
          pills,
        };
      });
      expect(layout.rowContained).toBe(true);
      expect(["auto", "scroll"]).toContain(layout.overflowX);
      for (const pill of layout.pills) {
        expect(pill.top).toBeCloseTo(layout.pills[0].top, 1);
        expect(pill.height).toBeGreaterThanOrEqual(44);
        expect(pill.rounded).toBe(true);
      }
      const sections = page.getByRole("navigation", {
        name: "Discover sections",
      });
      await expect(
        sections.getByRole("link", { name: "Quests", exact: true }),
      ).toBeVisible();
      await expect(
        sections.getByRole("link", { name: "Series", exact: true }),
      ).toBeVisible();

      const search = page.getByRole("button", {
        name: "Search stories",
        exact: true,
      });
      const heading = await page
        .getByRole("heading", { name: "Discover", exact: true })
        .boundingBox();
      const action = await search.boundingBox();
      expect(
        heading && action && action.x >= heading.x + heading.width,
      ).toBeTruthy();
      expect(action && action.x + action.width <= width).toBeTruthy();
      await expect(
        page.getByRole("searchbox", { name: "Search public stories" }),
      ).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath("discover-navigation.png"),
        fullPage: true,
      });

      await feed
        .getByRole("button", { name: "Open to brands", exact: true })
        .click();
      await expect(page).toHaveURL(/view=brands/);
      await expect(
        feed.getByRole("button", { name: "Open to brands", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await search.click();
      await expect(
        page.getByRole("dialog", { name: "Search public stories" }),
      ).toBeVisible();
      await expect(
        page.getByRole("searchbox", { name: "Search public stories" }),
      ).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("search-dialog.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Close search" }).click();
      await sections.getByRole("link", { name: "Series", exact: true }).click();
      await expect(page).toHaveURL(/\/series$/);
    });
  }
}

test("header search opens on demand, applies via Enter, and cancelling preserves the applied query", async ({
  page,
}) => {
  await page.goto("/discover");
  const open = page.getByRole("button", {
    name: "Search stories",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Search public stories" });
  const input = page.getByRole("searchbox", { name: "Search public stories" });
  await expect(input).toBeHidden();
  await open.click();
  await expect(input).toBeFocused();
  await input.fill("another");
  await input.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/discover\?q=another$/);
  await expect(page.locator(".public-post")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit search" })).toContainText(
    "another",
  );

  await page.getByRole("button", { name: "Edit search" }).click();
  await expect(input).toHaveValue("another");
  await input.fill("no story could match this phrase");
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page).toHaveURL(/q=another$/);
  await expect(page.locator(".public-post")).toHaveCount(1);
  await open.click();
  await expect(input).toHaveValue("another");
  await input.fill("another discarded draft");
  // A populated native search input consumes Escape to clear its text first.
  // Focus the submit control to exercise the dialog's dismissal behavior.
  await page.getByRole("button", { name: "Show search results" }).focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await expect(page).toHaveURL(/q=another$/);

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("button", { name: "Edit search" })).toHaveCount(
    0,
  );
  await open.click();
  await expect(input).toHaveValue("");
});

test("search remains usable without native dialog support and cancels an unapplied draft", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/discover");
  const input = page.getByRole("searchbox", { name: "Search public stories" });
  const feed = page.getByRole("group", { name: "Discover feed" });
  const open = page.getByRole("button", {
    name: "Search stories",
    exact: true,
  });
  await open.click();
  await expect(
    page.getByRole("heading", { name: "Search", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("search")).toBeVisible();
  await expect(feed).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Search public stories" }),
  ).toHaveCount(0);
  await input.fill("another");
  await page.getByRole("button", { name: "Show search results" }).click();
  await expect(page).toHaveURL(/\/discover\?q=another$/);
  await expect(feed).toBeVisible();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit search" })).toContainText(
    "another",
  );

  await open.click();
  await expect(input).toHaveValue("another");
  await input.fill("no story could match this phrase");
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page).toHaveURL(/q=another$/);
  await expect(feed).toBeVisible();
  await expect(page.locator(".public-post")).toHaveCount(1);
  await page.getByRole("button", { name: "Edit search" }).click();
  await expect(input).toHaveValue("another");
});
