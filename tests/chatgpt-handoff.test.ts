import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_PROFILE_PROMPT } from "../shared/profile";

const bridge = vi.hoisted(() => ({ openChatGPT: vi.fn() }));
const native = vi.hoisted(() => vi.fn(() => true));
const copy = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({ registerPlugin: () => bridge }));
vi.mock("../src/lib/runtime", () => ({ isNativeApp: native }));
vi.mock("../src/lib/native-share", () => ({ copyText: copy }));

import {
  CHATGPT_URL,
  copyPromptAndOpenChatGPT,
  openChatGPT,
} from "../src/lib/chatgpt-handoff";

function browserWindow() {
  const popup = {
    opener: {} as unknown,
    closed: false,
    close: vi.fn(),
    location: { replace: vi.fn() },
  };
  const open = vi.fn(() => popup);
  vi.stubGlobal("window", { open });
  return { popup, open };
}

beforeEach(() => {
  vi.resetAllMocks();
  native.mockReturnValue(true);
  copy.mockResolvedValue(undefined);
  bridge.openChatGPT.mockResolvedValue({ destination: "app" });
});
afterEach(() => vi.unstubAllGlobals());

describe("ChatGPT prompt handoff", () => {
  it("copies the exact reviewed prompt before launching the installed-app handoff", async () => {
    let copied!: () => void;
    copy.mockImplementation(
      () => new Promise<void>((resolve) => (copied = resolve)),
    );
    const pending = copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT);
    expect(copy).toHaveBeenCalledWith(COPY_PROFILE_PROMPT);
    expect(bridge.openChatGPT).not.toHaveBeenCalled();
    copied();
    expect(await pending).toEqual({
      copied: true,
      opened: "app",
      failure: null,
      message:
        "Prompt copied. Paste it into ChatGPT, then bring your summary back here.",
    });
    // Native launch accepts no destination, prompt, profile or credentials.
    expect(bridge.openChatGPT).toHaveBeenCalledWith();
  });

  it("reports the OS-selected external website fallback without claiming an app launch", async () => {
    bridge.openChatGPT.mockResolvedValue({ destination: "web" });
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: true,
      opened: "web",
      failure: null,
    });
    expect(bridge.openChatGPT).toHaveBeenCalledOnce();
  });

  it("leaves the user in the form when copying fails and explains manual copying", async () => {
    copy.mockRejectedValue(new Error("Private clipboard diagnostic"));
    const result = await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT);
    expect(result).toMatchObject({
      copied: false,
      opened: false,
      failure: "clipboard",
    });
    expect(result.message).toContain("Select and copy the prompt below");
    expect(result.message).not.toContain("diagnostic");
    expect(bridge.openChatGPT).not.toHaveBeenCalled();
  });

  it("preserves successful copying when native launch fails", async () => {
    bridge.openChatGPT.mockRejectedValue(new Error("Plugin unavailable"));
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: true,
      opened: false,
      failure: "launch",
      message:
        "Prompt copied. ChatGPT could not open. Open it yourself and paste the prompt.",
    });
    expect(copy).toHaveBeenCalledOnce();
  });

  it("refuses to report success for an unrecognized native result", async () => {
    bridge.openChatGPT.mockResolvedValue({ destination: "unrecognized" });
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: true,
      opened: false,
      failure: "launch",
    });
  });

  it("reserves a browser tab during the gesture but navigates only after copying", async () => {
    native.mockReturnValue(false);
    const { popup, open } = browserWindow();
    let copied!: () => void;
    copy.mockImplementation(
      () => new Promise<void>((resolve) => (copied = resolve)),
    );
    const pending = copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT);
    expect(open).toHaveBeenCalledExactlyOnceWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    expect(popup.location.replace).not.toHaveBeenCalled();
    copied();
    expect(await pending).toMatchObject({
      copied: true,
      opened: "web",
      failure: null,
    });
    expect(popup.location.replace).toHaveBeenCalledExactlyOnceWith(CHATGPT_URL);
    expect(CHATGPT_URL).toBe("https://chatgpt.com/");
    expect(new URL(CHATGPT_URL).search).toBe("");
    expect(new URL(CHATGPT_URL).hash).toBe("");
    expect(bridge.openChatGPT).not.toHaveBeenCalled();
  });

  it("closes the blank browser tab when copying fails", async () => {
    native.mockReturnValue(false);
    const { popup } = browserWindow();
    copy.mockRejectedValue(new Error("Clipboard blocked"));
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: false,
      failure: "clipboard",
    });
    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it("reports a blocked popup separately while leaving the copied prompt available", async () => {
    native.mockReturnValue(false);
    vi.stubGlobal("window", { open: vi.fn(() => null) });
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: true,
      opened: false,
      failure: "launch",
    });
    expect(copy).toHaveBeenCalledWith(COPY_PROFILE_PROMPT);
  });

  it("does not claim navigation when the reserved browser tab was closed", async () => {
    native.mockReturnValue(false);
    const { popup } = browserWindow();
    popup.closed = true;
    expect(await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT)).toMatchObject({
      copied: true,
      failure: "launch",
    });
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it("opens an explicit native retry without overwriting the clipboard", async () => {
    expect(await openChatGPT()).toBe("app");
    expect(bridge.openChatGPT).toHaveBeenCalledWith();
    expect(copy).not.toHaveBeenCalled();
    bridge.openChatGPT.mockRejectedValue(new Error("Cannot launch"));
    await expect(openChatGPT()).rejects.toThrow(
      "ChatGPT could not open. Open it yourself and paste the prompt.",
    );
  });

  it("opens an explicit website retry without overwriting the clipboard", async () => {
    native.mockReturnValue(false);
    const { popup } = browserWindow();
    expect(await openChatGPT()).toBe("web");
    expect(popup.location.replace).toHaveBeenCalledWith(CHATGPT_URL);
    expect(popup.opener).toBeNull();
    expect(copy).not.toHaveBeenCalled();
  });
});
