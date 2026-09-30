import { useEffect, useState } from "react";
import { ApplePlaceCard } from "../components/ApplePlaces";
import PublishReel from "../components/PublishReel";
import { useParams, Link } from "react-router-dom";
import {
  Camera,
  Check,
  ArrowRight,
  Download,
  Share2,
  Play,
} from "lucide-react";
import { api } from "../lib/api";
import { isNativeApp } from "../lib/runtime";
import {
  copyText,
  exportVideoFile,
  isShareCancellation,
} from "../lib/native-share";
import { DEMO, supabase } from "../lib/auth";
import { demoActor } from "../lib/demo-identity";
import { loadCaptureDraft, deleteCaptureDraft } from "../lib/capture-drafts";
import {
  Button,
  Notice,
  PageTitle,
  Back,
  Loading,
  useResource,
} from "../components/ui";
import Capture from "../components/Capture";
import { QuestProgress } from "../components/QuestProgress";
import { hasReadyVideo, SESSION_DRAFT_SLOT } from "../lib/recording-session";
import { AuthVideo, fetchMediaBlob } from "../components/PrivateMedia";
export default function ActiveQuest() {
  const { id } = useParams();
  return <ActiveQuestRun key={id} id={id!} />;
}

function ActiveQuestRun({ id }: { id: string }) {
  const {
    data: run,
    error,
    refresh,
    setData,
  } = useResource(() => api.run(id!), [id]);
  const progress = useResource(
    () => (run?.status === "finalized" ? api.me() : Promise.resolve(null)),
    [run?.status],
  );
  const {
    data: shareLinks,
    error: shareError,
    refresh: refreshShares,
  } = useResource(() => api.shareLinks(id), [id]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failure, setFailure] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [key] = useState(crypto.randomUUID());
  const [share, setShare] = useState<{ id: string; url: string }>();
  const [preparedShare, setPreparedShare] = useState<File>();
  const [draftSlots, setDraftSlots] = useState<number[]>([]);
  useEffect(() => {
    let canceled = false;
    void (async () => {
      const owner = DEMO
        ? `demo:${demoActor().id}`
        : (await supabase?.auth.getSession())?.data.session?.user.id;
      if (!owner || !run) return;
      const slots = await Promise.all(
        [0, 1, 2, SESSION_DRAFT_SLOT].map(async (part) => {
          const draft = await loadCaptureDraft(owner, run.id, part).catch(
            () => undefined,
          );
          return draft &&
            draft.baseClipId ===
              (part === SESSION_DRAFT_SLOT
                ? run.clips.find((clip) => clip.mode === "session")?.id || null
                : run.clips.find((clip) => clip.slot === part)?.id || null)
            ? part
            : -1;
        }),
      );
      if (!canceled) setDraftSlots(slots.filter((part) => part >= 0));
    })();
    return () => {
      canceled = true;
    };
  }, [run, captureOpen]);
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
    if (mediaBusy) return;
    setMediaBusy(true);
    setFailure("");
    setFeedback("");
    try {
      if (
        !isNativeApp() &&
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
      if (
        !isNativeApp() &&
        shareFile &&
        navigator.canShare?.({ files: [file] })
      ) {
        setPreparedShare(file);
      } else {
        await exportVideoFile(file, {
          title: run!.quest.title,
          text: "You actually did it. #Sidequest",
        });
      }
    } catch (e) {
      if (!isShareCancellation(e)) setFailure((e as Error).message);
    } finally {
      setMediaBusy(false);
    }
  }
  if (error)
    return (
      <>
        <Notice error>{error}</Notice>
        <Button secondary onClick={refresh}>
          Try again
        </Button>
      </>
    );
  if (!run) return <Loading />;
  const done = ["finalized", "review_needed"].includes(run.status);
  const abandoned = run.status === "abandoned";
  const recordingCard = (
    <section className="session-quest-card">
      <div className="section-heading">
        <h2>Your video</h2>
        {hasReadyVideo(run.clips) && (
          <span className="pill success">Saved</span>
        )}
      </div>
      {run.clips.length === 1 && run.clips[0].mode === "session" && (
        <AuthVideo
          className="session-saved-video"
          src={run.clips[0].previewUrl}
          controls
          playsInline
          aria-label="Saved quest video"
        />
      )}
      {run.clips.some((clip) => clip.mode !== "session") && (
        <details className="legacy-saved-moments">
          <summary>Your previously saved moments</summary>
          {run.clips.map((clip) => (
            <div key={clip.id}>
              <p>{run.quest.beats[clip.slot]?.label || "Saved moment"}</p>
              <AuthVideo
                src={clip.previewUrl}
                controls
                playsInline
                aria-label={`Saved moment ${clip.slot + 1}`}
              />
            </div>
          ))}
        </details>
      )}
      {!done && !abandoned && (
        <>
          <Button onClick={() => setCaptureOpen(true)}>
            <Camera size={18} />
            {draftSlots.includes(SESSION_DRAFT_SLOT)
              ? "Continue recording"
              : run.clips.length
                ? "Record or import a new video"
                : "Record or import video"}
          </Button>
          <p className="fine-print">
            Hold to film, release to pause. Your takes stay together in one
            video.
          </p>
        </>
      )}
    </section>
  );
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
          : run.quest.hook}
      </PageTitle>
      {!done && !abandoned && recordingCard}
      {run.series && (
        <section
          className="series-attempt-link"
          aria-label="Your series attempt"
        >
          <span className="eyebrow">PART {run.series.position}</span>
          <h2>{run.series.title}</h2>
          <p>{run.series.partTitle}</p>
          <Link className="button secondary" to={`/series/${run.series.id}`}>
            {run.status === "finalized"
              ? "Continue your series"
              : "View your series progress"}
            <ArrowRight size={17} />
          </Link>
          <p className="fine-print">
            Each part has its own attempt. Your videos stay private until you
            publish them.
          </p>
        </section>
      )}
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
      {done && progress.data?.completedQuestCount !== undefined && (
        <QuestProgress
          completedQuestCount={progress.data.completedQuestCount}
          xp={progress.data.wallet.xp}
          demo={DEMO}
        />
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
                <Button busy={mediaBusy} onClick={() => exportVideo()}>
                  <Download size={18} />
                  Save video
                </Button>
                <Button
                  secondary
                  disabled={mediaBusy}
                  onClick={() => exportVideo(true)}
                >
                  <Share2 size={18} />
                  {isNativeApp() || preparedShare
                    ? "Share video"
                    : "Prepare share"}
                </Button>
              </div>
              <p className="fine-print">
                {preparedShare
                  ? "Video ready. Tap Share video to choose an app. "
                  : ""}
                {isNativeApp()
                  ? "To keep a copy, choose Save Video or Save to Files in the share sheet. "
                  : ""}
                Private until you choose to share. Opening a share sheet does
                not post your video.
              </p>
              {!DEMO && (
                <>
                  <Button
                    secondary
                    busy={mediaBusy}
                    onClick={async () => {
                      if (
                        !confirm(
                          "Create a public link? Anyone with the link can view this exact reel and its title. Source clips and your profile stay private.",
                        )
                      )
                        return;
                      setMediaBusy(true);
                      setFailure("");
                      setFeedback("");
                      try {
                        setShare(await api.share(id!));
                        refreshShares();
                        setFeedback(
                          "Public link created. You can copy or revoke it below.",
                        );
                      } catch (e) {
                        setFailure((e as Error).message);
                      } finally {
                        setMediaBusy(false);
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
                        disabled={mediaBusy}
                        onClick={async () => {
                          setFailure("");
                          setFeedback("");
                          try {
                            await copyText(share.url);
                            setFeedback("Public link copied.");
                          } catch {
                            setFailure(
                              "Copy is unavailable. Select and copy the link above.",
                            );
                          }
                        }}
                      >
                        Copy
                      </button>
                      <button
                        disabled={mediaBusy}
                        onClick={async () => {
                          setMediaBusy(true);
                          setFailure("");
                          setFeedback("");
                          try {
                            await api.revokeShare(share.id);
                            setShare(undefined);
                            refreshShares();
                            setFeedback(
                              "Public link revoked. It can no longer open this reel.",
                            );
                          } catch (e) {
                            setFailure((e as Error).message);
                          } finally {
                            setMediaBusy(false);
                          }
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
                  "Your video is saved and ready to become a reel."}
              </Notice>
              <Button
                onClick={render}
                busy={busy}
                disabled={!hasReadyVideo(run.clips)}
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
      {!DEMO && shareError && (
        <div>
          <Notice error>Public links could not be loaded. {shareError}</Notice>
          <Button secondary onClick={refreshShares}>
            Retry public links
          </Button>
        </div>
      )}
      {!DEMO &&
        !!shareLinks?.filter((link) => link.id !== share?.id).length && (
          <details className="filming-story-plan">
            <summary>Manage public links</summary>
            <p className="support">
              These links still open the reel version you shared. You can revoke
              them here, even after returning later. To copy a URL you no longer
              have, create a new link above.
            </p>
            <ul className="saved-share-links">
              {shareLinks
                .filter((link) => link.id !== share?.id)
                .map((link) => (
                  <li key={link.id}>
                    <div>
                      <strong>{link.caption}</strong>
                      <p className="fine-print">
                        Created {new Date(link.createdAt).toLocaleDateString()}{" "}
                        · Expires{" "}
                        {new Date(link.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      className="text-button danger"
                      disabled={mediaBusy}
                      onClick={async () => {
                        setMediaBusy(true);
                        setFailure("");
                        setFeedback("");
                        try {
                          await api.revokeShare(link.id);
                          refreshShares();
                          setFeedback(
                            "Public link revoked. It can no longer open this reel.",
                          );
                        } catch (e) {
                          setFailure((e as Error).message);
                        } finally {
                          setMediaBusy(false);
                        }
                      }}
                    >
                      Revoke link
                    </button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      {run.outing.applePlaceId && run.outing.setting !== "home" && (
        <ApplePlaceCard
          placeId={run.outing.applePlaceId}
          transport={run.outing.transport}
        />
      )}
      {!done && !abandoned && (
        <details className="quest-action-plan">
          <summary>Make it happen</summary>
          <ol>
            {run.quest.beats.map((beat, index) => (
              <li key={index}>
                <strong>{beat.label}</strong>
                <p>{beat.action}</p>
              </li>
            ))}
          </ol>
          {(run.quest.materials.length > 0 ||
            run.quest.requirements.length > 0 ||
            run.quest.fallback) && (
            <details>
              <summary>What you need & backup plan</summary>
              {run.quest.materials.length > 0 && (
                <>
                  <h3>Bring along</h3>
                  <ul>
                    {run.quest.materials.map((material, index) => (
                      <li key={index}>{material}</li>
                    ))}
                  </ul>
                </>
              )}
              {run.quest.requirements.length > 0 && (
                <>
                  <h3>Before you start</h3>
                  <ul>
                    {run.quest.requirements.map((requirement, index) => (
                      <li key={index}>{requirement}</li>
                    ))}
                  </ul>
                </>
              )}
              {run.quest.fallback && (
                <>
                  <h3>If plans change</h3>
                  <p>{run.quest.fallback}</p>
                </>
              )}
            </details>
          )}
        </details>
      )}
      {(done || abandoned) && recordingCard}
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
            disabled={!hasReadyVideo(run.clips) || !attempted || !consent}
            busy={busy}
            onClick={complete}
          >
            Complete quest <ArrowRight size={18} />
          </Button>
          <p className="fine-print">
            One saved video is all you need. Your footage stays private.
            Rendering and public sharing never determine your award.
          </p>
          <button
            className="text-button danger"
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "Abandon this quest? Saved clips remain in your journal, but this attempt earns no XP or points.",
                )
              )
                return;
              setBusy(true);
              setFailure("");
              try {
                await api.abandon(id!);
                refresh();
              } catch (e) {
                setFailure((e as Error).message);
              } finally {
                setBusy(false);
              }
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
          disabled={busy || mediaBusy}
          onClick={async () => {
            if (
              !confirm(
                "Delete this story’s clips, reel and public links? Settled XP and reward accounting remain. An unresolved review will close without an award. This cannot be undone.",
              )
            )
              return;
            setMediaBusy(true);
            setFailure("");
            setFeedback("");
            try {
              await api.deleteRunMedia(run.id);
              setShare(undefined);
              setPreparedShare(undefined);
              const owner = DEMO
                ? `demo:${demoActor().id}`
                : (await supabase?.auth.getSession())?.data.session?.user.id;
              if (owner)
                await Promise.all(
                  [0, 1, 2, SESSION_DRAFT_SLOT].map((part) =>
                    deleteCaptureDraft(owner, run.id, part),
                  ),
                ).catch(() => {});
              setDraftSlots([]);
              refreshShares();
              setFeedback(
                "Story media deleted. Your settled progress remains.",
              );
              refresh();
            } catch (e) {
              setFailure((e as Error).message);
            } finally {
              setMediaBusy(false);
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
      {feedback && <Notice>{feedback}</Notice>}
      {failure && <Notice error>{failure}</Notice>}
      {captureOpen && (
        <Capture
          run={run}
          onSaved={refresh}
          onClose={() => setCaptureOpen(false)}
        />
      )}
      <Link className="text-button" to="/journal">
        Your private journal <ArrowRight size={16} />
      </Link>
    </>
  );
}
