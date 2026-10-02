import { expect, test } from "@playwright/test";
import { DEFAULT_OUTING } from "../shared/domain";
import { findDefaultQuests } from "./quest-wizard-helpers";

for (const empty of [false, true]) {
  for (const enlarged of [false, true]) {
    test(`native ${empty ? "empty" : "matching"} results keep Edit plans close to the header${enlarged ? " with 200% text" : ""}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 393, height: 852 });
      const client = await page.context().newCDPSession(page);
      await client.send("Emulation.setSafeAreaInsetsOverride", {
        insets: { top: 59, bottom: 34, left: 0, right: 0 },
      });
      const outing = empty
        ? { ...DEFAULT_OUTING, intensity: "full_send", setting: "outside" }
        : DEFAULT_OUTING;
      await page.addInitScript((plan) => {
        sessionStorage.setItem("sq-demo-started", "1");
        sessionStorage.setItem("sq-outing", JSON.stringify(plan));
      }, outing);
      await page.goto("/create");
      await page.evaluate(() =>
        document.documentElement.classList.add("native-app"),
      );
      if (enlarged)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      await findDefaultQuests(page);
      const heading = page.getByRole("heading", {
        name: empty
          ? "Let’s find a different route."
          : "This could be a good story.",
        exact: true,
      });
      await expect(heading).toBeFocused();
      const edit = page.getByRole("button", {
        name: "Edit plans",
        exact: true,
      });
      await expect(edit).toBeVisible();
      const layout = await edit.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const header = document
          .querySelector(".brandbar")!
          .getBoundingClientRect();
        return {
          gap: rect.top - header.bottom,
          top: rect.top,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          radius: parseFloat(style.borderRadius),
          background: style.backgroundColor,
          border: parseFloat(style.borderTopWidth),
          scrollWidth: document.documentElement.scrollWidth,
          width: innerWidth,
          safeTop: getComputedStyle(document.body, "::before").height,
        };
      });
      expect(layout.safeTop).toBe("59px");
      expect(layout.gap).toBeGreaterThanOrEqual(8);
      expect(layout.gap).toBeLessThanOrEqual(20);
      expect(layout.top).toBeGreaterThan(59);
      expect(layout.height).toBeGreaterThanOrEqual(44);
      expect(layout.radius).toBeGreaterThanOrEqual(layout.height / 2);
      expect(layout.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(layout.border).toBeGreaterThanOrEqual(1);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(layout.width);
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
      await page.screenshot({
        path: testInfo.outputPath("native-results.png"),
      });

      // Results announce their heading; the previous keyboard action edits the
      // same plan, with a visible focus ring and the normal review focus.
      await page.keyboard.press("Shift+Tab");
      await expect(edit).toBeFocused();
      expect(
        await edit.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).not.toBe("none");
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", {
          name: "Ready to find your quest?",
          exact: true,
        }),
      ).toBeFocused();
      expect(
        await page.evaluate(() =>
          JSON.parse(sessionStorage.getItem("sq-outing")!),
        ),
      ).toMatchObject(outing);
      await page
        .getByRole("button", { name: "Edit budget", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "What’s your budget?", exact: true }),
      ).toBeFocused();
      await client.detach();
    });
  }
}
