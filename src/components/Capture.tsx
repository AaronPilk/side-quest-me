import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  Square,
  RotateCcw,
  X,
  Video,
  Check,
  Plus,
  Bookmark,
  Play,
} from "lucide-react";
import { DEMO, supabase } from "../lib/auth";
import { demoActor } from "../lib/demo-identity";
import { TakeClock, filmingGuide } from "../lib/capture-session";
import {
  captureDraftGeneration,
  loadCaptureDraft,
  saveCaptureDraft,
  deleteCaptureDraft,
} from "../lib/capture-drafts";
import "./capture-session.css";
import { api, request } from "../lib/api";
import type { Clip, Run } from "../lib/types";
import { Button, Notice } from "./ui";
import { AuthVideo } from "./PrivateMedia";

/** Reconcile a browser's tentative trim with the duration measured from sealed bytes. */
export function measuredSelection(start: number, end: number, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 60)
    throw new Error("The validated clip must be between 5 and 60 seconds.");
  const duration = Math.floor(seconds * 1000) / 1000;
  const safeStart = Math.max(
    0,
    Math.min(Math.floor(start * 1000) / 1000, duration - 5),
  );
  const safeEnd = Math.min(
    duration,
    safeStart + 15,
    Math.max(safeStart + 5, Math.floor(end * 1000) / 1000),
  );
  return { start: safeStart, end: safeEnd };
}

export default function Capture({
  run,
  slot,
  existing,
  onSaved,
  onClose,
}: {
  run: Run;
  slot: number;
  existing?: Clip;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<Blob>();
  const [preview, setPreview] = useState(existing?.previewUrl || "");
  const [duration, setDuration] = useState(existing?.duration || 0);
  const [start, setStart] = useState(existing?.start || 0);
  const [end, setEnd] = useState(existing?.end || 10);
  const [fit, setFit] = useState<"fit" | "fill">(existing?.fit || "fit");
  const [crop, setCrop] = useState(existing?.crop ?? 0.5);
  const [mute, setMute] = useState(existing?.mute || false);
  const [caption, setCaption] = useState(
    existing?.caption ?? run.quest.beats[slot].caption,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [takes, setTakes] = useState<number[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [source, setSource] = useState("gallery");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevice, setCameraDevice] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const clipPreview = useRef<HTMLVideoElement | null>(null);
  const previewingSelection = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closed = useRef(false);
  const clock = useRef(new TakeClock());
  const draftOwner = useRef<string | null>(null);
  const draftGeneration = useRef(captureDraftGeneration());
  const leaveAfterFinish = useRef(false);
  const draftWrite = useRef<Promise<void>>(Promise.resolve());
  const guide = filmingGuide(run.quest, slot);
  const closeButton = useRef<HTMLButtonElement>(null);
  function release() {
    if (timer.current) clearInterval(timer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    stream.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* Already ended tracks need no further cleanup. */
      }
    });
    stream.current = null;
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    closed.current = false;
    return () => {
      closed.current = true;
      try {
        if (recorder.current && recorder.current.state !== "inactive") {
          clock.current.pause(performance.now());
          recorder.current.stop();
        }
      } catch {
        /* A browser interruption may already have stopped it. */
      } finally {
        release();
      }
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (camera && video.current && stream.current)
      video.current.srcObject = stream.current;
  }, [camera]);
  useEffect(() => {
    let canceled = false;
    const prepare = async () => {
      try {
        const owner = DEMO
          ? `demo:${demoActor().id}`
          : (await supabase?.auth.getSession())?.data.session?.user.id;
        if (canceled || !owner) return;
        draftOwner.current = owner;
        const saved = await loadCaptureDraft(owner, run.id, slot);
        if (canceled || !saved) return;
        if (saved.baseClipId !== (existing?.id || null)) {
          await deleteCaptureDraft(owner, run.id, slot);
          return;
        }
        setFile(saved.file);
        setDuration(saved.duration);
        setStart(saved.start);
        setEnd(saved.end);
        setFit(saved.fit);
        setCrop(saved.crop);
        setMute(saved.mute);
        setCaption(saved.caption);
        setSource(saved.source);
        setDraftMessage(
          "Draft restored from this device. Review and save this part, then film your next part.",
        );
      } catch {
        if (!canceled)
          setDraftMessage(
            "Local drafts are unavailable. Upload each part before leaving.",
          );
      } finally {
        if (!canceled) setDraftReady(true);
      }
    };
    void prepare();
    return () => {
      canceled = true;
    };
  }, [run.id, slot, existing?.id]);

  // Finishing on background/track loss makes one playable container, including
  // paused takes. Independent MP4/WebM recordings are never concatenated.
  useEffect(() => {
    const interrupt = () => {
      if (
        document.hidden &&
        recorder.current?.state !== "inactive" &&
        recorder.current
      ) {
        finishPart();
        setError(
          "Camera interrupted. Your captured takes are now a draft to review. Save this part before filming another.",
        );
      }
    };
    const pageLeaving = () => {
      if (recorder.current && recorder.current.state !== "inactive")
        finishPart();
    };
    document.addEventListener("visibilitychange", interrupt);
    window.addEventListener("pagehide", pageLeaving);
    return () => {
      document.removeEventListener("visibilitychange", interrupt);
      window.removeEventListener("pagehide", pageLeaving);
    };
  }, []);

  async function keepDraft(
    blob: Blob,
    seconds: number,
    selectedStart = start,
    selectedEnd = end,
  ) {
    if (!draftOwner.current)
      throw new Error(
        "Your local draft identity is unavailable. Upload this part before leaving.",
      );
    const owner = draftOwner.current;
    const write = () =>
      saveCaptureDraft(
        {
          owner,
          run: run.id,
          slot,
          baseClipId: existing?.id || null,
          file: blob,
          duration: seconds,
          start: selectedStart,
          end: selectedEnd,
          fit,
          crop,
          mute,
          caption,
          source,
          updatedAt: Date.now(),
        },
        draftGeneration.current,
      );
    // Serialize the initial recording save and later trim edits.
    draftWrite.current = draftWrite.current.catch(() => {}).then(write);
    await draftWrite.current;
    if (!closed.current)
      setDraftMessage(
        "Draft saved on this device for 7 days. Upload it to keep it with your quest.",
      );
  }

  function finishPart() {
    const active = recorder.current;
    if (!active || active.state === "inactive") return;
    clock.current.pause(performance.now());
    setElapsed(clock.current.seconds(performance.now()));
    setTakes([...clock.current.takes]);
    setFinishing(true);
    setRecording(false);
    setPaused(false);
    try {
      active.stop();
    } catch {
      setFinishing(false);
      release();
      setCamera(false);
      setError(
        "The camera stopped before it could finish this part. Your uploaded parts are still saved.",
      );
    }
  }

  function pauseTake() {
    const active = recorder.current;
    if (!active || active.state !== "recording") return;
    try {
      active.pause();
      clock.current.pause(performance.now());
      setElapsed(clock.current.seconds(performance.now()));
      setTakes([...clock.current.takes]);
      setRecording(false);
      setPaused(true);
    } catch {
      finishPart();
    }
  }

  function resumeTake() {
    const active = recorder.current;
    if (!active || active.state !== "paused") return;
    try {
      active.resume();
      clock.current.resume(performance.now());
      setRecording(true);
      setPaused(false);
    } catch {
      finishPart();
      setError(
        "This camera cannot continue that take. Review the footage already captured.",
      );
    }
  }
  async function openCamera(deviceId?: string) {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "In-page recording is unavailable. Use your phone camera or upload a clip below.",
      );
      return;
    }
    if (cameraBusy || recording || paused || finishing || countdown > 0) return;
    setCameraBusy(true);
    release();
    setCamera(false);
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "environment" }),
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      if (closed.current) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = acquired;
      acquired.getTracks().forEach((track) => {
        track.onended = () => {
          if (recorder.current && recorder.current.state !== "inactive") {
            finishPart();
            setError(
              "Camera disconnected. Review the takes captured before it stopped.",
            );
          }
        };
      });
      setCameraDevice(
        acquired.getVideoTracks()[0]?.getSettings().deviceId || deviceId || "",
      );
      setCamera(true);
      setSource("camera");
      // Enumerating after the existing permission grant reveals supported devices without a new permission request.
      const available =
        typeof navigator.mediaDevices.enumerateDevices === "function"
          ? await navigator.mediaDevices.enumerateDevices().catch(() => [])
          : [];
      if (!closed.current)
        setCameras(
          available.filter(
            (device) => device.kind === "videoinput" && device.deviceId,
          ),
        );
    } catch {
      setError(
        deviceId
          ? "That camera is unavailable. Try recording again or upload a clip instead."
          : "Camera access is off or unavailable. You can use your phone camera or upload a clip instead.",
      );
      release();
      setCamera(false);
    } finally {
      if (!closed.current) setCameraBusy(false);
    }
  }
  function switchCamera() {
    const current = cameras.findIndex(
      (device) => device.deviceId === cameraDevice,
    );
    const next = cameras[(current + 1) % cameras.length];
    if (next) void openCamera(next.deviceId);
  }
  function record() {
    if (!stream.current || countdown > 0 || recording || paused || finishing)
      return;
    setCountdown(3);
    let left = 3;
    countdownTimer.current = setInterval(() => {
      left--;
      setCountdown(left);
      if (left > 0) return;
      clearInterval(countdownTimer.current!);
      if (!stream.current || closed.current) return;
      const mime = [
        "video/mp4;codecs=avc1.424028,mp4a.40.2",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/mp4",
      ].find((m) => MediaRecorder.isTypeSupported(m));
      try {
        const active = new MediaRecorder(
          stream.current,
          mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined,
        );
        recorder.current = active;
        clock.current = new TakeClock();
        setTakes([]);
        chunks.current = [];
        active.ondataavailable = (e) => {
          if (e.data.size) chunks.current.push(e.data);
        };
        active.onerror = () => {
          clock.current.pause(performance.now());
          setError(
            "Recording stopped unexpectedly. Review any captured footage or try again.",
          );
          if (active.state !== "inactive") finishPart();
          else release();
          setRecording(false);
          setPaused(false);
        };
        active.onstop = async () => {
          clock.current.pause(performance.now());
          const blob = new Blob(chunks.current, {
            type: active.mimeType || chunks.current[0]?.type,
          });
          const measuredElapsed =
            Math.floor(clock.current.seconds(performance.now()) * 1000) / 1000;
          release();
          if (!closed.current) {
            setCamera(false);
            setRecording(false);
            setPaused(false);
            setFinishing(false);
          }
          if (blob.size) {
            if (!closed.current) {
              setFile(blob);
              setDuration(measuredElapsed);
              setStart(0);
              setEnd(Math.min(15, measuredElapsed));
            }
            try {
              await keepDraft(
                blob,
                measuredElapsed,
                0,
                Math.min(15, measuredElapsed),
              );
              if (leaveAfterFinish.current && !closed.current) onClose();
            } catch {
              if (!closed.current)
                setError(
                  "This browser could not save the local draft. Keep this screen open and upload the part to save it.",
                );
            }
          } else if (!closed.current)
            setError("No video was recorded. Try again or upload a clip.");
        };
        active.start(250);
        clock.current.resume(performance.now());
        setRecording(true);
        setPaused(false);
        setElapsed(0);
        timer.current = setInterval(() => {
          const seconds = clock.current.seconds(performance.now());
          setElapsed(seconds);
          if (seconds >= 15 && active.state === "recording") finishPart();
        }, 100);
      } catch {
        release();
        setCamera(false);
        setError(
          "This browser could not start recording. Use the file capture option below.",
        );
      }
    }, 1000);
  }
  function selectFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    if (f.size > 40 * 1024 * 1024) {
      setError(
        "This clip is over 40 MB. Trim it in your phone’s video app, then upload again.",
      );
      return;
    }
    if (!f.size) {
      setError("This file is empty. Choose a playable video.");
      return;
    }
    setSource("gallery");
    setFile(f);
    setDuration(0);
    setStart(0);
    setEnd(10);
    void keepDraft(f, 0, 0, 10).catch(() =>
      setDraftMessage(
        "Local draft unavailable. Upload this part before leaving.",
      ),
    );
  }
  async function close() {
    if (busy || finishing) return;
    if (recorder.current && recorder.current.state !== "inactive") {
      leaveAfterFinish.current = true;
      finishPart();
      return;
    }
    if (file) {
      try {
        await keepDraft(file, duration);
      } catch {
        setError(
          "Your draft could not be saved. Upload this part or discard it before leaving.",
        );
        return;
      }
    }
    onClose();
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      let clip = existing,
        selected = { start, end };
      if (file) {
        if (DEMO) {
          const result = await request<{
            assetId: string;
            generation: number;
            mime: string;
            probe: { duration: number; durationSeconds?: number };
            previewUrl: string;
          }>(`/api/local-media/uploads?runId=${run.id}&slot=${slot}`, {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-Sidequest-Demo": "1",
            },
            body: file,
          });
          const measuredDuration =
            result.probe.durationSeconds ?? result.probe.duration;
          selected = measuredSelection(start, end, measuredDuration);
          setDuration(measuredDuration);
          setStart(selected.start);
          setEnd(selected.end);
          clip = {
            id: result.assetId,
            generation: result.generation,
            slot,
            duration: measuredDuration,
            mime: result.mime,
            previewUrl: result.previewUrl,
            ...selected,
            fit,
            crop,
            mute,
            caption,
          };
        } else {
          const reservation = await request<{ id: string; uploadUrl: string }>(
            `/api/quest-runs/${run.id}/uploads`,
            {
              method: "POST",
              headers: {
                "Idempotency-Key": crypto.randomUUID(),
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                slot,
                bytes: file.size,
                mime: file.type,
                source,
              }),
            },
          );
          const uploaded = await request<{ duration_ms: number }>(
            reservation.uploadUrl,
            {
              method: "PUT",
              headers: { "Content-Type": file.type },
              body: file,
            },
          );
          const measuredDuration = uploaded.duration_ms / 1000;
          selected = measuredSelection(start, end, measuredDuration);
          setDuration(measuredDuration);
          setStart(selected.start);
          setEnd(selected.end);
          clip = await request<Clip>(`/api/media/${reservation.id}/finalize`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({ ...selected, fit, crop, mute, caption }),
          });
        }
      }
      if (!clip) throw new Error("Record or upload a clip first.");
      await api.saveClip(run.id, {
        ...clip,
        ...selected,
        fit,
        crop,
        mute,
        caption,
      });
      await draftWrite.current.catch(() => {});
      if (draftOwner.current)
        await deleteCaptureDraft(draftOwner.current, run.id, slot).catch(
          () => {},
        );
      onSaved();
      onClose();
    } catch (e) {
      setError(
        `Couldn’t save clip ${slot + 1}. Your other clips are saved. ${(e as Error).message}`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`capture-overlay ${camera ? "camera-open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Capture ${run.quest.beats[slot].label}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "Tab") {
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select, summary, video[controls], [tabindex="0"]',
            ),
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div className="capture-content">
        <div className="section-heading">
          <span className="eyebrow">MOMENT {slot + 1} OF 3</span>
          <button
            ref={closeButton}
            className="icon-button"
            aria-label="Exit capture"
            onClick={close}
            disabled={busy || finishing}
          >
            <X />
          </button>
        </div>
        <h1>{run.quest.beats[slot].label}</h1>
        <div className="filming-guide">
          <strong>{guide.title}</strong>
          <p>{guide.prompt}</p>
          <p className="shot-direction">{guide.shot}</p>
          <details>
            <summary>Story tip</summary>
            <p>{guide.tip}</p>
          </details>
        </div>
        {camera && (
          <div
            className="take-progress"
            aria-label={`${takes.length} completed takes, ${elapsed.toFixed(1)} of 15 seconds`}
          >
            {takes.map((take, index) => (
              <span key={index} style={{ width: `${(take / 15) * 100}%` }} />
            ))}
            {recording && (
              <span
                className="current-take"
                style={{
                  width: `${(Math.max(0, elapsed - takes.reduce((sum, take) => sum + take, 0)) / 15) * 100}%`,
                }}
              />
            )}
          </div>
        )}
        <div className="capture-frame">
          {camera ? (
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label="Live camera preview"
            />
          ) : preview ? (
            <AuthVideo
              key={preview}
              src={preview}
              controls
              playsInline
              muted={mute}
              style={{
                objectFit: fit === "fit" ? "contain" : "cover",
                objectPosition: `${crop * 100}% center`,
              }}
              onLoadedMetadata={(e) => {
                clipPreview.current = e.currentTarget;
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) {
                  setDuration(d);
                  setEnd((prev) => Math.min(prev, d));
                }
              }}
              onTimeUpdate={(event) => {
                if (
                  previewingSelection.current &&
                  event.currentTarget.currentTime >= end
                ) {
                  event.currentTarget.pause();
                  previewingSelection.current = false;
                }
              }}
              onError={() =>
                setError(
                  "This browser cannot preview this video. Use an MP4 or record a new clip.",
                )
              }
              aria-label="Clip preview"
            />
          ) : (
            <div className="capture-placeholder">
              <Video size={40} />
              <span>Your next moment goes here.</span>
              <small>Portrait · Aim for 10 seconds</small>
            </div>
          )}
          {countdown > 0 && (
            <div className="countdown" role="status">
              {countdown}
            </div>
          )}
          {(recording || paused || finishing) && (
            <div
              className="record-timer"
              role="timer"
              aria-label={`${Math.floor(elapsed)} seconds recorded`}
            >
              {recording && <span />} {elapsed.toFixed(1)}s / 15s
              {paused ? " · Take stopped" : ""}
            </div>
          )}
        </div>
        {camera ? (
          <div className="capture-actions">
            <p className="support">
              Film a little, stop, then add another take. Keep 5–15 seconds in
              this part.
            </p>
            <div className="take-controls">
              {recording ? (
                <button
                  className="record-control is-recording"
                  onClick={pauseTake}
                  aria-label="Stop take"
                >
                  <Square fill="currentColor" size={26} />
                </button>
              ) : paused ? (
                <button
                  className="record-control"
                  onClick={resumeTake}
                  aria-label="Add take"
                >
                  <Plus size={30} />
                </button>
              ) : (
                <button
                  className="record-control"
                  disabled={countdown > 0 || cameraBusy || finishing}
                  onClick={record}
                  aria-label="Start recording"
                >
                  <Camera size={28} />
                </button>
              )}
              {(recording || paused) && (
                <Button secondary disabled={elapsed < 5} onClick={finishPart}>
                  <Check size={18} />
                  Finish part
                </Button>
              )}
            </div>
            <p className="record-control-label">
              {recording
                ? "Stop take"
                : paused
                  ? "Add take"
                  : finishing
                    ? "Finishing your part…"
                    : "Start recording"}
            </p>
            {paused && elapsed < 5 && (
              <p className="support">
                Add at least {(5 - elapsed).toFixed(1)} more seconds to use this
                part.
              </p>
            )}
            {cameras.length > 1 && (
              <button
                className="text-button"
                disabled={
                  cameraBusy ||
                  recording ||
                  paused ||
                  finishing ||
                  countdown > 0
                }
                onClick={switchCamera}
              >
                <RotateCcw size={16} />
                Switch camera
              </button>
            )}
            {paused && (
              <button className="text-button" onClick={close}>
                <Bookmark size={16} />
                Save draft & leave
              </button>
            )}
            {!recording && !paused && !finishing && (
              <button
                className="text-button"
                onClick={() => {
                  release();
                  setCamera(false);
                  setCountdown(0);
                  if (existing) {
                    setPreview(existing.previewUrl);
                    setDuration(existing.duration);
                    setStart(existing.start);
                    setEnd(existing.end);
                    setFit(existing.fit);
                    setCrop(existing.crop);
                    setMute(existing.mute);
                    setCaption(existing.caption);
                  }
                }}
              >
                Cancel camera
              </button>
            )}
          </div>
        ) : preview ? (
          <>
            {file && duration > 0 && duration < 5 && (
              <Notice error>
                This draft is shorter than 5 seconds. Retake this part or upload
                a longer clip. Your other parts stay saved.
              </Notice>
            )}
            <div className="form-grid">
              <label>
                Start (seconds)
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, duration - 5)}
                  step="0.1"
                  value={start}
                  onChange={(e) => {
                    setStart(Number(e.target.value));
                  }}
                />
              </label>
              <label>
                End (seconds)
                <input
                  type="number"
                  min="5"
                  max={duration || 60}
                  step="0.1"
                  value={end}
                  onChange={(e) => setEnd(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="support">
              Selected: {(end - start).toFixed(1)}s ·{" "}
              {duration > 0
                ? "Choose 5–15 seconds within your clip."
                : "The upload will confirm the clip’s duration and trim."}
            </p>
            <button
              className="button secondary"
              disabled={busy || !duration || end <= start || end > duration}
              onClick={async () => {
                const player = clipPreview.current;
                if (!player) return;
                setError("");
                player.currentTime = start;
                previewingSelection.current = true;
                try {
                  await player.play();
                } catch {
                  previewingSelection.current = false;
                  setError(
                    "The preview could not play. Try the video’s play control.",
                  );
                }
              }}
            >
              <Play size={17} /> Preview selected{" "}
              {Math.max(0, end - start).toFixed(1)}s
            </button>
            <div className="form-grid">
              <label>
                Framing
                <select
                  value={fit}
                  onChange={(e) => setFit(e.target.value as "fit" | "fill")}
                >
                  <option value="fit">Fit — keep the whole image</option>
                  <option value="fill">Fill — crop to portrait</option>
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={mute}
                  onChange={(e) => setMute(e.target.checked)}
                />
                Mute recorded audio
              </label>
            </div>
            {fit === "fill" && (
              <label>
                Horizontal crop position
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={crop}
                  onChange={(e) => setCrop(Number(e.target.value))}
                />
              </label>
            )}
            <label>
              Story label (not a transcript)
              <input
                value={caption}
                maxLength={64}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            <Button
              busy={busy}
              disabled={
                !draftReady ||
                end - start < 5 ||
                end - start > 15 ||
                start < 0 ||
                (duration > 0 && end > duration)
              }
              onClick={save}
            >
              Use clip · {file ? "Upload & validate" : "Save changes"}
            </Button>
            <button
              className="text-button"
              disabled={busy}
              onClick={async () => {
                if (
                  file &&
                  !confirm(
                    "Discard this local draft and record again? Your uploaded parts stay saved.",
                  )
                )
                  return;
                await draftWrite.current.catch(() => {});
                if (draftOwner.current)
                  await deleteCaptureDraft(
                    draftOwner.current,
                    run.id,
                    slot,
                  ).catch(() => {});
                setFile(undefined);
                setPreview("");
                setDuration(0);
                setDraftMessage("");
              }}
            >
              <RotateCcw size={16} />
              Retake or replace
            </button>
            {file && (
              <>
                <button className="text-button" disabled={busy} onClick={close}>
                  <Bookmark size={16} />
                  Save draft & leave
                </button>
                <p className="fine-print">
                  This part is finished. Save it and return for your next part
                  whenever you’re ready. Adding takes is available before you
                  finish a part.
                </p>
              </>
            )}
          </>
        ) : (
          <div className="stack">
            <Button
              busy={cameraBusy || !draftReady}
              onClick={() => openCamera()}
            >
              <Camera size={18} />
              Record this moment
            </Button>
            <label className="button secondary file-button">
              <Upload size={18} />
              Upload a clip
              <input
                type="file"
                disabled={cameraBusy || !draftReady}
                accept="video/*"
                onChange={selectFile}
              />
            </label>
            <label className="text-button file-button">
              Use phone camera
              <input
                type="file"
                disabled={cameraBusy || !draftReady}
                accept="video/*"
                capture="environment"
                onChange={selectFile}
              />
            </label>
            <p className="fine-print">
              MP4, MOV or WebM · Up to 40 MB, 60 seconds.
              <br />A saved clip is confirmed only after server validation.
            </p>
          </div>
        )}
        {draftMessage && (
          <p className="fine-print" role="status">
            {draftMessage}
          </p>
        )}
        {error && <Notice error>{error}</Notice>}
      </div>
    </div>
  );
}
