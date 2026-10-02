import { expect, type Page } from "@playwright/test";
import { selectDemoPersona } from "./demo-persona-helper";
import type { DemoPersona } from "../src/lib/demo-identity";

/** Exercise the same explicit review form an operator uses in production. */
export async function reviewPendingReel(page: Page, owner: DemoPersona) {
  const returnUrl = page.url();
  await selectDemoPersona(page, "operator");
  await page.goto("/admin");
  const review = page.locator(".reel-publication-review");
  await expect(review).toHaveCount(1);
  await review.locator("summary").click();
  await expect(review.locator("video")).toBeVisible();
  await review
    .getByRole("combobox", { name: "Publication decision", exact: true })
    .selectOption("approve");
  await review
    .getByLabel("Publication review notes", { exact: true })
    .fill("Full video, audio, caption, shared quest and permissions reviewed.");
  await review.getByRole("checkbox").check();
  await review
    .getByRole("button", { name: "Record publication review", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await selectDemoPersona(page, owner);
  await page.goto(returnUrl);
}
