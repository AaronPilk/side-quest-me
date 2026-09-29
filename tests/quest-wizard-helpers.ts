import { expect, type Page } from "@playwright/test";

/** Finish the remaining outing questions using their current answers. */
export async function reviewQuestPlans(page: Page) {
  const review = page.getByRole("heading", {
    name: "Ready to find your quest?",
    exact: true,
  });
  for (let step = 0; step < 10 && !(await review.isVisible()); step++) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(review).toBeVisible();
}

export async function findDefaultQuests(page: Page) {
  await reviewQuestPlans(page);
  await page
    .getByRole("button", { name: "Find my quests", exact: true })
    .click();
}
