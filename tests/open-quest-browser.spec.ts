import { expect, test, type Page } from "@playwright/test";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING, DEFAULT_PREFERENCES } from "../shared/domain";
import type { Run } from "../src/lib/types";

const runId = "22222222-2222-4222-8222-222222222222";
const title = "The open quest you can find again";

async function seed(page: Page, status: Run["status"] = "accepted") {
  const run: Run = {
    id: runId,
    quest: { ...catalog[0], title },
    outing: DEFAULT_OUTING,
    role: null,
    status,
    clips: [],
    createdAt: "2026-10-02T10:00:00Z",
  };
  await page.addInitScript(
    ({ run, preferences }) => {
      sessionStorage.setItem("sq-demo-started", "1");
      if (!localStorage.getItem("sidequest-demo-v1"))
        localStorage.setItem(
          "sidequest-demo-v1",
          JSON.stringify({
            me: {
              profile: {
                accountType: "personal",
                displayName: "Open quest tester",
                timezone: "UTC",
                locale: "en",
                summary: "",
                onboardingCompleted: true,
                preferences,
              },
              wallet: { xp: 0, points: 0, version: 0 },
              roles: [],
            },
            runs: [run],
          }),
        );
    },
    { run, preferences: DEFAULT_PREFERENCES },
  );
}

for (const status of ["accepted", "in_progress"] as const) {
  for (const route of ["/discover", "/activity", "/create"]) {
    test(`${status} quest resumes directly from ${route} before any new questions`, async ({
      page,
    }) => {
      await seed(page, status);
      await page.goto(route);
      const card = page.getByRole("region", {
        name: "Your open quest",
        exact: true,
      });
      await expect(card).toContainText(title);
      const resume = card.getByRole("link", {
        name: "Resume quest",
        exact: true,
      });
      await expect(resume).toHaveAttribute("href", `/runs/${runId}`);
      await expect(resume).toBeInViewport();
      await resume.click();
      await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    });
  }
}

test("finished quests do not appear as open and the open journal filter survives refresh", async ({
  page,
}) => {
  await seed(page, "finalized");
  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your open quest", exact: true }),
  ).toHaveCount(0);
  await page.goto("/journal?filter=progress");
  await expect(
    page.getByRole("heading", { name: "Your open quests", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No open quests right now",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "In progress", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Show all stories", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
});

test("failed open-quest reads keep navigation and recover without inventing a quest", async ({
  page,
}) => {
  await page.route("**/src/lib/api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nconst originalRuns = api.runs; api.runs = async () => { if (!window.__openQuestRecovered) throw new Error('Fixture run read unavailable'); return originalRuns(); };`,
    });
  });
  await seed(page);
  await page.goto("/activity");
  const region = page.getByRole("region", {
    name: "Your open quests",
    exact: true,
  });
  await expect(region).toContainText("Could not check your open quest.");
  await expect(
    region.getByRole("link", { name: "My open quests", exact: true }),
  ).toHaveAttribute("href", "/journal?filter=progress");
  await expect(
    page.getByRole("link", { name: "Resume quest", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => Reflect.set(window, "__openQuestRecovered", true));
  await region
    .getByRole("button", { name: "Retry open quest", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Your open quest", exact: true }),
  ).toContainText(title);
});

for (const width of [320, 390, 430]) {
  test(`resume card fits ${width}px with enlarged text`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await page.goto("/activity");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const card = page.getByRole("region", {
      name: "Your open quest",
      exact: true,
    });
    await expect(card).toBeVisible();
    expect(
      await card.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          [...element.querySelectorAll("h2, p, a")].every((child) => {
            const box = child.getBoundingClientRect();
            return box.left >= bounds.left && box.right <= bounds.right;
          })
        );
      }),
    ).toBe(true);
    const link = card.getByRole("link", { name: "Resume quest", exact: true });
    expect(
      await link.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  });
}
