import { expect, test, type Page } from "@playwright/test";
import { findDefaultQuests } from "./quest-wizard-helpers";

async function openCapture(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo first" }).click();
  await findDefaultQuests(page);
  await page.locator(".quest-card").first().click();
  await page.getByRole("button", { name: "Accept quest", exact: true }).click();
  await page
    .getByRole("button", { name: "Record or import video", exact: true })
    .first()
    .click();
  return page.getByRole("dialog", { name: "Record your quest" });
}

async function previewPlays(page: Page) {
  await expect(
    page.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  expect(
    await page.getByLabel("Live camera preview").evaluate((element) => {
      const video = element as HTMLVideoElement;
      return (
        video.muted &&
        video.defaultMuted &&
        video.playsInline &&
        !video.paused &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
      );
    }),
  ).toBe(true);
}

for (const failure of ["rejected", "no_frames"] as const) {
  test(`camera preview recovers from ${failure} playback without recording blind or losing import`, async ({
    page,
  }) => {
    await page.addInitScript((mode) => {
      const source = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        "srcObject",
      )!;
      const play = HTMLMediaElement.prototype.play;
      const state = window as unknown as {
        previewMayPlay: boolean;
        cameraStreams: MediaStream[];
      };
      state.previewMayPlay = false;
      state.cameraStreams = [];
      Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
        configurable: true,
        get: source.get,
        set(value) {
          if (value instanceof MediaStream) this.autoplay = false;
          source.set!.call(this, value);
        },
      });
      HTMLMediaElement.prototype.play = function () {
        if (this.srcObject instanceof MediaStream && !state.previewMayPlay)
          return mode === "rejected"
            ? Promise.reject(
                new DOMException("User gesture required", "NotAllowedError"),
              )
            : Promise.resolve();
        return play.call(this);
      };
      const acquire = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await acquire(constraints);
        state.cameraStreams.push(stream);
        return stream;
      };
    }, failure);
    const dialog = await openCapture(page);
    await expect(
      dialog.getByRole("button", { name: "Hold to record", exact: true }),
    ).toBeDisabled();
    await expect(dialog.getByLabel("Import video")).toBeEnabled();
    const retry = dialog.getByRole("button", {
      name: "Start preview",
      exact: true,
    });
    await expect(retry).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { previewMayPlay: boolean }).previewMayPlay = true;
    });
    if (failure === "rejected") await retry.click();
    else
      await dialog
        .getByRole("button", { name: "Restart camera", exact: true })
        .click();
    await previewPlays(page);
    await expect(retry).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Stop recording", exact: true }),
    ).toHaveCount(0);
    if (failure === "no_frames") {
      expect(
        await page.evaluate(() =>
          (
            window as unknown as { cameraStreams: MediaStream[] }
          ).cameraStreams.map((stream) =>
            stream.getTracks().map((track) => track.readyState),
          ),
        ),
      ).toEqual([
        ["ended", "ended"],
        ["live", "live"],
      ]);
    }
    await dialog
      .getByRole("button", { name: "Exit capture", exact: true })
      .click();
    expect(
      await page.evaluate(() =>
        (
          window as unknown as { cameraStreams: MediaStream[] }
        ).cameraStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      ),
    ).toBe(true);
  });
}

test("a muted camera seals the current take and recovers preview without resuming recording or losing takes", async ({
  page,
}) => {
  const dialog = await openCapture(page);
  await previewPlays(page);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect
    .poll(async () => parseFloat(await dialog.getByRole("timer").innerText()))
    .toBeGreaterThan(1);
  await dialog.getByLabel("Live camera preview").evaluate((element) => {
    const stream = (element as HTMLVideoElement).srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    Object.defineProperty(track, "muted", { configurable: true, value: true });
    track.dispatchEvent(new Event("mute"));
  });
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await expect(
    dialog.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Live camera preview").evaluate((element) => {
    const track = (
      (element as HTMLVideoElement).srcObject as MediaStream
    ).getVideoTracks()[0];
    Object.defineProperty(track, "muted", { configurable: true, value: false });
    track.dispatchEvent(new Event("unmute"));
  });
  await previewPlays(page);
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(
    dialog.getByText("Your draft is here. Keep filming.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
});

test("fast camera flips reattach each stream and reach a third camera without stale track events closing it", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const ids = ["rear-wide", "rear-ultra", "front"];
    let streams: MediaStream[] = [];
    const acquire = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (!streams.length) {
        const initial = await acquire(constraints);
        streams = [initial, initial.clone(), initial.clone()];
        (window as unknown as { flipStreams: MediaStream[] }).flipStreams =
          streams;
        streams.forEach((stream, index) => {
          const track = stream.getVideoTracks()[0];
          const settings = track.getSettings();
          track.getSettings = () => ({ ...settings, deviceId: ids[index] });
        });
      }
      const video = constraints?.video as MediaTrackConstraints | undefined;
      const requested = (video?.deviceId as ConstrainDOMStringParameters)
        ?.exact;
      return streams[
        typeof requested === "string" ? ids.indexOf(requested) : 0
      ];
    };
    navigator.mediaDevices.enumerateDevices = async () =>
      ids.map(
        (deviceId) =>
          ({
            deviceId,
            kind: "videoinput",
            label: deviceId,
            groupId: "camera",
            toJSON() {
              return this;
            },
          }) as MediaDeviceInfo,
      );
  });
  const dialog = await openCapture(page);
  for (const index of [0, 1, 2]) {
    if (index)
      await dialog
        .getByRole("button", { name: "Flip camera", exact: true })
        .click();
    await previewPlays(page);
    expect(
      await dialog
        .getByLabel("Live camera preview")
        .evaluate(
          (element, expected) =>
            (element as HTMLVideoElement).srcObject ===
            (window as unknown as { flipStreams: MediaStream[] }).flipStreams[
              expected
            ],
          index,
        ),
    ).toBe(true);
    if (index) {
      await page.evaluate(
        (previous) =>
          (window as unknown as { flipStreams: MediaStream[] }).flipStreams[
            previous
          ]
            .getTracks()
            .forEach((track) => track.dispatchEvent(new Event("ended"))),
        index - 1,
      );
      await previewPlays(page);
    }
  }
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (window as unknown as { flipStreams: MediaStream[] }).flipStreams.every(
        (stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
});

test("a preview frame stall seals a take and a user retry keeps it without restarting recording", async ({
  page,
}) => {
  const dialog = await openCapture(page);
  await previewPlays(page);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect
    .poll(async () => parseFloat(await dialog.getByRole("timer").innerText()))
    .toBeGreaterThan(1);
  // The camera track and play() stay live, but the compositor stops presenting
  // frames. No pause/mute event announces this WebView failure mode.
  await dialog.getByLabel("Live camera preview").evaluate((element) => {
    Object.defineProperty(element, "requestVideoFrameCallback", {
      configurable: true,
      value: () => 0,
    });
  });
  const retry = dialog.getByRole("button", {
    name: "Start preview",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await expect(
    dialog.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Live camera preview").evaluate((element) => {
    Reflect.deleteProperty(element, "requestVideoFrameCallback");
  });
  await retry.click();
  await previewPlays(page);
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
});

test("queued media interruptions cannot disable a camera that is already playing fresh frames", async ({
  page,
}) => {
  const dialog = await openCapture(page);
  await previewPlays(page);
  await dialog.getByLabel("Live camera preview").evaluate((element) => {
    for (const event of ["pause", "waiting", "stalled"])
      element.dispatchEvent(new Event(event));
    ((element as HTMLVideoElement).srcObject as MediaStream)
      .getVideoTracks()[0]
      .dispatchEvent(new Event("mute"));
  });
  await previewPlays(page);
  await expect(
    dialog.getByRole("button", { name: "Start preview", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
});

test("genuinely paused video resumes its preview on fresh frames without resuming recording or losing its take", async ({
  page,
}) => {
  const dialog = await openCapture(page);
  await previewPlays(page);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect
    .poll(async () => parseFloat(await dialog.getByRole("timer").innerText()))
    .toBeGreaterThan(1);
  await dialog
    .getByLabel("Live camera preview")
    .evaluate((element) => (element as HTMLVideoElement).pause());
  await expect(
    dialog.getByRole("button", { name: "Start preview", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await expect(
    dialog.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByLabel("Live camera preview")
    .evaluate((element) => (element as HTMLVideoElement).play());
  await previewPlays(page);
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
});
