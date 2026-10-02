import { describe, expect, it, vi } from "vitest";
import {
  materializeCaptureDraft,
  type CaptureDraft,
} from "../src/lib/capture-drafts";

function draft(
  file = new Blob(["first take"], { type: "video/mp4" }),
): CaptureDraft {
  return {
    owner: "owner-one",
    run: "run-one",
    slot: 3,
    baseClipId: "existing-session",
    file,
    duration: 7.3,
    start: 0,
    end: 7.3,
    fit: "fill",
    crop: 0.3,
    mute: true,
    caption: "Our quest",
    source: "camera",
    updatedAt: 123456,
  };
}

describe("restored capture draft media", () => {
  it("copies each unique Blob's bytes once and preserves ownership, take order and overlay metadata", async () => {
    const first = new Blob([new Uint8Array([0, 4, 255, 3])], {
      type: "video/mp4;codecs=avc1.42e01e",
    });
    const second = new Blob(["second take"], { type: "video/webm" });
    const photo = new Blob([new Uint8Array([255, 216, 255])], {
      type: "image/jpeg",
    });
    const reads = [first, second, photo].map((file) =>
      vi.spyOn(file, "arrayBuffer"),
    );
    const saved: CaptureDraft = {
      ...draft(first),
      takes: [
        { file: first, duration: 3.1 },
        { file: second, duration: 4.2 },
      ],
      overlay: { file: photo, position: "center" },
    };
    const restored = await materializeCaptureDraft(saved);

    expect(restored).toEqual({
      ...saved,
      file: expect.any(Blob),
      takes: saved.takes!.map((take) => ({ ...take, file: expect.any(Blob) })),
      overlay: { ...saved.overlay, file: expect.any(Blob) },
    });
    expect(restored).not.toBe(saved);
    expect(restored.file).not.toBe(first);
    expect(restored.file).toBe(restored.takes![0].file);
    expect(restored.takes![1].file).not.toBe(second);
    expect(restored.overlay!.file).not.toBe(photo);
    expect(restored.takes).not.toBe(saved.takes);
    expect(restored.overlay).not.toBe(saved.overlay);
    expect(saved.file).toBe(first);
    expect(saved.takes![1].file).toBe(second);
    reads.forEach((read) => expect(read).toHaveBeenCalledTimes(1));
    const copies = [
      restored.file,
      restored.takes![1].file,
      restored.overlay!.file,
    ];
    const originals = [first, second, photo];
    for (let index = 0; index < copies.length; index++) {
      expect(copies[index].type).toBe(originals[index].type);
      expect(copies[index].size).toBe(originals[index].size);
      expect(await copies[index].arrayBuffer()).toEqual(
        await originals[index].arrayBuffer(),
      );
    }
  });

  it("restores a legacy single-file draft without adding takes or changing its metadata", async () => {
    const saved = draft();
    const restored = await materializeCaptureDraft(saved);
    expect(restored).toEqual(saved);
    expect(restored.file).not.toBe(saved.file);
    expect(await restored.file.text()).toBe("first take");
    expect(restored.takes).toBeUndefined();
    expect(restored.overlay).toBeUndefined();
  });

  it("rejects oversized, empty, or excessive media before reading bytes", async () => {
    const large = new Blob([new Uint8Array(40 * 1024 * 1024 + 1)]);
    const read = vi.spyOn(large, "arrayBuffer");
    await expect(materializeCaptureDraft(draft(large))).rejects.toThrow(
      "could not be restored",
    );
    expect(read).not.toHaveBeenCalled();
    await expect(materializeCaptureDraft(draft(new Blob()))).rejects.toThrow();
    const saved = draft();
    await expect(
      materializeCaptureDraft({
        ...saved,
        takes: Array.from({ length: 31 }, () => ({
          file: saved.file,
          duration: 1,
        })),
      }),
    ).rejects.toThrow();
    await expect(
      materializeCaptureDraft({
        ...saved,
        overlay: {
          file: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
          position: "center",
        },
      }),
    ).rejects.toThrow();
  });

  it("propagates unreadable backing-file errors without replacing the original draft", async () => {
    const saved = draft();
    const original = saved.file;
    const error = new DOMException(
      "The saved file is unreadable",
      "NotReadableError",
    );
    vi.spyOn(original, "arrayBuffer").mockRejectedValue(error);
    await expect(materializeCaptureDraft(saved)).rejects.toBe(error);
    expect(saved.file).toBe(original);
  });

  it("rejects a truncated backing-file read instead of returning corrupt footage", async () => {
    const saved = draft();
    vi.spyOn(saved.file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(1));
    await expect(materializeCaptureDraft(saved)).rejects.toThrow(
      "could not be restored",
    );
    expect(saved.file.size).toBe(10);
  });
});
