import { expect, type Page } from "@playwright/test";
import type { DemoPersona } from "../src/lib/demo-identity";

/** Demo identities are explicitly contained in Settings, never a public account role selector. */
export async function selectDemoPersona(page: Page, value: DemoPersona) {
  await page.goto("/settings");
  await page
    .getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("link", { name: /Demo tools/ })
    .click();
  await expect(page).toHaveURL(/\/settings\/demo-tools$/);
  await page
    .getByRole("combobox", { name: "Demo view", exact: true })
    .selectOption(value);
  await expect(page).toHaveURL(/\/discover$/);
  expect(
    await page.evaluate(() => localStorage.getItem("sidequest-demo-persona")),
  ).toBe(value);
  await expect(
    page.getByRole("combobox", { name: "Demo view", exact: true }),
  ).toHaveCount(0);
}
