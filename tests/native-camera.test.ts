import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  platform: vi.fn(),
  available: vi.fn(),
  convert: vi.fn(),
  plugin: { start: vi.fn(), stop: vi.fn(), discardRecording: vi.fn() },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: bridge.platform,
    isPluginAvailable: bridge.available,
    convertFileSrc: bridge.convert,
  },
  registerPlugin: () => bridge.plugin,
}));

import {
  readNativeCameraTake,
  usesNativeCamera,
  type NativeCameraTake,
} from "../src/lib/native-camera";

const take: NativeCameraTake = {
  contextId: "test-owner:test-run",
  captureId: "2f00e688-31a4-4bea-a7af-7a061d77ce72",
  recordingId: "b8511aee-28bc-497d-9f84-235c0ad69b55",
  fileUrl:
    "file:///private/var/mobile/Containers/Data/Application/app/Library/Caches/SidequestCamera/take-1.mov",
  durationMs: 2450,
  mimeType: "video/quicktime",
};
const localUrl = `capacitor://localhost/_capacitor_file_${new URL(take.fileUrl).pathname}`;
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  bridge.platform.mockReturnValue("ios");
  bridge.available.mockReturnValue(true);
  bridge.convert.mockImplementation(
    (fileUrl: string) =>
      `capacitor://localhost/_capacitor_file_${new URL(fileUrl).pathname}`,
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function download(blob: Blob) {
  const arrayBuffer = vi.spyOn(blob, "arrayBuffer");
  const body = vi.fn().mockResolvedValue(blob);
  fetchMock.mockResolvedValue({ ok: true, blob: body } as unknown as Response);
  return { arrayBuffer, body };
}

describe("native finalized camera take import", () => {
  it("uses the iOS bridge only when its plugin is actually available", () => {
    expect(usesNativeCamera()).toBe(true);
    expect(bridge.available).toHaveBeenCalledWith("SidequestCamera");
    bridge.available.mockReturnValue(false);
    expect(usesNativeCamera()).toBe(false);
    bridge.platform.mockReturnValue("android");
    bridge.available.mockReturnValue(true);
    expect(usesNativeCamera()).toBe(false);
    expect(bridge.plugin.start).not.toHaveBeenCalled();
  });

  it("materializes every binary byte into a new independently backed recording Blob", async () => {
    const bytes = new Uint8Array([0, 255, 128, 7, 0, 242, 1, 254]);
    const source = new Blob([bytes], { type: "application/octet-stream" });
    const { arrayBuffer } = download(source);
    const imported = await readNativeCameraTake(take);
    expect(imported).not.toBe(source);
    expect(imported.type).toBe("video/quicktime");
    expect(imported.size).toBe(bytes.length);
    expect(new Uint8Array(await imported.arrayBuffer())).toEqual(bytes);
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(bridge.convert).toHaveBeenCalledExactlyOnceWith(take.fileUrl);
    expect(fetchMock).toHaveBeenCalledWith(localUrl, {
      signal: expect.any(AbortSignal),
    });
    expect(bridge.plugin.start).not.toHaveBeenCalled();
    expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
  });

  it("preserves MP4 take bytes and imports an interrupted finalized take", async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    download(new Blob([bytes]));
    const imported = await readNativeCameraTake({
      ...take,
      fileUrl: take.fileUrl.replace(/\.mov$/, ".mp4"),
      mimeType: "video/mp4",
      interrupted: true,
    });
    expect(imported.type).toBe("video/mp4");
    expect(new Uint8Array(await imported.arrayBuffer())).toEqual(bytes);
  });

  it.each(["mov", "mp4"])(
    "imports readable iOS %s media with WebKit's non-HTTP status 0 and no MIME header",
    async (extension) => {
      const bytes = new Uint8Array([0, 255, 128, 7, 0, 242, 1, 254]);
      const source = new Blob([bytes]);
      const { arrayBuffer, body } = download(source);
      fetchMock.mockResolvedValue({
        status: 0,
        ok: false,
        type: "basic",
        blob: body,
      });
      const imported = await readNativeCameraTake({
        ...take,
        fileUrl: take.fileUrl.replace(/\.mov$/, `.${extension}`),
        mimeType: extension === "mp4" ? "video/mp4" : "video/quicktime",
      });
      expect(new Uint8Array(await imported.arrayBuffer())).toEqual(bytes);
      expect(imported.type).toBe(
        extension === "mp4" ? "video/mp4" : "video/quicktime",
      );
      expect(arrayBuffer).toHaveBeenCalledOnce();
      expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
    },
  );

  it("never treats opaque/error, remote, unrelated or non-iOS status 0 as readable camera files", async () => {
    const body = vi.fn().mockResolvedValue(new Blob(["untrusted"]));
    for (const type of ["opaque", "opaqueredirect", "error", undefined]) {
      fetchMock.mockResolvedValue({ status: 0, ok: false, type, blob: body });
      await expect(readNativeCameraTake(take)).rejects.toThrow(
        /could not be read/i,
      );
    }
    fetchMock.mockResolvedValue({
      status: 0,
      ok: false,
      type: "basic",
      blob: body,
    });
    for (const address of [
      `https://example.test/_capacitor_file_${new URL(take.fileUrl).pathname}`,
      localUrl.replace("localhost", "remote"),
      localUrl.replace("take-1.mov", "other.mov"),
      `${localUrl}?redirect=1`,
      `${localUrl}#fragment`,
    ]) {
      bridge.convert.mockReturnValue(address);
      await expect(readNativeCameraTake(take)).rejects.toThrow(
        /could not be read/i,
      );
    }
    bridge.convert.mockReturnValue(localUrl);
    bridge.platform.mockReturnValue("web");
    await expect(readNativeCameraTake(take)).rejects.toThrow(
      /could not be read/i,
    );
    expect(body).not.toHaveBeenCalled();
    expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
  });

  it("rejects external or unrelated paths and link decorations before any file conversion or fetch", async () => {
    for (const fileUrl of [
      "not a url",
      "https://example.test/SidequestCamera/take.mov",
      "capacitor://localhost/SidequestCamera/take.mov",
      "file://remote/SidequestCamera/take.mov",
      "file:///private/cache/OtherCamera/take.mov",
      "file:///private/cache/SidequestCamera/../private.mov",
      `${take.fileUrl}?token=private`,
      `${take.fileUrl}#fragment`,
    ])
      await expect(
        readNativeCameraTake({ ...take, fileUrl }),
      ).rejects.toThrow();
    expect(bridge.convert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects encoded directory escapes and nested paths before reading unrelated native files", async () => {
    for (const path of [
      "../take.mov",
      "%2e%2e%2fprivate.mov",
      "%2E%2E%5Cprivate.mov",
      "subfolder/take.mov",
      "take%00.mov",
    ])
      await expect(
        readNativeCameraTake({
          ...take,
          fileUrl: `file:///private/cache/SidequestCamera/${path}`,
        }),
      ).rejects.toThrow();
    expect(bridge.convert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid recording durations before touching the local file", async () => {
    for (const durationMs of [0, -1, NaN, Infinity, -Infinity])
      await expect(
        readNativeCameraTake({ ...take, durationMs }),
      ).rejects.toThrow();
    expect(bridge.convert).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails on missing file responses without reading or accepting their body", async () => {
    const body = vi.fn();
    fetchMock.mockResolvedValue({ ok: false, status: 404, blob: body });
    await expect(readNativeCameraTake(take)).rejects.toThrow(
      /could not be read/i,
    );
    expect(body).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new TypeError("Local file unavailable"));
    await expect(readNativeCameraTake(take)).rejects.toThrow();
    expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized takes rather than returning a false saved video", async () => {
    const empty = download(new Blob([]));
    await expect(readNativeCameraTake(take)).rejects.toThrow(/size limit/i);
    expect(empty.arrayBuffer).not.toHaveBeenCalled();
    // A real Blob exercises the inclusive byte limit without fabricated size metadata.
    const oversized = download(
      new Blob([new Uint8Array(40 * 1024 * 1024 + 1)]),
    );
    await expect(readNativeCameraTake(take)).rejects.toThrow(/size limit/i);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
  });

  it("preserves a failed binary read for caller recovery instead of returning an empty replacement", async () => {
    const { arrayBuffer } = download(new Blob(["recording"]));
    arrayBuffer.mockRejectedValueOnce(
      new Error("Recorded file backing is gone"),
    );
    await expect(readNativeCameraTake(take)).rejects.toThrow();
    expect(bridge.plugin.discardRecording).not.toHaveBeenCalled();
  });
});
