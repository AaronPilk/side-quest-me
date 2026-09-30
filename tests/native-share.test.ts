import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => vi.fn(() => false));
const clipboardWrite = vi.hoisted(() => vi.fn());
const share = vi.hoisted(() => vi.fn());
const files = vi.hoisted(() => ({
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  getUri: vi.fn(),
  readdir: vi.fn(),
  deleteFile: vi.fn(),
}));
vi.mock("../src/lib/runtime", () => ({ isNativeApp: native }));
vi.mock("@capacitor/clipboard", () => ({
  Clipboard: { write: clipboardWrite },
}));
vi.mock("@capacitor/share", () => ({ Share: { share } }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: files,
  Directory: { Cache: "CACHE" },
}));

import {
  cleanupNativeShareCache,
  copyText,
  exportVideoFile,
  isShareCancellation,
  sharePublicLink,
} from "../src/lib/native-share";

beforeEach(() => {
  vi.resetAllMocks();
  native.mockReturnValue(false);
  share.mockResolvedValue({ activityType: "" });
  files.readdir.mockResolvedValue({ files: [] });
  files.writeFile.mockResolvedValue({ uri: "file:///cache/reel.mp4" });
  files.appendFile.mockResolvedValue(undefined);
  files.getUri.mockResolvedValue({ uri: "file:///cache/reel.mp4" });
  files.deleteFile.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("native and browser sharing", () => {
  it("uses the native clipboard without requiring navigator.clipboard", async () => {
    native.mockReturnValue(true);
    vi.stubGlobal("navigator", {});
    await copyText("Only this user-selected text");
    expect(clipboardWrite).toHaveBeenCalledWith({
      string: "Only this user-selected text",
    });
  });

  it("preserves browser link sharing and copy fallback", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const link = {
      title: "A quest",
      url: "https://sidequest.example/quests/1",
    };
    expect(await sharePublicLink(link)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(link.url);
    const browserShare = vi.fn();
    vi.stubGlobal("navigator", { share: browserShare });
    expect(await sharePublicLink(link)).toBe("shared");
    expect(browserShare).toHaveBeenCalledWith(link);
    expect(share).not.toHaveBeenCalled();
  });

  it("opens the native share sheet with the supplied public link", async () => {
    native.mockReturnValue(true);
    const link = {
      title: "A creator",
      url: "https://sidequest.example/creators/1",
    };
    expect(await sharePublicLink(link)).toBe("shared");
    expect(share).toHaveBeenCalledWith(link);
    expect(clipboardWrite).not.toHaveBeenCalled();
  });

  it("writes complete binary chunks to private cache and shares its file URL", async () => {
    native.mockReturnValue(true);
    const bytes = new Uint8Array(1024 * 1024 + 11);
    bytes[0] = 254;
    bytes[1024 * 1024] = 129;
    bytes[bytes.length - 1] = 255;
    await exportVideoFile(new File([bytes], "sidequest-reel.mp4"), {
      title: "My quest",
    });
    const first = files.writeFile.mock.calls[0][0];
    const second = files.appendFile.mock.calls[0][0];
    expect(first.path).toMatch(
      /^sidequest-shares\/\d+-[a-f0-9-]+-sidequest-reel\.mp4$/,
    );
    expect(first.directory).toBe("CACHE");
    expect(first.recursive).toBe(true);
    expect(second.path).toBe(first.path);
    expect(
      Buffer.concat([
        Buffer.from(first.data, "base64"),
        Buffer.from(second.data, "base64"),
      ]),
    ).toEqual(Buffer.from(bytes));
    expect(share).toHaveBeenCalledWith({
      title: "My quest",
      files: ["file:///cache/reel.mp4"],
    });
    // The receiving app can keep reading after the sheet closes.
    expect(files.deleteFile).not.toHaveBeenCalled();
  });

  it("keeps an open share's file and removes it only after cancellation", async () => {
    native.mockReturnValue(true);
    let cancel!: (reason: unknown) => void;
    share.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          cancel = reject;
        }),
    );
    const exporting = exportVideoFile(new File(["mp4"], "reel.mp4"), {
      title: "My quest",
    });
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    expect(files.deleteFile).not.toHaveBeenCalled();
    const error = new Error("Share canceled");
    cancel(error);
    await expect(exporting).rejects.toBe(error);
    expect(isShareCancellation(error)).toBe(true);
    expect(files.deleteFile).toHaveBeenCalledWith({
      path: files.writeFile.mock.calls[0][0].path,
      directory: "CACHE",
    });
  });

  it("does not report export success after a native disk failure", async () => {
    native.mockReturnValue(true);
    files.writeFile.mockRejectedValue(new Error("Not enough storage"));
    await expect(
      exportVideoFile(new File(["mp4"], "reel.mp4"), { title: "My quest" }),
    ).rejects.toThrow("Not enough storage");
    expect(share).not.toHaveBeenCalled();
    expect(files.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("removes only expired Sidequest exports during housekeeping", async () => {
    native.mockReturnValue(true);
    const now = 2_000_000_000_000;
    const oldName = `${now - 25 * 60 * 60 * 1000}-abcdef-reel.mp4`;
    files.readdir.mockResolvedValue({
      files: [
        { name: oldName, type: "file" },
        { name: `${now}-abcdef-recent.mp4`, type: "file" },
        { name: "other-data.mp4", type: "file" },
        {
          name: `${now - 25 * 60 * 60 * 1000}-abcdef-directory`,
          type: "directory",
        },
      ],
    });
    await cleanupNativeShareCache(now);
    expect(files.deleteFile).toHaveBeenCalledExactlyOnceWith({
      path: `sidequest-shares/${oldName}`,
      directory: "CACHE",
    });
  });

  it("preserves browser downloads without using the native filesystem", async () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reel");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    await exportVideoFile(new File(["mp4"], "reel.mp4"), { title: "My quest" });
    expect(link).toMatchObject({ href: "blob:reel", download: "reel.mp4" });
    expect(link.click).toHaveBeenCalledOnce();
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30000);
    expect(revoke).toHaveBeenCalledWith("blob:reel");
  });
});
