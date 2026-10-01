import { expect, type Locator, type Page } from "@playwright/test";

/** Walk the real authoring steps instead of treating the editor as one long form. */
export async function reachSeriesParts(
  page: Page,
  format?: "growing" | "planned",
) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Story format", exact: true }),
  ).toBeVisible();
  if (format)
    await page
      .getByRole("radio", {
        name: format === "growing" ? /Growing story/ : /Planned story/,
      })
      .check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".series-edit-part").first()).toBeVisible();
}

export async function openPartOptions(part: Locator) {
  const options = part.locator("details").filter({ hasText: "Part options" });
  if (
    !(await options.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await options.locator("summary").click();
}

export async function reviewSeries(page: Page) {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }).or(
      page.getByRole("button", {
        name: "Save as private draft",
        exact: true,
      }),
    ),
  ).toBeVisible();
}
