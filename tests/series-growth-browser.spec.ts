import { allowContentReview } from "./content-review-helper";
import { expect, test } from "@playwright/test";
import type { SeriesSave } from "../shared/series";
import { selectDemoPersona } from "./demo-persona-helper";
import {
  acceptQuest,
  createNextPart,
  markRunFinalized,
  savedRuns,
  turnIntoSeries,
} from "./series-growth-helpers";

test.use({ actionTimeout: 15_000 });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("sq-demo-started", "1"),
  );
});

test("a series only grows out of a quest: no authoring entry exists and the dead-end route explains that", async ({
  page,
}) => {
  await page.goto("/series");
  await expect(
    page.getByRole("link", { name: /Create a series|Start a series/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Your series", exact: true }).click();
  await expect(
    page.getByText("Your next story starts with a quest.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open your journal", exact: false }),
  ).toBeVisible();
  await page.goto("/create");
  await expect(
    page.getByRole("link", { name: "Start a series", exact: true }),
  ).toHaveCount(0);
  await page.goto("/profile?tab=series");
  await expect(
    page.getByRole("link", { name: "New series", exact: true }),
  ).toHaveCount(0);
  await page.goto("/series/new");
  await expect(
    page.getByRole("heading", {
      name: "A series starts with a quest you did.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Series title", { exact: true })).toHaveCount(0);
});

test("do a quest, turn it into a series in one tap, then create Part 2 of the same quest privately and publish each part when ready", async ({
  page,
}) => {
  const first = await acceptQuest(page);
  await expect(
    page.getByRole("link", { name: "Turn into a series", exact: true }),
  ).toBeVisible();
  await markRunFinalized(page, first);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page);
  // Prefilled from the quest, private, with Part 1 already complete.
  const questTitle = (await savedRuns(page))[0].quest.title as string;
  expect(questTitle).toBe("Three Things You Never Noticed");
  await expect(
    page.getByRole("heading", { name: questTitle, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  await expect(page.locator(".series-progress")).toContainText(
    "1 part completed.",
  );
  await expect(page.locator(".series-part")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Publish Part 1", exact: true }),
  ).toBeVisible();
  // Part 2 repeats the same quest and is accepted with the author's own outing.
  const second = await createNextPart(page, 2);
  const runs = await savedRuns(page);
  const partTwo = runs.find((run: { id: string }) => run.id === second);
  expect(partTwo.quest.id).toBe(runs[0].quest.id);
  expect(partTwo.series.position).toBe(2);
  expect(partTwo.series.id).toBe(seriesUrl.split("/series/")[1]);
  const attempt = page.getByRole("region", { name: "Your series attempt" });
  await expect(attempt).toContainText("PART 2");
  await expect(attempt).toContainText(questTitle);
  await page.goto(seriesUrl);
  await expect(
    page.getByRole("link", { name: "Continue your attempt", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".series-part")).toHaveCount(2);
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "Part 2 · Draft",
  );
  // Nobody else sees the private series or its parts.
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.getByRole("alert")).toContainText(
    "This series is not available.",
  );
  await selectDemoPersona(page, "creator");
  await markRunFinalized(page, second);
  await page.goto(seriesUrl);
  await expect(page.locator(".series-progress")).toContainText(
    "2 parts completed.",
  );
  await expect(
    page.getByRole("button", { name: "Create Part 3", exact: true }),
  ).toBeVisible();
  // Publishing Part 1 makes the growing story public with only that part.
  await allowContentReview(page);
  await page
    .getByRole("button", { name: "Publish Part 1", exact: true })
    .click();
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("1 PARTS AVAILABLE · ONGOING", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Publish Part 2", exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.locator(".series-part")).toHaveCount(1);
  await expect(
    page.locator(".series-part").getByRole("link", {
      name: "Try your own version",
    }),
  ).toBeVisible();
  await expect(page.getByText("Part 2", { exact: false })).toHaveCount(0);
  await selectDemoPersona(page, "creator");
  await page.goto(seriesUrl);
  await allowContentReview(page);
  await page
    .getByRole("button", { name: "Publish Part 2", exact: true })
    .click();
  await expect(
    page.getByText("2 PARTS AVAILABLE · ONGOING", { exact: true }),
  ).toBeVisible();
  await selectDemoPersona(page, "viewer");
  await page.goto(seriesUrl);
  await expect(page.locator(".series-part")).toHaveCount(2);
});

test("the series editor renames and reorders draft parts but never adds arbitrary quests", async ({
  page,
}) => {
  const first = await acceptQuest(page);
  await markRunFinalized(page, first);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page, "Our Friday detours");
  await createNextPart(page, 2);
  await page.goto(seriesUrl);
  await page.getByRole("link", { name: "Edit series", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit your series", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const parts = page.locator(".series-edit-part");
  await expect(parts).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Add part", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Choose a quest|Change quest/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Create Part 3", { exact: false })).toBeVisible();
  await expect(
    parts.nth(0).getByLabel("Part title", { exact: true }),
  ).toBeDisabled();
  await parts
    .nth(1)
    .getByLabel("Part title", { exact: true })
    .fill("The detour, again");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(seriesUrl);
  await expect(page.locator(".series-part").nth(1)).toContainText(
    "The detour, again",
  );
});

test("retrying Create Part 2 after its save response is lost keeps one private part and the original attempt unchanged", async ({
  page,
}) => {
  // Persist through the real demo API, then lose only the first response. This
  // exercises its idempotency receipt instead of returning a fabricated save.
  await page.route("**/src/lib/series-api.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const fixtureNextPartSave = seriesApi.save;
        window.__nextPartRequests = [];
        seriesApi.save = async (input, key) => {
          window.__nextPartRequests.push({input: structuredClone(input), key});
          const saved = await fixtureNextPartSave(input, key);
          if (window.__nextPartRequests.length === 1)
            throw new Error("Connection lost after saving. Try again.");
          return saved;
        };`,
    });
  });
  const first = await acceptQuest(page);
  await markRunFinalized(page, first);
  await page.reload();
  const seriesUrl = await turnIntoSeries(page, "A continuing detour");
  const before = await savedRuns(page);
  const create = page.getByRole("button", {
    name: "Create Part 2",
    exact: true,
  });
  await create.click();
  await expect(page.getByRole("alert")).toContainText(
    "Connection lost after saving. Try again.",
  );
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/create\?template=.*seriesPart=/, {
    timeout: 10_000,
  });
  const attempts = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __nextPartRequests: { input: SeriesSave; key: string }[];
        }
      ).__nextPartRequests,
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const newPartId = attempts[0].input.parts[1].id;
  expect(new URL(page.url()).searchParams.get("seriesPart")).toBe(newPartId);
  expect(await savedRuns(page)).toEqual(before);
  await page.goto(seriesUrl);
  await expect(page.locator(".series-part")).toHaveCount(2);
  await expect(page.getByText("PRIVATE DRAFT", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Film Part 2", exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".series-part")).toHaveCount(2);
  expect(await savedRuns(page)).toEqual(before);
});
