import { registerPlugin } from "@capacitor/core";
import { copyText } from "./native-share";
import { isNativeApp } from "./runtime";

export const CHATGPT_URL = "https://chatgpt.com/";

interface ChatGPTLauncher {
  openChatGPT(): Promise<{ destination: "app" | "web" }>;
}
const nativeLauncher = registerPlugin<ChatGPTLauncher>("SidequestPlaces");

export type ChatGPTHandoffResult =
  | { copied: false; opened: false; failure: "clipboard"; message: string }
  | { copied: true; opened: false; failure: "launch"; message: string }
  | {
      copied: true;
      opened: "app" | "web";
      failure: null;
      message: string;
    };

type ExternalWindow = Pick<Window, "opener" | "location" | "close" | "closed">;

function reserveWebWindow(): ExternalWindow | null {
  let popup: ExternalWindow | null = null;
  try {
    // Reserve during the button gesture, before clipboard work can consume it.
    // The blank page receives no prompt. Sever its opener before navigation.
    popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    return popup;
  } catch {
    closeWebWindow(popup);
    return null;
  }
}

function closeWebWindow(popup: ExternalWindow | null): void {
  try {
    popup?.close();
  } catch {
    /* Closing a reserved blank tab is best effort. */
  }
}

function navigateWebWindow(popup: ExternalWindow | null): "web" {
  if (!popup || popup.closed) throw new Error("ChatGPT could not open.");
  try {
    popup.location.replace(CHATGPT_URL);
    return "web";
  } catch {
    closeWebWindow(popup);
    throw new Error("ChatGPT could not open.");
  }
}

async function launchNativeChatGPT(): Promise<"app" | "web"> {
  // The native bridge owns its fixed HTTPS destination, tries an iOS universal
  // link, then opens the system browser. No prompt or profile enters the URL.
  const result = await nativeLauncher.openChatGPT();
  if (result?.destination !== "app" && result?.destination !== "web")
    throw new Error("ChatGPT could not open.");
  return result.destination;
}

/** Explicit retry/manual action; this does not copy, prefill or submit text. */
export async function openChatGPT(): Promise<"app" | "web"> {
  try {
    if (isNativeApp()) return await launchNativeChatGPT();
    return navigateWebWindow(reserveWebWindow());
  } catch {
    throw new Error(
      "ChatGPT could not open. Open it yourself and paste the prompt.",
    );
  }
}

/** Copy only the supplied prompt, then hand off for the user to paste/send. */
export async function copyPromptAndOpenChatGPT(
  prompt: string,
): Promise<ChatGPTHandoffResult> {
  const native = isNativeApp();
  const popup = native ? null : reserveWebWindow();
  try {
    await copyText(prompt);
  } catch {
    closeWebWindow(popup);
    return {
      copied: false,
      opened: false,
      failure: "clipboard",
      message:
        "Copy is unavailable. Select and copy the prompt below, then open ChatGPT.",
    };
  }
  try {
    const opened = native
      ? await launchNativeChatGPT()
      : navigateWebWindow(popup);
    return {
      copied: true,
      opened,
      failure: null,
      message:
        "Prompt copied. Paste it into ChatGPT, then bring your summary back here.",
    };
  } catch {
    closeWebWindow(popup);
    return {
      copied: true,
      opened: false,
      failure: "launch",
      message:
        "Prompt copied. ChatGPT could not open. Open it yourself and paste the prompt.",
    };
  }
}
