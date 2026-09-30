import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { catalog } from "../shared/catalog";
import { DEFAULT_OUTING, DEFAULT_PREFERENCES } from "../shared/domain";
import type { Run } from "../src/lib/types";
import { findDefaultQuests } from "./quest-wizard-helpers";

const longFixture = path.resolve(".local/fixtures/sidequest-proof.mp4");
const runId = "77777777-7777-4777-8777-777777777777";
async function openQuest(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
}

test("editing preserves a later source trim, previews the selected range, restores camera cancel and saves framing/audio/label", async ({
  page,
}, testInfo) => {
  test.skip(!existsSync(longFixture), "Run npm run render:fixtures first.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openQuest(page);
  await page
    .getByRole("button", { name: "Record or upload", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Upload a clip").setInputFiles(longFixture);
  await expect
    .poll(() =>
      dialog
        .getByLabel("Clip preview")
        .evaluate((video: HTMLVideoElement) => video.duration),
    )
    .toBeGreaterThan(20);
  await dialog.getByRole("spinbutton", { name: "Start (seconds)" }).fill("10");
  await dialog.getByRole("spinbutton", { name: "End (seconds)" }).fill("18");
  await dialog
    .getByRole("button", { name: "Use clip · Upload & validate" })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Review or replace", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect
    .poll(() =>
      dialog
        .getByLabel("Clip preview")
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await expect(
    dialog.getByRole("spinbutton", { name: "End (seconds)" }),
  ).toHaveValue("18");
  await dialog
    .getByLabel("Clip preview")
    .evaluate((video: HTMLVideoElement) => {
      video.playbackRate = 4;
    });
  await dialog.getByRole("button", { name: "Preview selected 8.0s" }).click();
  await expect
    .poll(() =>
      dialog
        .getByLabel("Clip preview")
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThanOrEqual(10);
  await expect
    .poll(() =>
      dialog
        .getByLabel("Clip preview")
        .evaluate((video: HTMLVideoElement) => video.paused),
    )
    .toBe(true);
  expect(
    await dialog
      .getByLabel("Clip preview")
      .evaluate((video: HTMLVideoElement) => video.currentTime),
  ).toBeLessThan(19.5);
  await dialog.getByRole("button", { name: "Retake or replace" }).click();
  await dialog.getByRole("button", { name: "Record this moment" }).click();
  await dialog.getByRole("button", { name: "Cancel camera" }).click();
  await expect(dialog.getByLabel("Clip preview")).toBeVisible();
  await expect(
    dialog.getByRole("spinbutton", { name: "End (seconds)" }),
  ).toHaveValue("18");
  await dialog.getByRole("combobox", { name: "Framing" }).selectOption("fill");
  await dialog
    .getByRole("slider", { name: "Horizontal crop position" })
    .fill("0.75");
  await dialog.getByRole("checkbox", { name: "Mute recorded audio" }).check();
  await dialog
    .getByRole("textbox", { name: "Story label (not a transcript)" })
    .fill("The first moment of our quest");
  await dialog.getByRole("button", { name: "Use clip · Save changes" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(
    page.getByText("The first moment of our quest", { exact: true }),
  ).toBeVisible();
  await page.locator(".story-review > summary").click();
  await expect(page.locator(".story-review")).toContainText(
    "1 of 3 parts saved · 8.0s selected",
  );
  await expect(page.locator(".story-review")).toContainText(
    "This part is muted",
  );
  await expect(page.locator(".story-review")).toContainText(
    "does not analyze what’s in the video",
  );
  await page
    .getByRole("button", { name: "Review opening", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("combobox", { name: "Framing" }),
  ).toHaveValue("fill");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("slider", { name: "Horizontal crop position" }),
  ).toHaveValue("0.75");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add ending", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Pay it off, then loop");
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: testInfo.outputPath("story-review-390.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

// HTTP fixtures verify error/success UI contracts, not live accounts or public links.
type SavedLink = {
  id: string;
  caption: string;
  createdAt: string;
  expiresAt: string;
};
async function hostedFixture(page: Page, run: Run, links: SavedLink[] = []) {
  await page.route(/\/src\/lib\/auth\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export const DEMO = false; export const accessToken = async () => 'capture-ui-fixture';
    export const supabase = {auth:{ getSession:async()=>({data:{session:{access_token:'capture-ui-fixture',user:{id:'11111111-1111-4111-8111-111111111111'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};`,
    }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: {
          displayName: "Capture fixture",
          timezone: "UTC",
          locale: "en",
          summary: "",
          preferences: DEFAULT_PREFERENCES,
          onboardingCompleted: true,
        },
        wallet: { xp: 0, points: 0, version: 0 },
        roles: [],
      },
    }),
  );
  await page.route("**/api/community/me", (route) =>
    route.fulfill({
      json: {
        userId: "11111111-1111-4111-8111-111111111111",
        roles: [],
        creator: null,
        posts: [],
        publications: [],
        drafts: [],
        offers: [],
        activity: [],
        blocks: [],
      },
    }),
  );
  await page.route(`**/api/quest-runs/${run.id}`, (route) =>
    route.fulfill({ json: run }),
  );
  // Owner-only metadata listing; never raw tokens or URLs.
  await page.route(`**/api/quest-runs/${run.id}/share-links`, (route) =>
    route.fulfill({ json: links }),
  );
  if (existsSync(longFixture))
    await page.route("**/fixture/reel.mp4", (route) =>
      route.fulfill({
        contentType: "video/mp4",
        body: readFileSync(longFixture),
      }),
    );
}
function fixtureRun(status: Run["status"] = "finalized"): Run {
  return {
    id: runId,
    quest: catalog[0],
    outing: DEFAULT_OUTING,
    role: null,
    status,
    createdAt: new Date().toISOString(),
    clips: [0, 1, 2].map((slot) => ({
      id: `clip-${slot}`,
      generation: 1,
      slot,
      duration: 21,
      start: 0,
      end: 7,
      mime: "video/mp4",
      previewUrl: "/fixture/reel.mp4",
      fit: "fit",
      crop: 0.5,
      mute: false,
      caption: "Fixture",
    })),
    ...(status === "finalized"
      ? {
          render: {
            id: "reel",
            status: "ready" as const,
            url: "/fixture/reel.mp4",
          },
        }
      : {}),
  };
}

test("public link create/copy/revoke recovers from errors and media deletion is explicit", async ({
  page,
}) => {
  const run = fixtureRun();
  await hostedFixture(page, run);
  let failCreate = true,
    failRevoke = true,
    failDelete = true;
  await page.route(`**/api/quest-runs/${runId}/share`, (route) => {
    if (failCreate) {
      failCreate = false;
      return route.fulfill({
        status: 503,
        json: { error: "Link service unavailable. Try again." },
      });
    }
    return route.fulfill({
      json: { id: "test-link", url: "https://example.invalid/s/test-link" },
    });
  });
  await page.route("**/api/share-links/test-link", (route) => {
    if (failRevoke) {
      failRevoke = false;
      return route.fulfill({
        status: 503,
        json: { error: "Could not revoke. Try again." },
      });
    }
    return route.fulfill({ json: { revoked: true } });
  });
  await page.route(`**/api/quest-runs/${runId}/media`, (route) => {
    if (failDelete) {
      failDelete = false;
      return route.fulfill({
        status: 503,
        json: { error: "Could not delete media. Try again." },
      });
    }
    run.clips = [];
    run.render = undefined;
    return route.fulfill({ json: { deleted: true } });
  });
  await page.goto(`/runs/${runId}`);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Create a public link", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Link service unavailable",
  );
  await page
    .getByRole("button", { name: "Create a public link", exact: true })
    .click();
  await expect(page.getByLabel("Public reel link")).toHaveValue(
    "https://example.invalid/s/test-link",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Select and copy the link above",
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => {} },
    }),
  );
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(
    page.getByText("Public link copied.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not revoke");
  await expect(page.getByLabel("Public reel link")).toBeVisible();
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByLabel("Public reel link")).toHaveCount(0);
  await expect(page.getByText(/Public link revoked/)).toBeVisible();
  await page
    .getByRole("button", { name: "Delete story media", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not delete media");
  await expect(
    page.getByRole("button", { name: "Save video", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete story media", exact: true })
    .click();
  await expect(page.getByText(/Story media deleted/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save video", exact: true }),
  ).toHaveCount(0);
});

test("a public link created in an earlier session is listed after refresh and can be revoked, without exposing a URL", async ({
  page,
}) => {
  const run = fixtureRun();
  const links: SavedLink[] = [
    {
      id: "older-link",
      caption: "Shared with the group chat",
      createdAt: "2026-09-28T10:00:00.000Z",
      expiresAt: "2026-10-28T10:00:00.000Z",
    },
  ];
  await hostedFixture(page, run, links);
  let failRevoke = true;
  await page.route("**/api/share-links/older-link", (route) => {
    if (failRevoke) {
      failRevoke = false;
      return route.fulfill({
        status: 503,
        json: { error: "Could not revoke. Try again." },
      });
    }
    links.length = 0;
    return route.fulfill({ json: { revoked: true } });
  });
  await page.goto(`/runs/${runId}`);
  const manage = page
    .locator("summary")
    .filter({ hasText: /^Manage public links$/ });
  await expect(manage).toBeVisible();
  await manage.click();
  const saved = page.locator(".saved-share-links li");
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText("Shared with the group chat");
  // Metadata only: no URL or token is rendered for a link whose URL was lost.
  await expect(saved).not.toContainText(/https?:\/\//);
  await expect(page.getByLabel("Public reel link")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not revoke");
  await expect(saved).toHaveCount(1);
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await expect(page.getByText(/Public link revoked/)).toBeVisible();
  await expect(saved).toHaveCount(0);
  await expect(manage).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Create a public link", exact: true }),
  ).toBeVisible();
  await expect(manage).toHaveCount(0);
});

test("abandon failure stays actionable and a successful retry leaves clips in the journal", async ({
  page,
}) => {
  const run = fixtureRun("in_progress");
  await hostedFixture(page, run);
  let fail = true;
  await page.route(`**/api/quest-runs/${runId}/abandon`, (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        json: { error: "Could not abandon. Try again." },
      });
    }
    run.status = "abandoned";
    return route.fulfill({ json: run });
  });
  await page.goto(`/runs/${runId}`);
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Abandon quest", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Could not abandon");
  await page
    .getByRole("button", { name: "Abandon quest", exact: true })
    .click();
  await expect(page.getByText(/This quest was abandoned/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review or replace", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(3);
});

test("journal search, status filters, resume links and no-result reset work without hiding a fetch error", async ({
  page,
}) => {
  const active = fixtureRun("in_progress");
  await hostedFixture(page, active);
  const complete = {
    ...fixtureRun(),
    id: "88888888-8888-4888-8888-888888888888",
    quest: { ...catalog[0], title: "A completed story" },
  };
  // Fail until the test flips the flag: React StrictMode double-invokes the
  // mount effect in development, so a "fail once" counter would be consumed by
  // the discarded first fetch and never reach the UI.
  let fail = true;
  await page.route("**/api/quest-runs", (route) => {
    if (fail) {
      return route.fulfill({
        status: 503,
        json: { error: "Journal is unavailable. Try again." },
      });
    }
    return route.fulfill({ json: [active, complete] });
  });
  await page.goto("/journal");
  await expect(page.getByRole("alert")).toContainText("Journal is unavailable");
  await expect(page.getByText("Your first story starts here")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".journal-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.locator(".journal-card")).toHaveCount(1);
  await expect(page.locator(".journal-card")).toContainText(
    "A completed story",
  );
  await page
    .getByRole("searchbox", { name: "Search your stories" })
    .fill("no matching title");
  await expect(
    page.getByText("No stories here yet", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Show all stories", exact: true })
    .click();
  await expect(page.locator(".journal-card")).toHaveCount(2);
  await page.getByRole("button", { name: "In progress", exact: true }).click();
  await expect(page.locator(".journal-card")).toHaveCount(1);
  await expect(page.locator(".journal-card")).toContainText(
    "Ready to review and finish",
  );
  await page.locator(".journal-card").click();
  await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
});
