import { expect, test, type Page } from "@playwright/test";
import { findDefaultQuests } from "./quest-wizard-helpers";

type NativeTake = {
  contextId: string;
  captureId: string;
  recordingId: string;
  fileUrl: string;
  durationMs: number;
  mimeType: string;
  interrupted: boolean;
  recovered?: boolean;
};
type BridgeFixture = {
  calls: { method: string; options?: Record<string, unknown> }[];
  callbacks: Map<string, (value: unknown) => void>;
  files: Map<string, string>;
  issuedTakes: Map<string, NativeTake>;
  reads: string[];
  discarded: string[];
  current?: NativeTake;
  last?: NativeTake;
  captureId: string;
  contextId: string;
  position: "back" | "front";
  zoom: number;
  failures: number;
  failWrites: number;
  discardFailures: number;
  seedRecovery: boolean;
  failStart: boolean;
  deferStart: boolean;
  deferStop: boolean;
  deferFlip: boolean;
  resolveStart?: () => void;
  rejectStart?: () => void;
  resolveStop?: () => void;
  resolveFlip?: () => void;
  emit: (name: string, value: unknown) => void;
};

// Exercise the real Capacitor registerPlugin/proxy boundary and the real
// Capture/IndexedDB draft pipeline. This does not pretend Chromium can run
// AVFoundation: only the native promise/event/file bridge is substituted.
async function nativeBridge(
  page: Page,
  options: {
    deferStart?: boolean;
    deferStop?: boolean;
    failStart?: boolean;
    deferFlip?: boolean;
    seedRecovery?: boolean;
  } = {},
) {
  await page.addInitScript((configuration) => {
    const callbacks = new Map<string, (value: unknown) => void>();
    const state: BridgeFixture = {
      calls: [],
      callbacks,
      files: new Map(),
      issuedTakes: new Map(),
      reads: [],
      discarded: [],
      captureId: "",
      contextId: "",
      position: "back",
      zoom: 1,
      failures: 0,
      failWrites: 0,
      discardFailures: 0,
      seedRecovery: Boolean(configuration.seedRecovery),
      failStart: Boolean(configuration.failStart),
      deferStart: Boolean(configuration.deferStart),
      deferStop: Boolean(configuration.deferStop),
      deferFlip: Boolean(configuration.deferFlip),
      emit(name, value) {
        for (const [id, callback] of callbacks)
          if (id.startsWith(`${name}:`)) callback(value);
      },
    };
    const fixtureWindow = window as unknown as {
      nativeCameraFixture: BridgeFixture;
      webkit: { messageHandlers: { bridge: object } };
      Capacitor: object;
    };
    fixtureWindow.nativeCameraFixture = state;
    fixtureWindow.webkit = { messageHandlers: { bridge: {} } };
    const cameraState = () => ({
      captureId: state.captureId,
      position: state.position,
      zoom: state.zoom,
      minZoom: state.position === "back" ? 0.5 : 1,
      maxZoom: 4,
      presets: state.position === "back" ? [0.5, 1] : [1],
      torchAvailable: state.position === "back",
      canFlip: true,
    });
    let callbackId = 0;
    let takeId = 0;
    fixtureWindow.Capacitor = {
      PluginHeaders: [
        {
          name: "SidequestCamera",
          methods: [
            ...[
              "start",
              "updatePreview",
              "setZoom",
              "flip",
              "setTorch",
              "startRecording",
              "stopRecording",
              "discardRecording",
              "stop",
              "removeListener",
              "recoverRecordings",
              "clearRecordings",
            ].map((name) => ({ name, rtype: "promise" })),
            { name: "addListener", rtype: "callback" },
          ],
        },
      ],
      convertFileSrc(fileUrl: string) {
        return `${location.origin}/native-camera-fixture/${encodeURIComponent(fileUrl)}`;
      },
      nativeCallback(
        plugin: string,
        method: string,
        args: { eventName: string },
        callback: (value: unknown) => void,
      ) {
        if (plugin !== "SidequestCamera" || method !== "addListener")
          throw new Error("Unexpected native callback");
        const id = `${args.eventName}:${++callbackId}`;
        callbacks.set(id, callback);
        return Promise.resolve(id);
      },
      async nativePromise(
        plugin: string,
        method: string,
        args?: Record<string, unknown>,
      ) {
        if (plugin !== "SidequestCamera")
          throw new Error(`Unexpected native plugin ${plugin}`);
        state.calls.push({ method, options: args });
        if (method === "removeListener") {
          callbacks.delete(String(args?.callbackId));
          return;
        }
        if (method === "start") {
          if (state.failStart) {
            state.failStart = false;
            throw new Error(
              "The live camera preview did not start. Try again.",
            );
          }
          state.captureId = String(args?.captureId);
          state.contextId = String(args?.contextId);
          state.position = args?.position === "front" ? "front" : "back";
          state.zoom = 1;
          return cameraState();
        }
        if (method === "flip") {
          state.position = state.position === "back" ? "front" : "back";
          state.zoom = 1;
          if (state.deferFlip)
            return new Promise<ReturnType<typeof cameraState>>((resolve) => {
              state.resolveFlip = () => resolve(cameraState());
            });
          return cameraState();
        }
        if (method === "setZoom") {
          state.zoom = Number(args?.zoom);
          return cameraState();
        }
        if (method === "setTorch") return cameraState();
        if (method === "startRecording") {
          const fileUrl = `file:///private/var/mobile/app/tmp/SidequestCamera/take-${++takeId}.mov`;
          state.current = {
            contextId: state.contextId,
            captureId: state.captureId,
            recordingId: String(args?.recordingId),
            fileUrl,
            durationMs: 6_000,
            mimeType: "video/quicktime",
            interrupted: false,
          };
          state.last = undefined;
          state.files.set(
            fileUrl,
            `Native take ${takeId}: preserved video bytes`,
          );
          state.issuedTakes.set(fileUrl, state.current);
          if (state.deferStart)
            return new Promise<void>((resolve, reject) => {
              state.resolveStart = resolve;
              state.rejectStart = () =>
                reject(new Error("Recording ended before it could start."));
            });
          return;
        }
        if (method === "stopRecording") {
          const take = state.current ?? state.last;
          if (!take) throw new Error("There is no recorded take to save.");
          state.last = take;
          if (state.deferStop)
            return new Promise<NativeTake>((resolve) => {
              state.resolveStop = () => resolve(take);
            });
          return take;
        }
        if (method === "discardRecording") {
          const fileUrl = String(args?.fileUrl);
          if (state.discardFailures > 0) {
            state.discardFailures--;
            throw new Error("The temporary recording could not be removed.");
          }
          state.discarded.push(fileUrl);
          state.files.delete(fileUrl);
          return;
        }
        if (method === "clearRecordings") {
          state.files.clear();
          state.issuedTakes.clear();
          state.current = undefined;
          state.last = undefined;
          return;
        }
        if (method === "recoverRecordings") {
          const contextId = String(args?.contextId);
          if (state.seedRecovery) {
            state.seedRecovery = false;
            const fileUrl =
              "file:///private/var/mobile/app/tmp/SidequestCamera/recovered-take.mov";
            state.files.set(fileUrl, "Recovered native take: original bytes");
            state.issuedTakes.set(fileUrl, {
              contextId,
              captureId: "82e8f2d2-8dc2-4424-a63f-d454cfadfd02",
              recordingId: "7b8716b4-2e76-49a6-bb3a-9a3f6edb36cc",
              fileUrl,
              durationMs: 6000,
              mimeType: "video/quicktime",
              interrupted: true,
              recovered: true,
            });
            const foreignFile =
              "file:///private/var/mobile/app/tmp/SidequestCamera/other-quest.mov";
            state.files.set(foreignFile, "Another quest must stay private");
            state.issuedTakes.set(foreignFile, {
              contextId: "another-owner:another-quest",
              captureId: "54b8e2c1-a376-4bdc-9d71-bde4008a0e6e",
              recordingId: "405435ca-c458-46fc-ad91-c375ac46af03",
              fileUrl: foreignFile,
              durationMs: 6000,
              mimeType: "video/quicktime",
              interrupted: true,
              recovered: true,
            });
          }
          return {
            takes: [...state.issuedTakes.values()].filter(
              (take) =>
                take.contextId === contextId && state.files.has(take.fileUrl),
            ),
          };
        }
      },
    };
    // A native recording must never create an additional WebRTC camera session.
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error("Native capture attempted getUserMedia");
    };
    const putNormally = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = putNormally.apply(this, args);
      if (state.failWrites > 0 && this.name === "drafts") {
        state.failWrites--;
        this.transaction.abort();
      }
      return request;
    };
    const fetchNormally = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const address = input instanceof Request ? input.url : String(input);
      if (!address.includes("/native-camera-fixture/"))
        return fetchNormally(input, init);
      const fileUrl = decodeURIComponent(
        address.split("/native-camera-fixture/")[1],
      );
      state.reads.push(fileUrl);
      if (state.failures > 0) {
        state.failures--;
        return new Response("not ready", { status: 503 });
      }
      const bytes = state.files.get(fileUrl);
      return bytes === undefined
        ? new Response("missing", { status: 404 })
        : new Response(new Blob([bytes], { type: "video/quicktime" }));
    };
  }, options);
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
  return page.getByRole("dialog", { name: "Record your quest" });
}

async function calls(page: Page, method: string) {
  return page.evaluate(
    (name) =>
      (
        window as unknown as { nativeCameraFixture: BridgeFixture }
      ).nativeCameraFixture.calls.filter((call) => call.method === name),
    method,
  );
}

async function draftBytes(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("sidequest-private-capture-drafts", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const drafts = await new Promise<
        { takes?: { file: Blob; duration: number }[] }[]
      >((resolve, reject) => {
        const request = db.transaction("drafts").objectStore("drafts").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return Promise.all(
        drafts
          .flatMap((draft) => draft.takes ?? [])
          .map(async (take) => ({
            duration: take.duration,
            text: await take.file.text(),
          })),
      );
    } finally {
      db.close();
    }
  });
}

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test("quick hold/release waits for native recording startup, then copies the finalized take and restores web appearance on exit", async ({
  page,
}) => {
  await nativeBridge(page, { deferStart: true });
  const dialog = await openCapture(page);
  const shutter = dialog.getByRole("button", {
    name: "Hold to record",
    exact: true,
  });
  await expect(shutter).toBeEnabled();
  await expect(page.locator("html")).toHaveClass(/native-camera-active/);
  expect(
    await dialog.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe("rgba(0, 0, 0, 0)");
  await shutter.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
  });
  await shutter.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
  });
  await expect
    .poll(async () => (await calls(page, "startRecording")).length)
    .toBe(1);
  expect(await calls(page, "stopRecording")).toHaveLength(0);
  await expect(shutter).toBeDisabled();
  await page.evaluate(() =>
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.resolveStart?.(),
  );
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await calls(page, "stopRecording")).toHaveLength(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(await calls(page, "discardRecording")).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveClass(/native-camera-active/);
  await expect.poll(async () => (await calls(page, "stop")).length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { nativeCameraFixture: BridgeFixture })
            .nativeCameraFixture.callbacks.size,
      ),
    )
    .toBe(0);
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
});

test("background interruption and duplicate promise/event completion preserve a take exactly once without automatic recording on return", async ({
  page,
}) => {
  await nativeBridge(page, { deferStop: true });
  const dialog = await openCapture(page);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect
    .poll(async () => (await calls(page, "startRecording")).length)
    .toBe(1);
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.current!.interrupted = true;
    state.emit("interrupted", {
      message: "Camera paused. Your saved takes are kept.",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(async () => (await calls(page, "stopRecording")).length)
    .toBe(1);
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.emit("recordingStopped", state.current!);
    state.resolveStop?.();
  });
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await expect.poll(async () => (await calls(page, "stop")).length).toBe(1);
  await expect(page.locator("html")).not.toHaveClass(/native-camera-active/);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(await calls(page, "discardRecording")).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    dialog.getByRole("button", { name: "Continue recording", exact: true }),
  ).toBeEnabled();
  expect(await calls(page, "startRecording")).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  expect(await calls(page, "startRecording")).toHaveLength(1);
});

test("failed native file copy retains the original, blocks leaving and rerecording, and retries without losing earlier takes", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  const start = dialog.getByRole("button", {
    name: "Or tap to start recording",
    exact: true,
  });
  await start.click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await page.evaluate(() => {
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.failures = 1;
  });
  await start.click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  const retry = dialog.getByRole("button", {
    name: "Retry saving take",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByLabel("Import video")).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect(await calls(page, "discardRecording")).toHaveLength(1);
  expect(await draftBytes(page)).toHaveLength(1);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(2);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
    { duration: 6, text: "Native take 2: preserved video bytes" },
  ]);
  expect(await calls(page, "discardRecording")).toHaveLength(2);
});

test("an interrupted playable take arriving after startup rejection is kept instead of orphaned", async ({
  page,
}) => {
  await nativeBridge(page, { deferStart: true });
  const dialog = await openCapture(page);
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect
    .poll(async () => (await calls(page, "startRecording")).length)
    .toBe(1);
  await page.evaluate(() =>
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.rejectStart?.(),
  );
  await expect(dialog.getByRole("alert")).toContainText(
    "Recording ended before it could start.",
  );
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.current!.interrupted = true;
    state.emit("recordingStopped", state.current!);
  });
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(await calls(page, "discardRecording")).toHaveLength(1);
});

test("failed draft storage retries the prepared native bytes without appending or reading the take twice", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  await page.evaluate(() => {
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.failWrites = 1;
  });
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  const retry = dialog.getByRole("button", {
    name: "Retry saving take",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  expect(await draftBytes(page)).toEqual([]);
  expect(await calls(page, "discardRecording")).toHaveLength(0);
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.reads,
    ),
  ).toHaveLength(1);
  expect(await calls(page, "discardRecording")).toHaveLength(1);
});

test("stale capture events cannot restore preview or attach a prior quest take, and old take events cannot end a newer recording", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.emit("interrupted", { message: "Camera paused." });
    state.emit("cameraReady", {
      captureId: "unrelated-capture",
      position: "back",
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 4,
      presets: [0.5, 1],
      torchAvailable: true,
      canFlip: true,
    });
    state.emit("recordingStopped", {
      captureId: "unrelated-capture",
      recordingId: "old-take",
      fileUrl:
        "file:///private/var/mobile/app/tmp/SidequestCamera/old-take.mov",
      durationMs: 6000,
      mimeType: "video/quicktime",
      interrupted: true,
    });
  });
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Start preview", exact: true }),
  ).toBeVisible();
  expect(await draftBytes(page)).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.reads,
    ),
  ).toHaveLength(0);
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.emit("cameraReady", {
      captureId: state.captureId,
      position: "back",
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 4,
      presets: [0.5, 1],
      torchAvailable: true,
      canFlip: true,
    });
  });
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await page.evaluate(() => {
    const state = (window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture;
    state.last = { ...state.current! };
  });
  // The fixture's startRecording clears last, just as the native plugin does.
  const earlier = await page.evaluate(() => ({
    ...(window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture.current!,
  }));
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await page.evaluate(
    (take) =>
      (
        window as unknown as { nativeCameraFixture: BridgeFixture }
      ).nativeCameraFixture.emit("recordingStopped", take),
    earlier,
  );
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.locator(".session-timeline > span:not(.live-take)"),
  ).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(2);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
    { duration: 6, text: "Native take 2: preserved video bytes" },
  ]);
});

test("native preview startup failure restores opaque app styling and can reopen without a second recording engine", async ({
  page,
}) => {
  await nativeBridge(page, { failStart: true });
  const dialog = await openCapture(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "The live camera preview did not start.",
  );
  await expect(page.locator("html")).not.toHaveClass(/native-camera-active/);
  await expect(dialog.getByLabel("Import video")).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Open camera", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("html")).toHaveClass(/native-camera-active/);
  expect(await calls(page, "start")).toHaveLength(2);
  expect(await calls(page, "startRecording")).toHaveLength(0);
  expect(await calls(page, "stop")).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await expect(page.locator("html")).not.toHaveClass(/native-camera-active/);
});

test("native lens buttons change capture zoom while recording, and Flip resets lens choices only after recording pauses", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  const wide = dialog.getByRole("button", { name: "Zoom 0.5×", exact: true });
  const flip = dialog.getByRole("button", { name: "Flip camera", exact: true });
  await expect(wide).toBeEnabled();
  await wide.click();
  await expect(wide).toHaveAttribute("aria-pressed", "true");
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await expect(flip).toBeDisabled();
  await dialog.getByRole("button", { name: "Zoom 1×", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Stop recording", exact: true }),
  ).toBeVisible();
  expect(
    (await calls(page, "setZoom")).map((call) => call.options?.zoom),
  ).toEqual([0.5, 1]);
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(flip).toBeEnabled();
  await flip.click();
  await expect(wide).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Zoom 1×", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await flip.click();
  await expect(wide).toBeEnabled();
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(await calls(page, "flip")).toHaveLength(2);
  expect(await calls(page, "startRecording")).toHaveLength(1);
});

test("recording waits for the opposite native camera preview to finish flipping", async ({
  page,
}) => {
  await nativeBridge(page, { deferFlip: true });
  const dialog = await openCapture(page);
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Flip camera", exact: true })
    .click();
  await expect.poll(async () => (await calls(page, "flip")).length).toBe(1);
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", {
      name: "Or tap to start recording",
      exact: true,
    }),
  ).toBeDisabled();
  expect(await calls(page, "startRecording")).toHaveLength(0);
  await page.evaluate(() =>
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.resolveFlip?.(),
  );
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Zoom 0.5×", exact: true }),
  ).toHaveCount(0);
});

test("discarding an unsaved native take keeps all earlier durable takes and makes recording available again", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  const start = dialog.getByRole("button", {
    name: "Or tap to start recording",
    exact: true,
  });
  await start.click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await page.evaluate(() => {
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.failures = 100;
  });
  await start.click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  const discard = dialog.getByRole("button", {
    name: "Discard unsaved take",
    exact: true,
  });
  await expect(discard).toBeEnabled();
  page.once("dialog", (confirmation) => confirmation.accept());
  await discard.click();
  await expect(discard).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(await calls(page, "discardRecording")).toHaveLength(2);
});

test("an earlier Capture's retained take is recovered into only its owner and quest before opening another camera", async ({
  page,
}) => {
  await nativeBridge(page, { seedRecovery: true });
  const dialog = await openCapture(page);
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Recovered native take: original bytes" },
  ]);
  const recoveryCalls = await calls(page, "recoverRecordings");
  expect(recoveryCalls).toHaveLength(1);
  expect(recoveryCalls[0].options?.contextId).toEqual(
    expect.stringContaining("demo:"),
  );
  expect(
    await page.evaluate(() => [
      ...(
        window as unknown as { nativeCameraFixture: BridgeFixture }
      ).nativeCameraFixture.files.values(),
    ]),
  ).toContain("Another quest must stay private");
  expect(await calls(page, "discardRecording")).toHaveLength(1);
  expect(await calls(page, "startRecording")).toHaveLength(0);
});

test("a saved take whose native file cleanup failed is not appended twice when Capture is reopened", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  await page.evaluate(() => {
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.discardFailures = 1;
  });
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.files.size,
    ),
  ).toBe(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { nativeCameraFixture: BridgeFixture })
            .nativeCameraFixture.files.size,
      ),
    )
    .toBe(0);
  expect(await draftBytes(page)).toEqual([
    { duration: 6, text: "Native take 1: preserved video bytes" },
  ]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.reads,
    ),
  ).toHaveLength(1);
  expect(await calls(page, "discardRecording")).toHaveLength(2);
});

test("sign-out cleanup removes durable drafts and retained native recordings so a later Capture cannot restore them", async ({
  page,
}) => {
  await nativeBridge(page);
  const dialog = await openCapture(page);
  await page.evaluate(() => {
    (
      window as unknown as { nativeCameraFixture: BridgeFixture }
    ).nativeCameraFixture.discardFailures = 1;
  });
  await dialog
    .getByRole("button", { name: "Or tap to start recording", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(1);
  expect(await draftBytes(page)).toHaveLength(1);
  const priorTake = await page.evaluate(() => ({
    ...(window as unknown as { nativeCameraFixture: BridgeFixture })
      .nativeCameraFixture.current!,
  }));
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.files.size,
    ),
  ).toBe(1);
  await dialog
    .getByRole("button", { name: "Exit capture", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  // Use the same cleanup entry point the real auth identity-change handler calls.
  // The demo has no Supabase session to sign out; neither draft storage nor the
  // Capacitor plugin/proxy is stubbed at this call site.
  await page.evaluate(async () => {
    const modulePath = "/src/lib/capture-drafts.ts";
    const drafts = await import(modulePath);
    await drafts.clearCaptureDrafts();
  });
  expect(await calls(page, "clearRecordings")).toHaveLength(1);
  expect(await draftBytes(page)).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.files.size,
    ),
  ).toBe(0);
  await page
    .getByRole("button", {
      name: /^(Continue recording|Record or import video)$/,
    })
    .first()
    .click();
  await expect(
    dialog.getByRole("button", { name: "Hold to record", exact: true }),
  ).toBeEnabled();
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(0);
  await page.evaluate(
    (take) =>
      (
        window as unknown as { nativeCameraFixture: BridgeFixture }
      ).nativeCameraFixture.emit("recordingStopped", take),
    priorTake,
  );
  await expect(dialog.locator(".session-timeline > span")).toHaveCount(0);
  expect(await draftBytes(page)).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeCameraFixture: BridgeFixture })
          .nativeCameraFixture.reads,
    ),
  ).toHaveLength(1);
});
