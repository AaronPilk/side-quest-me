import { useEffect, useState } from "react";
import PublishReel from "../components/PublishReel";
import { useParams, Link } from "react-router-dom";
import {
  Camera,
  Check,
  ArrowRight,
  Download,
  Share2,
  Play,
  RotateCcw,
} from "lucide-react";
import { api } from "../lib/api";
import { DEMO } from "../lib/auth";
import {
  Button,
  Notice,
  PageTitle,
  Back,
  Loading,
  useResource,
} from "../components/ui";
import Capture from "../components/Capture";
import { AuthVideo, fetchMediaBlob } from "../components/PrivateMedia";
export default function ActiveQuest() {
  const { id } = useParams();
  const {
    data: run,
    error,
    refresh,
    setData,
  } = useResource(() => api.run(id!), [id]);
  const [slot, setSlot] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [key] = useState(crypto.randomUUID());
  const [share, setShare] = useState<{ id: string; url: string }>();
  const [preparedShare, setPreparedShare] = useState<File>();
  useEffect(() => {
    if (!run?.render || !["queued", "processing"].includes(run.render.status))
      return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [run?.render?.status]);
  async function complete() {
    setBusy(true);
    setFailure("");
    try {
      const updated = await api.complete(
        id!,
        note ||
          "I genuinely attempted the agreed action and have permission for these recordings.",
        key,
      );
      setData(updated);
      await api.render(updated);
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function render() {
    setBusy(true);
    setFailure("");
    try {
      await api.render(run!);
      refresh();
    } catch (e) {
      setFailure((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setPreparedShare(undefined);
  }, [run?.render?.url]);
  async function exportVideo(shareFile = false) {
    setFailure("");
    try {
      if (
        shareFile &&
        preparedShare &&
        navigator.canShare?.({ files: [preparedShare] })
      ) {
        await navigator.share({
          files: [preparedShare],
          title: run!.quest.title,
          text: "You actually did it. #Sidequest",
        });
        return;
      }
      const blob = await fetchMediaBlob(run!.render!.url!);
      const file = new File([blob], "sidequest-reel.mp4", {
        type: "video/mp4",
      });
      if (shareFile && navigator.canShare?.({ files: [file] })) {
        setPreparedShare(file);
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailure((e as Error).message);
    }
  }
  if (error) return <Notice error>{error}</Notice>;
  if (!run) return <Loading />;
  const done = ["finalized", "review_needed"].includes(run.status);
  const abandoned = run.status === "abandoned";
  return (
    <>
      <Back to={done || abandoned ? "/journal" : "/"} />
      <PageTitle
        eyebrow={done ? "YOU ACTUALLY DID IT" : "COMMIT TO THE BIT"}
        title={run.quest.title}
      >
        {done
          ? run.status === "review_needed"
            ? "Submitted for review. Your reel stays private while your attempt is reviewed."
            : "The moment is yours. Keep the story."
          : "Three moments. One story. Take them at your own pace."}
      </PageTitle>
      {run.quest.sponsorDisclosure && (
        <p className="support">Sponsored · {run.quest.sponsorDisclosure}</p>
      )}
      {done && (
        <div className="completion-card">
          <span className="completion-check">
            <Check />
          </span>
          <div>
            <h2>
              {run.status === "review_needed"
                ? "Submitted for review"
                : "Quest complete"}
            </h2>
            <p>
              {run.rewardDecision?.xp
                ? `+${run.rewardDecision.xp} XP · +${run.rewardDecision.points} points`
                : run.rewardDecision?.reason === "family_cooldown"
                  ? "Saved for the story. This family is on a 30-day reward cooldown."
                  : run.rewardDecision?.reason === "daily_cap"
                    ? "Saved for the story. Your daily award limit was reached."
                    : run.status === "review_needed"
                      ? "Awards are withheld until review. Daily limits and cooldowns are checked when the review is finalized."
                      : "No award for this attempt: " +
                        (
                          run.rewardDecision?.reason || "not eligible"
                        ).replaceAll("_", " ") +
                        "."}
            </p>
            {DEMO && <small>Simulated demo progress</small>}
          </div>
        </div>
      )}
      {done && (
        <section className="section">
          <h2>Your reel</h2>
          {run.render?.status === "ready" && run.render.url ? (
            <>
              <AuthVideo
                className="reel-player"
                src={run.render.url}
                poster={run.render.thumbnailUrl}
                controls
                playsInline
                aria-label="Your finished Sidequest reel"
              />
              <div className="button-row">
                <Button onClick={() => exportVideo()}>
                  <Download size={18} />
                  Save video
                </Button>
                <Button secondary onClick={() => exportVideo(true)}>
                  <Share2 size={18} />
                  {preparedShare ? "Share video" : "Prepare share"}
                </Button>
              </div>
              <p className="fine-print">
                {preparedShare
                  ? "Video ready. Tap Share video to choose an app. "
                  : ""}
                Private until you choose to share. Opening a share sheet does
                not post your video.
              </p>
              {!DEMO && (
                <>
                  <Button
                    secondary
                    onClick={async () => {
                      if (
                        !confirm(
                          "Create a public link? Anyone with the link can view this exact reel and its title. Source clips and your profile stay private.",
                        )
                      )
                        return;
                      try {
                        setShare(await api.share(id!));
                      } catch (e) {
                        setFailure((e as Error).message);
                      }
                    }}
                  >
                    Create a public link
                  </Button>
                  {share && (
                    <div className="share-link">
                      <input
                        aria-label="Public reel link"
                        readOnly
                        value={share.url}
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(share.url)}
                      >
                        Copy
                      </button>
                      <button
                        onClick={async () => {
                          await api.revokeShare(share.id);
                          setShare(undefined);
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : ["queued", "processing"].includes(run.render?.status || "") ? (
            <Notice>
              Building your reel. Your completion is saved independently of
              rendering. You can return to your journal.
            </Notice>
          ) : (
            <>
              <Notice error={run.render?.status === "failed"}>
                {run.render?.error ||
                  "Your three clips are ready to become a real MP4."}
              </Notice>
              <Button
                onClick={render}
                busy={busy}
                disabled={run.clips.length !== 3}
              >
                <Play size={18} />
                {run.render?.status === "failed"
                  ? "Retry rendering"
                  : "Build my reel"}
              </Button>
            </>
          )}
        </section>
      )}
      <div className="section-heading">
        <h2>{done ? "Your saved moments" : "Make it happen"}</h2>
        <span className="support">{run.clips.length} / 3 saved</span>
      </div>
      <div className="capture-beats">
        {run.quest.beats.map((beat, i) => {
          const clip = run.clips.find((c) => c.slot === i);
          return (
            <article className={`capture-beat ${clip ? "saved" : ""}`} key={i}>
              <div className="beat-heading">
                <span className="step-num">
                  {clip ? <Check size={18} /> : String(i + 1).padStart(2, "0")}
                </span>
                <h2>{beat.label}</h2>
                {clip && <span className="pill success">Uploaded</span>}
              </div>
              <p>{beat.action}</p>
              <div className="shot">
                <Camera size={17} />
                <span>{beat.filming}</span>
              </div>
              {clip && (
                <div className="saved-preview">
                  <AuthVideo
                    eager={false}
                    src={clip.previewUrl}
                    controls
                    playsInline
                    muted
                    aria-label={`Saved ${beat.label} clip`}
                  />
                  <div>
                    <strong>
                      {(clip.end - clip.start).toFixed(1)} seconds selected
                    </strong>
                    <p>{clip.caption}</p>
                    <small>
                      {clip.fit === "fit" ? "Full image" : "Portrait crop"} ·{" "}
                      {clip.mute ? "Muted" : "Recorded audio"}
                    </small>
                  </div>
                </div>
              )}
              {!abandoned && (
                <Button secondary onClick={() => setSlot(i)}>
                  {clip ? (
                    <>
                      <RotateCcw size={16} />
                      {done ? "Adjust reel clip" : "Review or replace"}
                    </>
                  ) : (
                    <>
                      <Camera size={17} />
                      Record or upload
                    </>
                  )}
                </Button>
              )}
            </article>
          );
        })}
      </div>
      {!done && !abandoned && (
        <section className="section">
          <h2>Review and complete</h2>
          <p className="support">
            A failed joke or lost game can still be a great ending. Confirm the
            attempt, not the reaction.
          </p>
          <ul className="clean-list">
            {run.quest.completionQuestions.map((q) => (
              <li key={q}>
                <Check size={16} />
                {q}
              </li>
            ))}
          </ul>
          <label className="check-row">
            <input
              type="checkbox"
              checked={attempted}
              onChange={(e) => setAttempted(e.target.checked)}
            />
            <span>
              I genuinely attempted the agreed action and met these completion
              requirements.
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I have permission for the recordings I’m submitting. Any promised
              participant prize was honored regardless of filming.
            </span>
          </label>
          <label>
            A line about how it went <span className="support">(optional)</span>
            <textarea
              rows={2}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="The joke bombed. The reaction didn’t."
            />
          </label>
          <Button
            disabled={run.clips.length !== 3 || !attempted || !consent}
            busy={busy}
            onClick={complete}
          >
            Complete quest <ArrowRight size={18} />
          </Button>
          <p className="fine-print">
            Three validated clips are required. Your footage stays private.
            Rendering and public sharing never determine your award.
          </p>
          <button
            className="text-button danger"
            onClick={async () => {
              if (
                !confirm(
                  "Abandon this quest? Saved clips remain in your journal, but this attempt earns no XP or points.",
                )
              )
                return;
              await api.abandon(id!);
              refresh();
            }}
          >
            Abandon quest
          </button>
        </section>
      )}
      {done && run.render?.status === "ready" && (
        <button className="text-button" disabled={busy} onClick={render}>
          Build a new reel from saved edits
        </button>
      )}
      <PublishReel run={run} />
      {(run.clips.length > 0 || run.render) && (
        <button
          className="text-button danger"
          onClick={async () => {
            if (
              !confirm(
                "Delete this story’s clips, reel and public links? Settled XP and reward accounting remain. An unresolved review will close without an award. This cannot be undone.",
              )
            )
              return;
            try {
              await api.deleteRunMedia(run.id);
              refresh();
            } catch (e) {
              setFailure((e as Error).message);
            }
          }}
        >
          Delete story media
        </button>
      )}
      {abandoned && (
        <Notice>
          This quest was abandoned. Its saved clips remain in your journal; no
          XP or points were awarded.
        </Notice>
      )}
      {failure && <Notice error>{failure}</Notice>}
      {slot !== undefined && (
        <Capture
          key={slot}
          run={run}
          slot={slot}
          existing={run.clips.find((c) => c.slot === slot)}
          onSaved={refresh}
          onClose={() => setSlot(undefined)}
        />
      )}
      <Link className="text-button" to="/journal">
        Your private journal <ArrowRight size={16} />
      </Link>
    </>
  );
}
