import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ addListener: vi.fn() }));
vi.mock("@capacitor/app", () => ({ App: native }));
import { watchCaptureActivity } from "../src/lib/capture-lifecycle";

let documentTarget: EventTarget & { hidden: boolean };
let windowTarget: EventTarget;
let callbacks: Record<string, () => void>;
let removals: ReturnType<typeof vi.fn>[];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_NATIVE", "true");
  documentTarget = Object.assign(new EventTarget(), { hidden: false });
  windowTarget = new EventTarget();
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("window", windowTarget);
  callbacks = {};
  removals = [];
  native.addListener.mockImplementation(
    async (name: string, callback: () => void) => {
      callbacks[name] = callback;
      const remove = vi.fn().mockResolvedValue(undefined);
      removals.push(remove);
      return { remove };
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("capture foreground lifecycle", () => {
  it("responds to native background without a WebView visibility event and deduplicates notifications", async () => {
    const change = vi.fn();
    const stop = watchCaptureActivity(change);
    await vi.waitFor(() => expect(removals).toHaveLength(2));
    expect(Object.keys(callbacks)).toEqual(["pause", "resume"]);
    callbacks.pause();
    callbacks.pause();
    expect(change.mock.calls).toEqual([[true], [false]]);
    callbacks.resume();
    expect(change.mock.calls).toEqual([[true], [false], [true]]);
    stop();
    expect(removals.every((remove) => remove.mock.calls.length === 1)).toBe(
      true,
    );
    callbacks.pause();
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("waits for both the native app and the document to return before permitting capture", () => {
    const change = vi.fn();
    const stop = watchCaptureActivity(change);
    callbacks.pause();
    documentTarget.hidden = true;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    callbacks.resume();
    expect(change.mock.calls).toEqual([[true], [false]]);
    documentTarget.hidden = false;
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(change.mock.calls).toEqual([[true], [false], [true]]);
    stop();
  });

  it("keeps the browser independent of native plugins and handles page hide/restore", () => {
    vi.stubEnv("VITE_NATIVE", "false");
    const change = vi.fn();
    const stop = watchCaptureActivity(change);
    windowTarget.dispatchEvent(new Event("pagehide"));
    windowTarget.dispatchEvent(new Event("pageshow"));
    expect(change.mock.calls).toEqual([[true], [false], [true]]);
    expect(native.addListener).not.toHaveBeenCalled();
    stop();
    windowTarget.dispatchEvent(new Event("pagehide"));
    expect(change).toHaveBeenCalledTimes(3);
  });

  it("removes native subscriptions that arrive after unmount", async () => {
    const ready: Array<(value: { remove: () => Promise<void> }) => void> = [];
    native.addListener.mockImplementation(
      () => new Promise((resolve) => ready.push(resolve)),
    );
    const stop = watchCaptureActivity(vi.fn());
    stop();
    const remove = vi.fn().mockResolvedValue(undefined);
    ready.forEach((resolve) => resolve({ remove }));
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
  });
});
