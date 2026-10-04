import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { findDefaultQuests } from "./quest-wizard-helpers";

async function openQuest(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await page
    .getByRole("button", { name: "Record or import video", exact: true })
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

async function trackCamera(page: Page) {
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
}
async function background(page: Page, hidden: boolean) {
  await page.evaluate((value) => {
    Object.defineProperty(document, "hidden", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test("hold/release takes survive leaving and resume as one session, with no numeric trim", async ({
  page,
}) => {
  await trackCamera(page);
  await openQuest(page);
  const dialog = page.getByRole("dialog", { name: "Record your quest" });
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  const shutter = dialog.getByRole("button", {
    name: "Hold to record",
    exact: true,
  });
  await expect(shutter).toBeEnabled();
  const bounds = await shutter.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  await page.mouse.down();
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(3200);
  await page.mouse.up();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks.map(
        (t) => t.readyState,
      ),
    ),
  ).toEqual(["ended", "ended"]);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.getByText(/Your draft is here/)).toBeVisible();
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await page.waitForTimeout(3200);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Preview video", exact: true })
    .click();
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save video", exact: true }),
  ).toBeEnabled();
  async function expectBothTakesToPlay() {
    const preview = dialog.getByLabel("Your video preview", { exact: true });
    await expect(preview).toHaveAttribute("src", /^blob:/);
    const firstSource = await preview.getAttribute("src");
    async function expectDecodedPlayback() {
      await expect
        .poll(() =>
          preview.evaluate((element: HTMLVideoElement) => ({
            decoded:
              element.readyState >= 2 &&
              element.videoWidth > 0 &&
              element.videoHeight > 0,
            error: element.error?.code ?? null,
            playing: !element.paused,
          })),
        )
        .toEqual({ decoded: true, error: null, playing: true });
      const start = await preview.evaluate((element: HTMLVideoElement) => ({
        source: element.currentSrc,
        time: element.currentTime,
      }));
      await expect
        .poll(() =>
          preview.evaluate(
            (element: HTMLVideoElement, before) =>
              element.currentSrc === before.source &&
              element.currentTime > before.time + 0.15 &&
              !element.paused &&
              element.error === null,
            start,
          ),
        )
        .toBe(true);
    }
    await expectDecodedPlayback();
    // Let the restored first take end naturally: the component must advance to
    // the appended take, attach its Blob and play real decoded frames.
    await expect.poll(() => preview.getAttribute("src")).not.toBe(firstSource);
    await expectDecodedPlayback();
    await expect(dialog.getByText(/could not be previewed/)).toHaveCount(0);
  }
  await expectBothTakesToPlay();
  const data = await page.evaluate(async () => {
    const modulePath = "/src/lib/capture-drafts.ts";
    const identityPath = "/src/lib/demo-identity.ts";
    const drafts = await import(modulePath),
      identity = await import(identityPath);
    const run = JSON.parse(localStorage.getItem("sidequest-demo-v1")!).runs[0];
    const draft = await drafts.loadCaptureDraft(
      `demo:${identity.demoActor().id}`,
      run.id,
      3,
    );
    return {
      count: draft.takes.length,
      seconds: draft.duration,
      sizes: draft.takes.map((take: { file: Blob }) => take.file.size),
    };
  });
  expect(data.count).toBe(2);
  expect(data.seconds).toBeGreaterThan(6);
  expect(data.sizes.every((size: number) => size > 0)).toBe(true);
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.getByText(/Your draft is here/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Preview video", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(2);
  await expectBothTakesToPlay();
});

test("a restored video copy failure keeps the original take when another recording is appended", async ({
  page,
}) => {
  await openQuest(page);
  const dialog = page.getByRole("dialog", { name: "Record your quest" });
  async function recordTake(count: number) {
    const before = parseFloat(await dialog.getByRole("timer").innerText());
    await dialog
      .getByRole("button", { name: "Or tap to start recording", exact: true })
      .click();
    await expect
      .poll(async () => parseFloat(await dialog.getByRole("timer").innerText()))
      .toBeGreaterThan(before + 0.8);
    await dialog
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(dialog.locator(".session-timeline > span")).toHaveCount(count);
    await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  }
  async function savedFirstTake() {
    return page.evaluate(async () => {
      const draftsPath = "/src/lib/capture-drafts.ts";
      const identityPath = "/src/lib/demo-identity.ts";
      const drafts = await import(draftsPath);
      const identity = await import(identityPath);
      const run = JSON.parse(localStorage.getItem("sidequest-demo-v1")!)
        .runs[0];
      const draft = await drafts.loadCaptureDraft(
        `demo:${identity.demoActor().id}`,
        run.id,
        3,
      );
      const first = draft.takes[0];
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await first.file.arrayBuffer(),
      );
      return {
        count: draft.takes.length,
        first: {
          bytes: Array.from(new Uint8Array(digest)),
          size: first.file.size,
          type: first.file.type,
          duration: first.duration,
        },
      };
    });
  }
  await recordTake(1);
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  const original = await savedFirstTake();
  expect(original.count).toBe(1);
  expect(original.first.size).toBeGreaterThan(0);
  await page.evaluate(() => {
    const read = Blob.prototype.arrayBuffer;
    const state = window as unknown as {
      failedVideoReads: number;
      restoreBlobRead: () => void;
    };
    state.failedVideoReads = 0;
    state.restoreBlobRead = () => {
      Blob.prototype.arrayBuffer = read;
    };
    Blob.prototype.arrayBuffer = function () {
      if (this.type.startsWith("video/")) {
        state.failedVideoReads++;
        return Promise.reject(
          new Error("Synthetic restored video read failure"),
        );
      }
      return read.call(this);
    };
  });
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(
    dialog.getByText(
      "Your saved takes are kept, but playback could not be prepared. Try reopening your draft.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(
    await page.evaluate(() => {
      const state = window as unknown as {
        failedVideoReads: number;
        restoreBlobRead: () => void;
      };
      state.restoreBlobRead();
      return state.failedVideoReads;
    }),
  ).toBeGreaterThan(0);
  await recordTake(2);
  const appended = await savedFirstTake();
  expect(appended.count).toBe(2);
  expect(appended.first).toEqual(original.first);
  await dialog.getByRole("button", { name: "Exit capture" }).click();
});

test("backgrounding seals the current take and releases camera without resuming on foreground", async ({
  page,
}) => {
  await trackCamera(page);
  await openQuest(page);
  const dialog = page.getByRole("dialog");

  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await page.waitForTimeout(1200);
  await background(page, true);
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks.map(
        (t) => t.readyState,
      ),
    ),
  ).toEqual(["ended", "ended"]);
  await background(page, false);
  await expect(
    dialog.getByRole("button", { name: "Continue recording", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Stop recording" }),
  ).toHaveCount(0);
});

test("camera permission denial leaves finished-video import available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    let denied = true;
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (denied) {
        denied = false;
        throw new DOMException("Denied", "NotAllowedError");
      }
      return original(constraints);
    };
  });
  await openQuest(page);
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText(/Camera access is unavailable/)).toBeVisible();
  await expect(dialog.getByLabel("Import video")).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Open camera", exact: true })
    .click();
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
});

test("a late camera grant cannot reopen capture after leaving and returning", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      const state = window as unknown as {
        testTracks: MediaStreamTrack[];
        grantCamera: () => void;
      };
      state.testTracks = stream.getTracks();
      await new Promise<void>((resolve) => {
        state.grantCamera = resolve;
      });
      return stream;
    };
  });
  await openQuest(page);
  const dialog = page.getByRole("dialog");

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { grantCamera?: () => void })
            .grantCamera,
      ),
    )
    .toBe("function");
  await background(page, true);
  await background(page, false);
  await page.evaluate(() =>
    (window as unknown as { grantCamera: () => void }).grantCamera(),
  );
  await expect(
    dialog.getByRole("button", { name: "Open camera" }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Hold to record" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as unknown as { testTracks: MediaStreamTrack[] }).testTracks.map(
        (t) => t.readyState,
      ),
    ),
  ).toEqual(["ended", "ended"]);
});

test("full-screen camera tools expose honest capabilities, timed hands-free recording, and editable coaching", async ({
  page,
}) => {
  await openQuest(page);
  const dialog = page.getByRole("dialog", { name: "Record your quest" });
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Flash", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Flip camera" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "15s", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "15s", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog
    .getByRole("button", { name: "Teleprompter", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "Teleprompter script" })
    .fill("We have one hour to find our new favorite place.");
  await dialog.getByRole("button", { name: "slow", exact: true }).click();
  await dialog.getByRole("button", { name: "Show teleprompter" }).click();
  await expect(dialog.getByLabel("Teleprompter script")).toHaveText(
    "We have one hour to find our new favorite place.",
  );
  await dialog
    .getByRole("button", { name: "Quest instructions", exact: true })
    .click();
  const sheet = dialog.getByRole("region", {
    name: "Quest instructions panel",
  });
  await expect(sheet.locator("li")).toHaveCount(3);
  await page.keyboard.press("Tab");
  await expect(
    sheet.getByRole("button", { name: "Close panel" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("button", { name: "Quest instructions", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Timer 0s" }).click();
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Cancel timer" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(700);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
});

test("backgrounding cancels the countdown without recording, and swipe opens quest instructions", async ({
  page,
}) => {
  await trackCamera(page);
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await dialog.getByRole("button", { name: "Timer 0s" }).click();
  await dialog.getByRole("button", { name: "Timer 3s" }).click();
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Cancel timer" }),
  ).toBeVisible();
  await background(page, true);
  await background(page, false);
  await expect(
    dialog.getByRole("button", { name: "Cancel timer" }),
  ).toHaveCount(0);
  await expect(dialog.getByLabel("0 takes saved")).toBeVisible();
  await page.mouse.move(30, 500);
  await page.mouse.down();
  await page.mouse.move(40, 300);
  await page.mouse.up();
  await expect(
    dialog.getByRole("region", { name: "Quest instructions panel" }),
  ).toBeVisible();
});

test("gallery photos become positioned image overlays preserved with the video draft", async ({
  page,
}) => {
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await dialog.getByLabel("Import video", { exact: true }).setInputFiles({
    name: "overlay.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+McAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    dialog.getByRole("region", { name: "Image overlay settings" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Top right", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog.getByAltText("Your image overlay")).toHaveClass(
    /position-top_right/,
  );
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await page.waitForTimeout(700);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.getByAltText("Your image overlay")).toHaveClass(
    /position-top_right/,
  );
  await dialog.getByRole("button", { name: "Edit image overlay" }).click();
  await dialog
    .getByRole("button", { name: "Remove photo", exact: true })
    .click();
  await expect(dialog.getByAltText("Your image overlay")).toHaveCount(0);
});

test.describe("mobile camera gestures", () => {
  test.use({ isMobile: true, hasTouch: true });
  test("an actual touch swipe and a Simulator-style pointer drag both reveal quest instructions", async ({
    page,
  }) => {
    await openQuest(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
    const input = await page.context().newCDPSession(page);
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 110, y: 465 }],
    });
    for (const y of [445, 410, 370, 325, 285]) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 110, y }],
      });
      await page.waitForTimeout(20);
    }
    await input.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      dialog.getByRole("region", { name: "Quest instructions panel" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close panel" }).click();
    await page.mouse.move(110, 465);
    await page.mouse.down();
    await page.mouse.move(110, 285, { steps: 10 });
    await page.mouse.up();
    await expect(
      dialog.getByRole("region", { name: "Quest instructions panel" }),
    ).toBeVisible();
    await input.detach();
  });
});

test("preview secondary actions keep readable contrast even when hovered", async ({
  page,
}) => {
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await page.waitForTimeout(500);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Preview video", exact: true })
    .click();
  const action = dialog.getByRole("button", {
    name: "Add more takes",
    exact: true,
  });
  await action.hover();
  expect(
    await action.evaluate((button) => ({
      color: getComputedStyle(button).color,
      background: getComputedStyle(button).backgroundColor,
    })),
  ).toEqual({ color: "rgb(255, 255, 255)", background: "rgb(40, 37, 47)" });
});

test("photo overlays drag and pinch without zooming the camera, survive reopening, and expose a size control", async ({
  page,
}) => {
  await openQuest(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Live camera preview")).toBeVisible();
  await dialog.getByLabel("Import video", { exact: true }).setInputFiles({
    name: "move-photo.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 800, height: 600, channels: 3, background: "red" },
    })
      .png()
      .toBuffer(),
  });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const photo = dialog.getByRole("button", { name: /^Move and resize photo/ });
  const before = (await photo.boundingBox())!;
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width / 2 - 40,
    before.y + before.height / 2 - 45,
    { steps: 8 },
  );
  await page.mouse.up();
  const dragged = (await photo.boundingBox())!;
  expect(dragged.x).toBeCloseTo(before.x - 40, 0);
  expect(dragged.y).toBeCloseTo(before.y - 45, 0);
  const cdp = await page.context().newCDPSession(page);
  const x = dragged.x + dragged.width / 2,
    y = dragged.y + dragged.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: x - 20, y, id: 1 },
      { x: x + 20, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: x - 30, y, id: 1 },
      { x: x + 30, y, id: 2 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => (await photo.boundingBox())!.width)
    .toBeGreaterThan(dragged.width * 1.45);
  await expect(
    dialog.getByRole("region", { name: "Quest instructions panel" }),
  ).toHaveCount(0);
  const pinched = (await photo.boundingBox())!;
  await page.screenshot({ path: ".local/camera-overlay-gesture-proof.png" });
  const canvas = (await dialog.locator(".session-video-canvas").boundingBox())!;
  expect(canvas.width / canvas.height).toBeCloseTo(9 / 16, 3);
  await dialog
    .getByRole("button", { name: "Or tap to start recording" })
    .click();
  await page.waitForTimeout(700);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.getByText(/Draft saved on this device/)).toBeVisible();
  await dialog.getByRole("button", { name: "Exit capture" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(photo).toBeVisible();
  const restored = (await photo.boundingBox())!;
  expect(restored.width).toBeCloseTo(pinched.width, 0);
  expect(restored.x).toBeCloseTo(pinched.x, 0);
  expect(restored.y).toBeCloseTo(pinched.y, 0);
  await photo.focus();
  await page.keyboard.press("ArrowDown");
  expect((await photo.boundingBox())!.y).toBeGreaterThan(restored.y);
  await dialog.getByRole("button", { name: "Edit image overlay" }).click();
  const slider = dialog.getByRole("slider", { name: "Photo size" });
  await slider.fill("40");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect((await photo.boundingBox())!.width / canvas.width).toBeCloseTo(0.4, 2);
});
