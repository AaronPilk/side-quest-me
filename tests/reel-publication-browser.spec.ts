import { test, expect } from "@playwright/test";
import { selectDemoPersona } from "./demo-persona-helper";
import { reviewPendingReel } from "./reel-publication-helper";

const postId = "55555555-5555-4555-8555-555555555555";

test("publication edits are private until an independent review, rejected feedback reaches the owner, and resubmission preserves the original", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
  await page.goto("/discover");
  await selectDemoPersona(page, "viewer");
  await page.goto(`/posts/${postId}`);
  await page
    .locator("summary")
    .filter({ hasText: /^Manage publication$/ })
    .click();
  await page
    .getByRole("textbox", { name: "Public caption", exact: true })
    .fill("A revised caption awaiting review.");
  await page
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting publication review.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Watch your private original in the journal",
    }),
  ).toHaveAttribute("href", "/journal");
  await selectDemoPersona(page, "creator");
  await page.goto(`/posts/${postId}`);
  await expect(
    page.getByText("This item is unavailable.", { exact: false }),
  ).toBeVisible();
  await page.goto("/discover");
  await expect(page.locator(".public-post")).toHaveCount(0);
  await selectDemoPersona(page, "operator");
  await page.goto("/admin");
  const review = page.locator(".reel-publication-review");
  await expect(review).toHaveCount(1);
  await review.locator("summary").click();
  await expect(review.locator("video")).toBeVisible();
  await expect(
    review.getByRole("combobox", { name: "Publication decision", exact: true }),
  ).toHaveValue("reject");
  await review
    .getByRole("textbox", { name: "Publication review notes", exact: true })
    .fill("Remove the identifying address before publishing.");
  // No unchecked attestation can submit the form.
  await review
    .getByRole("button", { name: "Record publication review", exact: true })
    .click();
  await expect(review).toHaveCount(1);
  await review.getByRole("checkbox").check();
  await review
    .getByRole("button", { name: "Record publication review", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  await selectDemoPersona(page, "viewer");
  await page.goto(`/posts/${postId}`);
  await expect(
    page.getByText("Changes are needed before this video can be published.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Remove the identifying address before publishing.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Manage publication$/ })
    .click();
  await page
    .getByRole("textbox", { name: "Public caption", exact: true })
    .fill("Our adventure, with no identifying address.");
  await page
    .getByRole("button", { name: "Save post changes", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting publication review.", { exact: false }),
  ).toBeVisible();
  await reviewPendingReel(page, "viewer");
  await expect(page.locator(".public-post video")).toHaveCount(1);
  await expect(page.locator(".post-caption")).toHaveText(
    "Our adventure, with no identifying address.",
  );
  await page
    .locator("summary")
    .filter({ hasText: /^Manage publication$/ })
    .click();
  await page
    .getByRole("button", { name: "Unpublish post", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto(`/posts/${postId}`);
  await expect(
    page.getByText("This video is private.", { exact: true }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: /^Manage publication$/ })
    .click();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting publication review.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw submission", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Withdraw submission", exact: true })
    .click();
  await expect(page).toHaveURL(/\/profile$/);
  await selectDemoPersona(page, "operator");
  await page.goto("/admin");
  await expect(page.locator(".reel-publication-review")).toHaveCount(0);
});
