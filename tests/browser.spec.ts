import { test, expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DEFAULT_PREFERENCES } from "../shared/domain";
import { catalog } from "../shared/catalog";
import { findDefaultQuests } from "./quest-wizard-helpers";

const fixtures = [
  "portrait-silent.mp4",
  "landscape-with-audio.mp4",
  "square-with-audio.mp4",
].map((name) => path.resolve(".local/fixtures", name));
async function explore(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await expect(
    page.getByRole("heading", { name: "What’s the plan?" }),
  ).toBeVisible();
}
async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
async function visitYourSpace(page: Page, name: string) {
  if (name === "Rewards") {
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Rewards", exact: true })
      .click();
    await page.getByRole("tab", { name: "Perks", exact: true }).click();
    return;
  }
  if (name === "Account settings") {
    await visitYourSpace(page, "Settings");
    await page
      .getByRole("navigation", { name: "Settings", exact: true })
      .getByRole("link", { name: /Account settings/ })
      .click();
    return;
  }
  const desktopLink = page
    .locator(".desktop-space")
    .getByRole("link", { name, exact: true });
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
    return;
  }
  const menu = page.locator(".space-menu");
  const link = menu.getByRole("link", { name, exact: true });
  if (!(await link.isVisible()))
    await menu.locator('summary[aria-label="Your space"]').click();
  await expect(link).toBeVisible();
  await link.click();
  await expect(menu).not.toHaveAttribute("open");
}

test("ten-question onboarding works without import, preserves answers and exposes five tabs", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Find my first quest" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Date Night", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Which would you actually attempt?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Date Night", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  for (let step = 0; step < 10; step++) {
    await expect(
      page.getByText(`${step + 1} of 10`, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Your kind of side quest." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link"),
  ).toHaveCount(5);
  await findDefaultQuests(page);
  await expect(page.locator(".quest-card")).toHaveCount(3);
  await expect(page.locator(".quest-card").first()).toContainText(
    "No purchase needed",
  );
  await assertNoOverflow(page);
  expect(errors).toEqual([]);
});

test("responsive screens, keyboard focus and demo offers stay truthful", async ({
  page,
}, testInfo) => {
  await explore(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await assertNoOverflow(page);
    await expect(
      page.getByRole("button", { name: "Continue", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`quest-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await assertNoOverflow(page);
  await expect(
    page.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("quest-large-text-320.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await visitYourSpace(page, "Rewards");
  await expect(page.getByText("SIMULATED AVAILABLE POINTS")).toBeVisible();
  await page.locator(".reward-card").first().click();
  await expect(
    page.getByText("This is an example only.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Redeem.*points/ }),
  ).toHaveCount(0);
  await assertNoOverflow(page);
  await visitYourSpace(page, "Account settings");
  await page
    .getByRole("textbox", { name: "What should we call you?" })
    .fill("A very long display name that must wrap without hiding actions");
  await page.getByRole("button", { name: "Save name" }).click();
  await assertNoOverflow(page);
  await page.goto("/operator");
  await expect(
    page.getByRole("heading", { name: "Operator access required" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement !== document.body),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("operator-denied-320.png"),
    fullPage: true,
  });
});

test("three real uploads complete once, render a portrait MP4, download, and stay in the journal", async ({
  page,
}, testInfo) => {
  test.skip(
    fixtures.some((file) => !existsSync(file)),
    "Run node scripts/render-fixtures.mjs first to create synthetic videos.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Deliberately exercise denied-camera fallback; this is not a physical camera test.
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: () =>
        Promise.reject(
          new DOMException("Denied for fixture test", "NotAllowedError"),
        ),
    });
  });
  await explore(page);
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await expect(page).toHaveURL(/\/runs\/[a-f0-9-]+$/);
  const acceptedUrl = page.url();
  await page.reload();
  await expect(page.getByText("Make it happen", { exact: true })).toBeVisible();
  expect(page.url()).toBe(acceptedUrl);
  for (let slot = 0; slot < 3; slot++) {
    await page
      .getByRole("button", { name: "Record or upload", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Exit capture" }),
    ).toBeFocused();
    if (slot === 0) {
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.locator("input[capture]")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "Exit capture" }),
      ).toBeFocused();
      await dialog.getByRole("button", { name: "Record this moment" }).click();
      await expect(
        dialog.getByText("Camera access is off or unavailable.", {
          exact: false,
        }),
      ).toBeVisible();
      await dialog.locator('input[type="file"]:not([capture])').setInputFiles({
        name: "empty.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.alloc(0),
      });
      await expect(
        dialog.getByText("This file is empty.", { exact: false }),
      ).toBeVisible();
    }
    await dialog
      .locator('input[type="file"]:not([capture])')
      .setInputFiles(fixtures[slot]);
    await expect(
      dialog.getByRole("button", { name: "Use clip · Upload & validate" }),
    ).toBeEnabled();
    await dialog
      .getByRole("button", { name: "Use clip · Upload & validate" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(
      slot + 1,
    );
  }
  await page
    .getByRole("checkbox", { name: "I genuinely attempted", exact: false })
    .check();
  await page
    .getByRole("checkbox", { name: "I have permission", exact: false })
    .check();
  await page
    .getByRole("button", { name: "Complete quest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Quest complete", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save video", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(
    page.getByText("+100 XP · +10 points", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () =>
        Promise.reject(new DOMException("Share canceled", "AbortError")),
    });
  });
  await page
    .getByRole("button", { name: "Prepare share", exact: true })
    .click();
  await page.getByRole("button", { name: "Share video", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Quest complete", exact: true }),
  ).toBeVisible();
  // Browsers expose video controls inconsistently to roles, so inspect the actual HTML video.
  await expect
    .poll(() =>
      page.locator(".reel-player").evaluate((video: HTMLVideoElement) => ({
        width: video.videoWidth,
        height: video.videoHeight,
        playable: video.readyState >= 2,
      })),
    )
    .toEqual({ width: 1080, height: 1920, playable: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save video", exact: true }).click();
  const download = await downloadPromise;
  const downloaded = await download.path();
  expect(downloaded).toBeTruthy();
  expect(readFileSync(downloaded!).subarray(4, 8).toString()).toBe("ftyp");
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        downloaded!,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(
    metadata.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === "video",
    ),
  ).toMatchObject({
    codec_name: "h264",
    width: 1080,
    height: 1920,
    pix_fmt: "yuv420p",
  });
  expect(
    metadata.streams.find(
      (stream: { codec_type: string }) => stream.codec_type === "audio",
    ),
  ).toMatchObject({ codec_name: "aac" });
  expect(Number(metadata.format.duration)).toBeGreaterThanOrEqual(24);
  expect(Number(metadata.format.duration)).toBeLessThan(30);
  await page.screenshot({
    path: testInfo.outputPath("completed-reel-390.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText("+100 XP · +10 points", { exact: true }),
  ).toBeVisible();
  await visitYourSpace(page, "Private journal");
  await expect(page.locator(".journal-card")).toHaveCount(1);
  await expect(page.getByText("Reel ready", { exact: false })).toBeVisible();
  await visitYourSpace(page, "Rewards");
  await expect(page.locator(".wallet-card strong")).toHaveText("10points");
  expect(errors).toEqual([]);
});

test("synthetic recording combines paused takes, restores its draft after refresh and releases camera tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (
        window as unknown as { qaMediaTracks: MediaStreamTrack[] }
      ).qaMediaTracks = stream.getTracks();
      return stream;
    };
  });
  await explore(page);
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await page
    .getByRole("button", { name: "Record or upload", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record this moment" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { qaMediaTracks: MediaStreamTrack[] }
        ).qaMediaTracks?.map((track) => track.readyState),
      ),
    )
    .toEqual(["live", "live"]);
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await expect(dialog).toBeHidden();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { qaMediaTracks: MediaStreamTrack[] }
      ).qaMediaTracks.map((track) => track.readyState),
    ),
  ).toEqual(["ended", "ended"]);
  await page
    .getByRole("button", { name: "Record or upload", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record this moment" }).click();
  await dialog.getByRole("button", { name: "Start recording" }).click();
  await expect(dialog.getByRole("button", { name: "Stop take" })).toBeVisible();
  await expect
    .poll(
      async () =>
        Number.parseFloat((await dialog.getByRole("timer").innerText()).trim()),
      { timeout: 12_000 },
    )
    .toBeGreaterThanOrEqual(3);
  await dialog.getByRole("button", { name: "Stop take" }).click();
  const stoppedAt = await dialog.getByRole("timer").innerText();
  await page.waitForTimeout(1600);
  await expect(dialog.getByRole("timer")).toHaveText(stoppedAt);
  await dialog.getByRole("button", { name: "Add take" }).click();
  await expect
    .poll(async () =>
      Number.parseFloat((await dialog.getByRole("timer").innerText()).trim()),
    )
    .toBeGreaterThanOrEqual(6);
  await dialog.getByRole("button", { name: "Stop take" }).click();
  await expect(dialog.locator(".take-progress > span")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Save draft & leave" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Draft on this device", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { qaMediaTracks: MediaStreamTrack[] }
      ).qaMediaTracks.map((track) => track.readyState),
    ),
  ).toEqual(["ended", "ended"]);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/Draft restored from this device/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Use clip · Upload & validate" }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Use clip · Upload & validate" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(1);
  const clipRange = await page.evaluate(() => {
    const clip = JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0]
      .clips[0];
    return { start: clip.start, end: clip.end, duration: clip.duration };
  });
  expect(clipRange.end).toBeLessThanOrEqual(clipRange.duration + 0.05);
  expect(clipRange.end - clipRange.start).toBeGreaterThanOrEqual(5);
  expect(clipRange.duration).toBeLessThan(7.5);
  await page.reload();
  await expect(page.getByText("Uploaded", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Continue draft", exact: true }),
  ).toHaveCount(0);
});

// These UI-contract checks stub authentication and API responses. Real Postgres tests
// exercise authorization separately. These are not live merchant transactions.
async function fixtureOperatorAuth(page: Page, roles: string[]) {
  await page.route("**/src/lib/auth.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    export const DEMO = false;
    export const accessToken = async () => 'ui-fixture-token';
    export const supabase = { auth: {
      getSession: async () => ({ data: { session: { access_token: 'ui-fixture-token', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    } };`,
    }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        profile: {
          displayName: "Operator UI fixture",
          timezone: "UTC",
          locale: "en",
          summary: "",
          preferences: DEFAULT_PREFERENCES,
          onboardingCompleted: true,
        },
        wallet: { xp: 0, points: 0, version: 0 },
        roles,
      },
    }),
  );
}

test("operator forms submit agreements and inventory; review decisions require opened evidence", async ({
  page,
}) => {
  await fixtureOperatorAuth(page, ["operator"]);
  const providerId = "11111111-1111-4111-8111-111111111111";
  const runId = "22222222-2222-4222-8222-222222222222";
  const campaignId = "44444444-4444-4444-8444-444444444444";
  const apiState = {
    sponsors: [
      {
        id: providerId,
        name: "UI fixture provider",
        area: "Fixture area",
        approved: true,
      },
    ],
    quests: [],
    offers: [],
    campaigns: [] as {
      id: string;
      sponsor_id: string;
      title: string;
      disclosure: string;
      area: string;
      state: string;
    }[],
    redemptions: [],
    reviews: [{ id: runId, title: catalog[0].title }],
  };
  let offerRequest: Record<string, unknown> | undefined;
  let providerRequest: Record<string, unknown> | undefined;
  let reviewRequest: Record<string, unknown> | undefined;
  let campaignRequest: Record<string, unknown> | undefined;
  let campaignPauseRequest: Record<string, unknown> | undefined;
  await page.route("**/api/operator", (route) =>
    route.fulfill({ json: apiState }),
  );
  await page.route("**/api/operator/sponsors", (route) => {
    providerRequest = route.request().postDataJSON();
    return route.fulfill({ json: { id: providerId } });
  });
  await page.route("**/api/operator/offers", (route) => {
    offerRequest = route.request().postDataJSON();
    return route.fulfill({ json: { id: "fixture-offer" } });
  });
  await page.route("**/api/operator/campaigns", (route) => {
    campaignRequest = route.request().postDataJSON();
    apiState.campaigns = [
      {
        id: campaignId,
        sponsor_id: providerId,
        title: String(campaignRequest?.title),
        disclosure: String(campaignRequest?.disclosure),
        area: String(campaignRequest?.area),
        state: String(campaignRequest?.state),
      },
    ];
    return route.fulfill({ json: { id: campaignId } });
  });
  await page.route("**/api/operator/campaigns/pause", (route) => {
    campaignPauseRequest = route.request().postDataJSON();
    apiState.campaigns = apiState.campaigns.map((campaign) => ({
      ...campaign,
      state: "paused",
    }));
    return route.fulfill({ json: { id: campaignId, state: "paused" } });
  });
  await page.route("**/api/operator/reviews", (route) => {
    reviewRequest = route.request().postDataJSON();
    return route.fulfill({ json: { status: "finalized" } });
  });
  await page.route(`**/api/operator/reviews/${runId}`, (route) =>
    route.fulfill({
      json: {
        run_id: runId,
        snapshot: catalog[0],
        review_deadline: "2026-10-10T00:00:00Z",
        evidence_manifest: {
          declaration: {
            attempted: true,
            consent: true,
            statement: "An honest fixture attempt.",
          },
          clips: [0, 1, 2].map((index) => ({
            asset_id: `33333333-3333-4333-8333-33333333333${index}`,
            slot: index + 1,
            generation: 1,
            start_ms: 0,
            end_ms: 8000,
            label: catalog[0].beats[index].label,
          })),
        },
      },
    }),
  );
  await page.route(`**/api/operator/reviews/${runId}/media/*`, (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer ui-fixture-token",
    );
    return existsSync(fixtures[0])
      ? route.fulfill({
          body: readFileSync(fixtures[0]),
          contentType: "video/mp4",
        })
      : route.fulfill({ status: 404 });
  });
  await page.goto("/operator");
  await expect(
    page.getByRole("heading", { name: "Keep the promise." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve attempt" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open evidence" }).click();
  await expect(page.getByText("An honest fixture attempt.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve attempt" }),
  ).toBeDisabled();
  await expect(page.locator(".evidence-clips video")).toHaveCount(3);
  await page
    .getByRole("checkbox", {
      name: "I reviewed the submitted evidence",
      exact: false,
    })
    .check();
  await page.getByRole("button", { name: "Approve attempt" }).click();
  await expect(
    page.getByText("Attempt approved.", { exact: false }),
  ).toBeVisible();
  expect(reviewRequest).toEqual({ runId, decision: "approve" });
  await page.getByText("Add a provider agreement", { exact: true }).click();
  const providerForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Save provider agreement" }),
  });
  await providerForm
    .getByLabel("Provider name", { exact: true })
    .fill("A different fixture provider");
  await providerForm
    .getByLabel("Launch area", { exact: true })
    .fill("Fixture area");
  await providerForm
    .getByLabel("Agreement / funding reference")
    .fill("fixture-agreement-123");
  await providerForm
    .getByLabel("Private contact and agreement notes")
    .fill("Fixture notes, not a real business agreement.");
  await providerForm.getByRole("checkbox").check();
  await providerForm
    .getByRole("button", { name: "Save provider agreement" })
    .click();
  await expect(
    page.getByText("Provider agreement saved.", { exact: false }),
  ).toBeVisible();
  expect(providerRequest).toMatchObject({
    name: "A different fixture provider",
    area: "Fixture area",
    approved: true,
    funding_reference: "fixture-agreement-123",
  });
  await page.getByText("Create a funded offer", { exact: true }).click();
  const offerForm = page.locator("form").filter({
    has: page.getByRole("combobox", { name: /^Approved provider/ }),
  });
  await offerForm
    .getByRole("combobox", { name: /^Approved provider/ })
    .selectOption(providerId);
  await offerForm
    .getByLabel("Benefit title")
    .fill("Fixture coffee entitlement");
  await offerForm
    .getByLabel("Public terms and redemption instructions")
    .fill(
      "Fixture only. One coffee at the fixture provider; no purchase required. Cancel before consumption for a points refund.",
    );
  await offerForm.getByLabel("Confirmed inventory").fill("5");
  await offerForm
    .getByLabel("Available from (local time)")
    .fill("2026-10-01T10:00");
  await offerForm
    .getByLabel("Offer ends (local time)")
    .fill("2026-10-08T10:00");
  await offerForm
    .getByLabel("Funding reference", { exact: true })
    .fill("fixture-funding-123");
  await offerForm
    .getByLabel("The funding and usable inventory", { exact: false })
    .check();
  await offerForm
    .getByLabel("Activate for new claims", { exact: false })
    .check();
  await page.getByRole("button", { name: "Validate & publish offer" }).click();
  await expect(
    page.getByText("Offer published after server validation.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(offerRequest).toMatchObject({
    merchant_id: providerId,
    currency: "USD",
    stock_total: 5,
    funded: true,
    active: true,
    point_cost: 40,
  });
  expect(Number.isFinite(Date.parse(String(offerRequest?.starts_at)))).toBe(
    true,
  );
  await page.getByText("Add a funded campaign", { exact: true }).click();
  const campaignForm = page
    .locator("form")
    .filter({ has: page.getByLabel("Campaign provider") });
  await campaignForm.getByLabel("Campaign provider").selectOption(providerId);
  await campaignForm.getByLabel("Campaign title").fill("Fixture date campaign");
  await campaignForm
    .getByLabel("Disclosure (include sponsor name)")
    .fill("Sponsored by UI fixture provider");
  await expect(campaignForm.getByLabel("Campaign area")).toHaveValue(
    "Fixture area",
  );
  await campaignForm
    .getByRole("group", { name: "Campaign categories", exact: true })
    .getByRole("button", { name: "Date Night", exact: true })
    .click();
  await campaignForm
    .getByRole("group", { name: "Campaign quest families", exact: true })
    .getByRole("button", { name: "Your Date Has a Pit Crew", exact: true })
    .click();
  await campaignForm
    .getByLabel("Campaign starts (local time)")
    .fill("2026-10-01T10:00");
  await campaignForm
    .getByLabel("Campaign ends (local time)")
    .fill("2026-10-08T10:00");
  await campaignForm
    .getByLabel("Campaign funding reference")
    .fill("fixture-campaign-agreement-123");
  await campaignForm
    .getByLabel("Private campaign notes")
    .fill("UI contract fixture only; no actual sponsorship.");
  await expect(
    campaignForm
      .getByLabel("Campaign status")
      .locator('option[value="active"]'),
  ).toHaveJSProperty("disabled", true);
  await campaignForm
    .getByLabel("This campaign has a confirmed agreement and funding.", {
      exact: true,
    })
    .check();
  await campaignForm.getByLabel("Campaign status").selectOption("active");
  const campaignTimes = await page.evaluate(() => ({
    starts_at: new Date("2026-10-01T10:00").toISOString(),
    ends_at: new Date("2026-10-08T10:00").toISOString(),
  }));
  await campaignForm
    .getByRole("button", { name: "Validate & activate campaign", exact: true })
    .click();
  await expect(
    page.getByText("Funded campaign activated.", { exact: false }),
  ).toBeVisible();
  expect(campaignRequest).toEqual({
    sponsor_id: providerId,
    title: "Fixture date campaign",
    disclosure: "Sponsored by UI fixture provider",
    area: "Fixture area",
    state: "active",
    categories: ["date_night"],
    family_ids: ["date_pit_crew"],
    funded: true,
    ...campaignTimes,
    funding_reference: "fixture-campaign-agreement-123",
    notes: "UI contract fixture only; no actual sponsorship.",
  });
  await page
    .getByRole("button", { name: "Pause campaign", exact: true })
    .click();
  await expect(
    page.getByText("Campaign paused for new recommendations.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(campaignPauseRequest).toEqual({ id: campaignId });
  await expect(
    page.getByRole("button", { name: "Pause campaign", exact: true }),
  ).toHaveCount(0);
  await assertNoOverflow(page);
});

test("merchant-only confirmation reports already-used tokens without loading forbidden operator state", async ({
  page,
}) => {
  await fixtureOperatorAuth(page, ["merchant"]);
  let forbiddenRequests = 0;
  await page.route("**/api/operator", (route) => {
    forbiddenRequests++;
    return route.fulfill({ status: 403 });
  });
  await page.route("**/api/merchant/consume", (route) =>
    route.fulfill({ json: { state: "consumed", already_consumed: true } }),
  );
  await page.goto("/operator");
  await page.getByLabel("Private redemption token").fill("fixture-token");
  await page.getByRole("button", { name: "Confirm fulfillment" }).click();
  await expect(page.getByText("Already used.", { exact: false })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Funded offers" }),
  ).toHaveCount(0);
  expect(forbiddenRequests).toBe(0);
});
