import { useEffect, useRef, useState } from "react";
import { Camera, Upload, Square, RotateCcw, X, Video } from "lucide-react";
import { DEMO } from "../lib/auth";
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
    existing?.caption || run.quest.beats[slot].caption,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [source, setSource] = useState("gallery");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevice, setCameraDevice] = useState("");
  const [cameraBusy, setCameraBusy] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closed = useRef(false);
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
        if (recorder.current?.state === "recording") recorder.current.stop();
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
    const interrupt = () => {
      if (document.hidden && recorder.current?.state === "recording") {
        recorder.current.stop();
        setError(
          "Recording was interrupted. Review the captured clip or retake it. Your other clips are saved.",
        );
      }
    };
    document.addEventListener("visibilitychange", interrupt);
    return () => document.removeEventListener("visibilitychange", interrupt);
  }, []);
  async function openCamera(deviceId?: string) {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "In-page recording is unavailable. Use your phone camera or upload a clip below.",
      );
      return;
    }
    if (cameraBusy || recording || countdown > 0) return;
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
      setCameraDevice(
        acquired.getVideoTracks()[0]?.getSettings().deviceId || deviceId || "",
      );
      setCamera(true);
      setPreview("");
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
    if (!stream.current) return;
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
        const began = performance.now();
        recorder.current = new MediaRecorder(
          stream.current,
          mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined,
        );
        chunks.current = [];
        recorder.current.ondataavailable = (e) => {
          if (e.data.size) chunks.current.push(e.data);
        };
        recorder.current.onerror = () => {
          setError(
            "Recording stopped unexpectedly. Try again or upload a clip.",
          );
          release();
          setRecording(false);
        };
        recorder.current.onstop = () => {
          const blob = new Blob(chunks.current, {
            type: recorder.current?.mimeType || chunks.current[0]?.type,
          });
          const measuredElapsed =
            Math.floor((performance.now() - began) / 100) / 10;
          release();
          if (closed.current) return;
          setCamera(false);
          setRecording(false);
          if (blob.size) {
            setFile(blob);
            setDuration(measuredElapsed);
            setStart(0);
            setEnd(Math.min(10, measuredElapsed));
          } else setError("No video was recorded. Try again or upload a clip.");
        };
        recorder.current.start(250);
        setRecording(true);
        setElapsed(0);
        timer.current = setInterval(() => {
          const seconds = (performance.now() - began) / 1000;
          setElapsed(seconds);
          if (seconds >= 15 && recorder.current?.state === "recording")
            recorder.current.stop();
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
  }
  function close() {
    if (
      (file || recording) &&
      !confirm(
        "Leave this recording? This unsaved clip will be lost. Your uploaded clips stay saved.",
      )
    )
      return;
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
      className="capture-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Capture ${run.quest.beats[slot].label}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
        if (e.key === "Tab") {
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select, video[controls], [tabindex="0"]',
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
          >
            <X />
          </button>
        </div>
        <h1>{run.quest.beats[slot].label}</h1>
        <p>{run.quest.beats[slot].filming}</p>
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
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) {
                  setDuration(d);
                  setEnd((prev) => Math.min(prev, d, 15));
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
          {recording && (
            <div
              className="record-timer"
              role="timer"
              aria-label={`${Math.floor(elapsed)} seconds recorded`}
            >
              <span /> {elapsed.toFixed(1)}s{" "}
              {elapsed >= 10 ? "✓ Target reached" : "/ 10s target"}
            </div>
          )}
        </div>
        {camera ? (
          <div className="capture-actions">
            {recording ? (
              <Button onClick={() => recorder.current?.stop()}>
                <Square size={18} />
                Stop recording
              </Button>
            ) : (
              <Button disabled={countdown > 0 || cameraBusy} onClick={record}>
                <Camera size={18} />
                Start recording
              </Button>
            )}
            {cameras.length > 1 && (
              <button
                className="text-button"
                disabled={cameraBusy || recording || countdown > 0}
                onClick={switchCamera}
              >
                <RotateCcw size={16} />
                Switch camera
              </button>
            )}
            <button
              className="text-button"
              onClick={() => {
                release();
                setCamera(false);
                setCountdown(0);
              }}
            >
              Cancel camera
            </button>
          </div>
        ) : preview ? (
          <>
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
              onClick={() => {
                setFile(undefined);
                setPreview("");
                setDuration(0);
              }}
            >
              <RotateCcw size={16} />
              Retake or replace
            </button>
          </>
        ) : (
          <div className="stack">
            <Button busy={cameraBusy} onClick={() => openCamera()}>
              <Camera size={18} />
              Record this moment
            </Button>
            <label className="button secondary file-button">
              <Upload size={18} />
              Upload a clip
              <input
                type="file"
                disabled={cameraBusy}
                accept="video/*"
                onChange={selectFile}
              />
            </label>
            <label className="text-button file-button">
              Use phone camera
              <input
                type="file"
                disabled={cameraBusy}
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
        {error && <Notice error>{error}</Notice>}
      </div>
    </div>
  );
}
