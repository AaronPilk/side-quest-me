import { expect, test, type Page } from "@playwright/test";
import { findDefaultQuests } from "./quest-wizard-helpers";

// The provider is deliberately mocked at the client module boundary. These tests
// verify consent/recovery and ordinary quest behavior, not model intelligence.
async function openQuest(page: Page, configured: boolean, failFirst = false) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeEnabled();
  await page.evaluate(
    async ({ configured, failFirst }) => {
      // Mock the module used by the mounted helper, including Vite's HMR URL.
      const modulePath =
        performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              new URL(entry.name).pathname === "/src/lib/ai-quest-api.ts",
          )
          .reverse()[0]?.name ?? "/src/lib/ai-quest-api.ts";
      const { aiQuestApi } = await import(modulePath);
      const fixtureWindow = window as typeof window & {
        __aiFixture: { calls: Record<string, unknown>[] };
      };
      fixtureWindow.__aiFixture = { calls: [] };
      aiQuestApi.config = async () => ({
        configured,
        provider: configured ? "openai" : null,
        model: configured ? "mocked-model" : null,
      });
      aiQuestApi.assist = async (input: Record<string, unknown>) => {
        fixtureWindow.__aiFixture.calls.push(input);
        if (failFirst && fixtureWindow.__aiFixture.calls.length === 1)
          throw new Error(
            "Mocked provider unavailable. Your quest is unchanged.",
          );
        return {
          templateId: input.templateId,
          provider: "openai",
          model: "mocked-model",
          generatedAt: "2026-09-30T20:00:00.000Z",
          proposal: {
            title: "Mocked filming proposal",
            hook: "Show the prediction before the result.",
            filming: [0, 1, 2].map((beatIndex) => ({
              beatIndex,
              shot: "Show your own activity in this existing step.",
              onScreenText: "Mocked filming caption",
            })),
            loopTip: "Match the opening and closing frame.",
          },
        };
      };
    },
    { configured, failFirst },
  );
  // Remount the selected quest so its consent UI reads the configured fixture.
  await page.getByRole("button", { name: /Your choices/ }).click();
  await page.locator(".quest-card").first().click();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeEnabled();
}
async function calls(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __aiFixture: { calls: Record<string, unknown>[] };
        }
      ).__aiFixture.calls,
  );
}

test("AI filming requires explicit consent and keeps canonical quest steps and awards", async ({
  page,
}) => {
  await openQuest(page, true);
  const canonicalTitle = await page.locator(".quest-detail-title").innerText();
  const canonicalSteps = await page.locator(".beats-preview").innerText();
  const canonicalAward = await page.locator(".award-panel").innerText();
  await page
    .getByRole("button", { name: "Get AI filming ideas", exact: true })
    .click();
  const generate = page.getByRole("button", {
    name: "Create my filming plan",
    exact: true,
  });
  await expect(generate).toBeDisabled();
  expect(await calls(page)).toEqual([]);
  await page
    .getByRole("checkbox", {
      name: /Send this quest, my confirmed preferences/,
    })
    .check();
  await generate.click();
  await expect(
    page.getByRole("heading", { name: "Mocked filming proposal", exact: true }),
  ).toBeVisible();
  expect(await calls(page)).toHaveLength(1);
  expect((await calls(page))[0]).toMatchObject({
    provider: "openai",
    providerConsent: true,
  });
  expect((await calls(page))[0]).not.toHaveProperty("summary");
  expect(await page.locator(".quest-detail-title").innerText()).toBe(
    canonicalTitle,
  );
  expect(await page.locator(".beats-preview").innerText()).toBe(canonicalSteps);
  expect(await page.locator(".award-panel").innerText()).toBe(canonicalAward);
  await expect(
    page.getByText("AI SUGGESTION · REVIEW BEFORE USING", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeEnabled();
});

test("AI provider errors offer retry while preserving the selected quest", async ({
  page,
}) => {
  await openQuest(page, true, true);
  const canonicalTitle = await page.locator(".quest-detail-title").innerText();
  await page
    .getByRole("button", { name: "Get AI filming ideas", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: /Send this quest, my confirmed preferences/,
    })
    .check();
  await page
    .getByRole("button", { name: "Create my filming plan", exact: true })
    .click();
  await expect(
    page.getByText("Mocked provider unavailable. Your quest is unchanged.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept quest", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Retry filming ideas", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mocked filming proposal", exact: true }),
  ).toBeVisible();
  expect(await calls(page)).toHaveLength(2);
  expect(await page.locator(".quest-detail-title").innerText()).toBe(
    canonicalTitle,
  );
});

test("an unconfigured AI provider leaves ordinary quest acceptance and camera entry available", async ({
  page,
}) => {
  await openQuest(page, false);
  await expect(
    page.getByRole("button", { name: "Get AI filming ideas", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  await expect(
    page
      .getByRole("button", { name: "Record or import video", exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Get AI filming ideas", exact: true }),
  ).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});
