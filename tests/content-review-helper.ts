import type { Locator, Page } from "@playwright/test";

/** Every public submission scenario explicitly grants the displayed permission. */
export async function allowContentReview(surface: Page | Locator) {
  await surface
    .getByRole("checkbox", { name: /^I allow my submitted public/ })
    .check();
}
