import { expect, test, type Locator, type Page } from "@playwright/test";
import { findDefaultQuests } from "./quest-wizard-helpers";

type ZoomFixture = {
  streams: MediaStream[];
  acquisitions: { deviceId: string; facingMode: string }[];
  constraints: { deviceId: string; zoom: number }[];
};

// Chromium supplies real, recordable fake-camera frames. The adapter models
// hardware zoom support while preserving those streams, and captures the actual
// MediaStreamTrack.applyConstraints requests rather than inspecting UI scaling.
async function cameraWithZoom(page: Page, minZoom = 0.5) {
  await page.addInitScript(
    ({ minimum }) => {
      const devices = [
        { id: "rear-wide", label: "Back Camera", facing: "environment" },
        {
          id: "rear-ultra",
          label: "Back Ultra Wide Camera",
          facing: "environment",
        },
        { id: "front", label: "Front Camera", facing: "user" },
      ];
      const state: ZoomFixture = {
        streams: [],
        acquisitions: [],
        constraints: [],
      };
      (
        window as unknown as { cameraZoomFixture: ZoomFixture }
      ).cameraZoomFixture = state;
      const acquire = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      const requestedString = (value: ConstrainDOMString | undefined) => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value[0];
        const request = value?.exact ?? value?.ideal;
        return Array.isArray(request) ? request[0] : request;
      };
      navigator.mediaDevices.enumerateDevices = async () =>
        devices.map(
          (device) =>
            ({
              deviceId: device.id,
              kind: "videoinput",
              label: device.label,
              groupId: "camera",
              toJSON() {
                return this;
              },
            }) as MediaDeviceInfo,
        );
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const video =
          typeof constraints?.video === "object" ? constraints.video : {};
        const id = requestedString(video.deviceId);
        const facing = requestedString(video.facingMode);
        const device =
          devices.find((item) => item.id === id) ??
          devices.find((item) => item.facing === facing) ??
          devices[0];
        // Device IDs above are fixture identities; let Chromium create the actual
        // video/audio tracks without trying to resolve those IDs on the host.
        const stream = await acquire({
          audio: constraints?.audio ?? true,
          video: true,
        });
        state.streams.push(stream);
        state.acquisitions.push({
          deviceId: device.id,
          facingMode: device.facing,
        });
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings.bind(track);
        const capabilities = track.getCapabilities.bind(track);
        let zoom = 1;
        track.getSettings = () => ({
          ...settings(),
          deviceId: device.id,
          facingMode: device.facing,
          zoom,
        });
        track.getCapabilities = () => ({
          ...capabilities(),
          zoom: { min: minimum, max: 4, step: 0.1 },
        });
        const apply = track.applyConstraints.bind(track);
        track.applyConstraints = async (value = {}) => {
          type ZoomConstraint = MediaTrackConstraints & {
            zoom?: number | ConstrainDoubleRange;
          };
          const requested =
            (value as ZoomConstraint).zoom ??
            value.advanced
              ?.map((item) => (item as ZoomConstraint).zoom)
              .find((item) => item !== undefined);
          if (requested !== undefined) {
            const number =
              typeof requested === "number"
                ? requested
                : (requested.exact ?? requested.ideal);
            if (typeof number !== "number" || number < minimum || number > 4)
              throw new DOMException(
                "Zoom outside supported range",
                "OverconstrainedError",
              );
            zoom = number;
            state.constraints.push({ deviceId: device.id, zoom });
          }
          // The fake device itself has no zoom capability; strip only that field
          // after validating/logging it so real frame delivery and recording work.
          const copy = { ...value } as ZoomConstraint;
          delete copy.zoom;
          if (copy.advanced)
            copy.advanced = copy.advanced
              .map((item) => {
                const rest = { ...item } as ZoomConstraint;
                delete rest.zoom;
                return rest;
              })
              .filter((item) => Object.keys(item).length > 0);
          await apply(copy);
        };
        return stream;
      };
    },
    { minimum: minZoom },
  );
}

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
  const dialog = page.getByRole("dialog", { name: "Record your quest" });
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      dialog.getByLabel("Live camera preview").evaluate((element) => {
        const video = element as HTMLVideoElement;
        return !video.paused && video.readyState >= 2 && video.videoWidth > 0;
      }),
    )
    .toBe(true);
  return dialog;
}

async function currentZoom(page: Page) {
  return page.getByLabel("Live camera preview").evaluate((element) => {
    const stream = (element as HTMLVideoElement).srcObject as MediaStream;
    return (
      stream.getVideoTracks()[0].getSettings() as MediaTrackSettings & {
        zoom: number;
      }
    ).zoom;
  });
}

async function pinch(
  page: Page,
  stage: Locator,
  from: number,
  to: number,
  upward = false,
) {
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  const center = box!.x + box!.width / 2;
  const y = box!.y + box!.height * 0.52;
  const input = await page.context().newCDPSession(page);
  const points = (distance: number, vertical: number) => [
    { id: 1, x: center - distance / 2, y: vertical },
    { id: 2, x: center + distance / 2, y: vertical },
  ];
  await input.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(from, y),
  });
  for (const fraction of [0.2, 0.4, 0.6, 0.8, 1]) {
    await input.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(
        from + (to - from) * fraction,
        y - (upward ? 150 * fraction : 0),
      ),
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
  }
  await input.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await input.detach();
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("0.5× and 1× select supported capture zoom through the live track, with phone-sized controls", async ({
  page,
}) => {
  await cameraWithZoom(page);
  const dialog = await openCapture(page);
  const wide = dialog.getByRole("button", { name: "Zoom 0.5×", exact: true });
  const normal = dialog.getByRole("button", { name: "Zoom 1×", exact: true });
  await expect(wide).toBeEnabled();
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  const transform = await dialog
    .getByLabel("Live camera preview")
    .evaluate((video) => getComputedStyle(video).transform);
  await wide.click();
  await expect.poll(() => currentZoom(page)).toBe(0.5);
  await expect(wide).toHaveAttribute("aria-pressed", "true");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await normal.click();
  await expect.poll(() => currentZoom(page)).toBe(1);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { cameraZoomFixture: ZoomFixture }
      ).cameraZoomFixture.constraints.map((item) => item.zoom),
    ),
  ).toEqual(expect.arrayContaining([0.5, 1]));
  expect(
    await dialog
      .getByLabel("Live camera preview")
      .evaluate((video) => getComputedStyle(video).transform),
  ).toBe(transform);
  for (const control of [wide, normal]) {
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("two-finger pinch clamps real capture zoom and never turns into an instructions swipe", async ({
  page,
}) => {
  await cameraWithZoom(page);
  const dialog = await openCapture(page);
  const stage = dialog.locator(".session-camera-stage");
  await pinch(page, stage, 50, 330, true);
  await expect.poll(() => currentZoom(page)).toBe(4);
  await expect(
    dialog.getByRole("region", { name: "Quest instructions panel" }),
  ).toHaveCount(0);
  await pinch(page, stage, 300, 16, true);
  await expect.poll(() => currentZoom(page)).toBe(0.5);
  await expect(
    dialog.getByRole("region", { name: "Quest instructions panel" }),
  ).toHaveCount(0);
  const requested = await page.evaluate(() =>
    (
      window as unknown as { cameraZoomFixture: ZoomFixture }
    ).cameraZoomFixture.constraints.map((item) => item.zoom),
  );
  expect(requested.some((value) => value > 1 && value < 4)).toBe(true);
  expect(requested.every((value) => value >= 0.5 && value <= 4)).toBe(true);
});

test("a camera without an ultra-wide range cannot pretend to record at 0.5×", async ({
  page,
}) => {
  await cameraWithZoom(page, 1);
  const dialog = await openCapture(page);
  const wide = dialog.getByRole("button", { name: "Zoom 0.5×", exact: true });
  if (await wide.count()) await expect(wide).toBeDisabled();
  await pinch(page, dialog.locator(".session-camera-stage"), 300, 16);
  await expect.poll(() => currentZoom(page)).toBe(1);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { cameraZoomFixture: ZoomFixture }
      ).cameraZoomFixture.constraints.every((item) => item.zoom >= 1),
    ),
  ).toBe(true);
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
});

test("Flip changes facing direction rather than cycling through rear lenses", async ({
  page,
}) => {
  await cameraWithZoom(page);
  const dialog = await openCapture(page);
  const facing = () =>
    dialog.getByLabel("Live camera preview").evaluate((element) => {
      const track = (
        (element as HTMLVideoElement).srcObject as MediaStream
      ).getVideoTracks()[0];
      return track.getSettings().facingMode;
    });
  await expect.poll(facing).toBe("environment");
  await dialog
    .getByRole("button", { name: "Flip camera", exact: true })
    .click();
  await expect.poll(facing).toBe("user");
  await dialog
    .getByRole("button", { name: "Flip camera", exact: true })
    .click();
  await expect.poll(facing).toBe("environment");
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { cameraZoomFixture: ZoomFixture }
      ).cameraZoomFixture.acquisitions.map((item) => item.deviceId),
    ),
  ).toEqual(["rear-wide", "front", "rear-wide"]);
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
});

test("changing capture zoom while filming keeps recording, saves both takes and restores the draft", async ({
  page,
}) => {
  await cameraWithZoom(page);
  const dialog = await openCapture(page);
  for (const [index, zoom] of [0.5, 1].entries()) {
    await dialog
      .getByRole("button", { name: "Or tap to start recording", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Stop recording", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => parseFloat(await dialog.getByRole("timer").innerText()))
      .toBeGreaterThan(index === 0 ? 0.8 : 1.8);
    await dialog
      .getByRole("button", { name: `Zoom ${zoom}×`, exact: true })
      .click();
    await expect.poll(() => currentZoom(page)).toBe(zoom);
    await expect(
      dialog.getByRole("button", { name: "Stop recording", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.locator(".session-timeline > span:not(.live-take)"),
    ).toHaveCount(index);
    await dialog
      .getByRole("button", { name: "Stop recording", exact: true })
      .click();
    await expect(dialog.locator(".session-timeline > span")).toHaveCount(
      index + 1,
    );
  }
  await expect(
    dialog.getByText("Draft saved on this device.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { cameraZoomFixture: ZoomFixture })
          .cameraZoomFixture.acquisitions.length,
    ),
  ).toBe(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { cameraZoomFixture: ZoomFixture }
      ).cameraZoomFixture.streams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(2);
  await expect(
    dialog.getByText("Your draft is here. Keep filming.", { exact: true }),
  ).toBeVisible();
});
