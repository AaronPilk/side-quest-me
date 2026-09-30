import { expect, test, type Page } from "@playwright/test";
import { findDefaultQuests } from "./quest-wizard-helpers";

async function openQuest(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await page
    .getByRole("button", { name: "Record or upload", exact: true })
    .first()
    .click();
}

test("local capture drafts isolate identities and parts, expire, and cannot reappear after sign-out cleanup", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/capture-drafts.ts";
    const drafts = await import(modulePath);
    const generation = drafts.captureDraftGeneration();
    const draft = {
      owner: "capture-test-owner",
      run: "run-one",
      slot: 0,
      baseClipId: null,
      file: new Blob(["test-video"], { type: "video/webm" }),
      duration: 6,
      start: 0,
      end: 6,
      fit: "fit",
      crop: 0.5,
      mute: false,
      caption: "Hook",
      source: "camera",
      updatedAt: Date.now(),
    };
    await drafts.saveCaptureDraft(draft, generation);
    const own = await drafts.loadCaptureDraft(draft.owner, draft.run, 0);
    const otherOwner = await drafts.loadCaptureDraft(
      "other-owner",
      draft.run,
      0,
    );
    const otherRun = await drafts.loadCaptureDraft(draft.owner, "other-run", 0);
    const otherPart = await drafts.loadCaptureDraft(draft.owner, draft.run, 1);
    await drafts.saveCaptureDraft(
      { ...draft, slot: 1, updatedAt: Date.now() - 8 * 86400000 },
      generation,
    );
    const expired = await drafts.loadCaptureDraft(draft.owner, draft.run, 1);
    await drafts.clearCaptureDrafts();
    // Simulate a late recorder onstop from the session that just signed out.
    await drafts.saveCaptureDraft(draft, generation);
    const afterLogout = await drafts.loadCaptureDraft(
      draft.owner,
      draft.run,
      0,
    );
    return {
      own: await own.file.text(),
      otherOwner,
      otherRun,
      otherPart,
      expired,
      afterLogout,
    };
  });
  expect(result).toEqual({
    own: "test-video",
    otherOwner: undefined,
    otherRun: undefined,
    otherPart: undefined,
    expired: undefined,
    afterLogout: undefined,
  });
});

test("a camera interruption finalizes paused footage as a restorable part and releases tracks", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks =
        stream.getTracks();
      return stream;
    };
  });
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record this moment" }).click();
  await dialog.getByRole("button", { name: "Start recording" }).click();
  await expect
    .poll(async () =>
      Number.parseFloat(await dialog.getByRole("timer").innerText()),
    )
    .toBeGreaterThanOrEqual(5.5);
  await dialog.getByRole("button", { name: "Stop take" }).click();
  await expect(
    dialog.getByRole("button", { name: "Exit capture" }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("camera-paused.png"),
    fullPage: false,
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(dialog.getByText(/Camera interrupted/)).toBeVisible();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks.map(
        (track) => track.readyState,
      ),
    ),
  ).toEqual(["ended", "ended"]);
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue draft", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Use clip · Upload & validate" }),
  ).toBeEnabled();
});

test("camera permission denial keeps file upload available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Record this moment" }).click();
  await expect(
    dialog.getByText(/Camera access is off or unavailable/),
  ).toBeVisible();
  await expect(dialog.getByLabel("Upload a clip")).toBeEnabled();
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await expect(dialog).toBeHidden();
});
