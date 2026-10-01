import { useState } from "react";
import { Copy } from "lucide-react";
import { COPY_PROFILE_PROMPT } from "../../shared/profile";
import { copyPromptAndOpenChatGPT } from "../lib/chatgpt-handoff";
import { Button, Notice } from "./ui";

export function ChatGPTPrompt() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  return (
    <section
      className="chatgpt-prompt-card"
      aria-label="ChatGPT preference prompt"
    >
      <Button
        secondary
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT);
            setManualCopy(result.failure === "clipboard");
            setFailed(Boolean(result.failure));
            setMessage(result.message);
          } catch {
            setFailed(true);
            setMessage(
              "Could not open ChatGPT. Try again, or continue without a summary.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Copy size={18} aria-hidden="true" /> Copy prompt and open ChatGPT
      </Button>
      <p className="support">
        Paste the copied prompt into ChatGPT, then bring its answer back here.
      </p>
      {message && <Notice error={failed}>{message}</Notice>}
      {manualCopy && (
        <pre className="prompt-fallback" tabIndex={0}>
          {COPY_PROFILE_PROMPT}
        </pre>
      )}
    </section>
  );
}
