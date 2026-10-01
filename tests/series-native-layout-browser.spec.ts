import { expect, test, type Page } from "@playwright/test";
import { acceptQuest } from "./series-growth-helpers";

async function coverChoicesStayClear(page: Page) {
  // The covers sit below the prefilled story, so reach them the way a person
  // does: scroll to the end. They must then clear the fixed action footer.
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const footer = await page.locator(".series-editor-footer").boundingBox();
  const navigation = await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .boundingBox();
  expect(
    footer && navigation && footer.y + footer.height <= navigation.y,
  ).toBeTruthy();
  for (const name of ["Sunrise", "Forest", "Ocean", "Night"]) {
    const cover = page
      .locator(".series-cover-option")
      .filter({ has: page.getByRole("radio", { name, exact: true }) });
    const bounds = await cover.boundingBox();
    expect(
      bounds &&
        footer &&
        bounds.y >= 59 &&
        bounds.y + bounds.height <= footer.y,
    ).toBeTruthy();
    await cover.click();
    await expect(page.getByRole("radio", { name, exact: true })).toBeChecked();
  }
}

for (const [width, height] of [
  [390, 844],
  [402, 874],
]) {
  test(`native Series format covers stay above navigation and actions at ${width} × ${height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      sessionStorage.setItem("sq-demo-started", "1");
    });
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 59, bottom: 34, left: 0, right: 0 },
    });
    // The only way into series setup is from a quest the person accepted.
    const runId = await acceptQuest(page);
    await page.goto(`/series/new?run=${runId}`);
    await page.evaluate(() =>
      document.documentElement.classList.add("native-app"),
    );
    await expect(
      page.getByRole("heading", {
        name: "Turn this quest into a series",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page
        .locator("body")
        .evaluate((element) => getComputedStyle(element, "::before").height),
    ).toBe("59px");
    await page
      .getByLabel("Series title", { exact: true })
      .fill("Our Friday detours");
    await coverChoicesStayClear(page);
    await page.screenshot({
      path: testInfo.outputPath("native-format.png"),
      fullPage: true,
    });
    // Leaving and returning keeps the draft and the same clear layout.
    await page.getByRole("link", { name: "Your quest", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
    await page.goBack();
    await page.evaluate(() =>
      document.documentElement.classList.add("native-app"),
    );
    await expect(page.getByLabel("Series title", { exact: true })).toHaveValue(
      "Our Friday detours",
    );
    await coverChoicesStayClear(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await client.detach();
  });
}
