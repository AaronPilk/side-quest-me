import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { COPY_PROFILE_PROMPT } from "../../shared/profile";
import { copyPromptAndOpenChatGPT, openChatGPT } from "../lib/chatgpt-handoff";
import { Button, Notice } from "./ui";

export function ChatGPTPrompt() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <section
      className="chatgpt-prompt-card"
      aria-label="ChatGPT preference prompt"
    >
      <span className="eyebrow">A HEAD START, IF YOU USE CHATGPT</span>
      <h2>Bring what it knows about you.</h2>
      <p>
        Ask ChatGPT for a summary, paste it here, then confirm what fits as you
        answer.
      </p>
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await copyPromptAndOpenChatGPT(COPY_PROFILE_PROMPT);
            setCopied(result.copied);
            setFailed(Boolean(result.failure));
            setMessage(result.message);
          } catch {
            setFailed(true);
            setMessage(
              "Could not open ChatGPT. Copy the prompt below and open ChatGPT yourself.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Copy size={18} aria-hidden="true" /> Copy prompt and open ChatGPT
      </Button>
      <p className="support">
        Paste into a new chat. Return here with the summary. If the app doesn’t
        open, use ChatGPT in your browser.
      </p>
      {message && <Notice error={failed}>{message}</Notice>}
      {copied && failed && (
        <Button
          secondary
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await openChatGPT();
              setFailed(!result);
              setMessage(
                result
                  ? "ChatGPT opened. Paste the copied prompt, then return with your summary."
                  : "Open ChatGPT yourself and paste the copied prompt.",
              );
            } catch {
              setMessage("Open ChatGPT yourself and paste the copied prompt.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <ExternalLink size={17} /> Try opening ChatGPT again
        </Button>
      )}
      <details className="prompt-details">
        <summary>View or manually copy the prompt</summary>
        <pre tabIndex={0}>{COPY_PROFILE_PROMPT}</pre>
      </details>
    </section>
  );
}
