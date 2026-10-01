import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Outing, QuestVariant } from "../../shared/domain";
import { AI_PROVIDER_LABELS, type AiQuestResult } from "../../shared/ai-quest";
import { aiQuestApi } from "../lib/ai-quest-api";
import { selectedPlaceContext } from "../lib/place-context";
import { Button, Notice, useResource } from "./ui";
import "./ai-quest-assist.css";

export function AiQuestAssist({
  quest,
  outing,
}: {
  quest: QuestVariant;
  outing: Outing;
}) {
  const config = useResource(aiQuestApi.config);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AiQuestResult>();
  if (!config.data?.configured) return null;
  async function generate() {
    if (!consent || busy) return;
    setBusy(true);
    setError("");
    try {
      const placeContext = await selectedPlaceContext(outing.applePlaceId);
      const next = await aiQuestApi.assist({
        templateId: quest.id,
        outing,
        ...(placeContext ? { placeContext } : {}),
        providerConsent: true,
        provider: config.data?.provider ?? "openai",
      });
      if (next.templateId !== quest.id)
        throw new Error(
          "The filming plan did not match this quest. Try again.",
        );
      setResult(next);
    } catch (cause) {
      // Validation failures carry raw schema issues; never show those verbatim.
      setError(
        cause instanceof Error && cause.name !== "ZodError"
          ? cause.message
          : "Could not create your filming plan. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ai-quest-assist" aria-label="AI filming ideas">
      <div className="ai-assist-heading">
        <Sparkles size={20} aria-hidden="true" />
        <div>
          <h2>A better way to tell it</h2>
          <p>Opening lines, shots and a loop for this quest.</p>
        </div>
      </div>
      {!open ? (
        <Button secondary onClick={() => setOpen(true)}>
          Get AI filming ideas
        </Button>
      ) : (
        <>
          {!result && (
            <label className="ai-provider-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Send this quest, my confirmed preferences and outing details to
                {AI_PROVIDER_LABELS[config.data.provider ?? "openai"]}. My
                imported summary, name and exact coordinates stay private.
              </span>
            </label>
          )}
          {result && (
            <div className="ai-assist-proposal">
              <span className="eyebrow">
                AI SUGGESTION · REVIEW BEFORE USING
              </span>
              <h3>{result.proposal.title}</h3>
              <p className="ai-assist-hook">{result.proposal.hook}</p>
              <ol>
                {[...result.proposal.filming]
                  .sort((a, b) => a.beatIndex - b.beatIndex)
                  .map((suggestion) => (
                    <li key={suggestion.beatIndex}>
                      <strong>{quest.beats[suggestion.beatIndex].label}</strong>
                      <p>{suggestion.shot}</p>
                      <small>On screen: “{suggestion.onScreenText}”</small>
                    </li>
                  ))}
              </ol>
              <p>
                <strong>Loop:</strong> {result.proposal.loopTip}
              </p>
              <p className="fine-print">
                Optional filming suggestions. Your quest steps, boundaries and
                rewards stay the same. Venue access and opening hours still need
                checking.
              </p>
            </div>
          )}
          {error && <Notice error>{error}</Notice>}
          <Button
            secondary
            disabled={!consent}
            busy={busy}
            onClick={() => void generate()}
          >
            {result
              ? "Try another filming idea"
              : error
                ? "Retry filming ideas"
                : "Create my filming plan"}
          </Button>
        </>
      )}
    </section>
  );
}
