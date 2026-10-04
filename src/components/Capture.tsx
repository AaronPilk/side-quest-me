import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  RotateCcw,
  Square,
  X,
  SwitchCamera,
  Zap,
  Timer,
  Captions,
  ImagePlus,
  Image as ImageIcon,
  ChevronUp,
  Play,
} from "lucide-react";
import { DEMO, supabase } from "../lib/auth";
import { demoActor } from "../lib/demo-identity";
import {
  captureDraftGeneration,
  deleteCaptureDraft,
  loadCaptureDraft,
  materializeCaptureDraft,
  saveCaptureDraft,
} from "../lib/capture-drafts";
import { watchCaptureActivity } from "../lib/capture-lifecycle";
import {
  nativeCamera,
  readNativeCameraTake,
  usesNativeCamera,
  type NativeCameraState,
  type NativeCameraTake,
} from "../lib/native-camera";
import {
  beginPinchZoom,
  updatePinchZoom,
  clampCameraZoom,
  zoomRangeFromCapabilities,
  zoomButtonChoices,
  cameraZoomConstraints,
  cameraFacing,
  oppositeCameraDevice,
  type CameraZoomRange,
  type ZoomPoint,
} from "../lib/camera-zoom";
import {
  connectCameraPreview,
  type CameraPreviewState,
} from "../lib/camera-preview";
import {
  SESSION_DRAFT_SLOT,
  sessionSeconds,
  validSession,
  type RecordedTake,
  type ImageOverlay,
} from "../lib/recording-session";
import { saveRecordingSession } from "../lib/session-media";
import type { Run } from "../lib/types";
import { Button } from "./ui";
import "./capture-session.css";
import "./unified-capture.css";
export { measuredSelection } from "../lib/clip-selection";

export default function Capture({
  run,
  onSaved,
  onClose,
}: {
  run: Run;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [takes, setTakes] = useState<RecordedTake[]>([]);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraPreview, setCameraPreview] =
    useState<CameraPreviewState>("starting");
  const [nativeSession, setNativeSession] = useState(false);
  const [nativeCaptureId] = useState(() => crypto.randomUUID());
  const camera = cameraStream !== null || nativeSession;
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<CameraZoomRange | null>(null);
  const [zoomPresets, setZoomPresets] = useState<number[]>([1]);
  const [nativeCanFlip, setNativeCanFlip] = useState(false);
  const [nativeTakePending, setNativeTakePending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);
  const [delay, setDelay] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState(0);
  const [limit, setLimit] = useState<15 | 30 | 60>(60);
  const [sheet, setSheet] = useState<"quest" | "prompt" | "overlay" | null>(
    null,
  );
  const [promptText, setPromptText] = useState(run.quest.hook);
  const [promptOn, setPromptOn] = useState(false);
  const [promptSpeed, setPromptSpeed] = useState<"slow" | "normal" | "fast">(
    "normal",
  );
  const [overlay, setOverlay] = useState<ImageOverlay>();
  const [overlayUrl, setOverlayUrl] = useState("");
  const [galleryUrl, setGalleryUrl] = useState("");
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const liveVideo = useRef<HTMLVideoElement>(null);
  const cameraStage = useRef<HTMLDivElement>(null);
  const nativeSessionOpen = useRef(false);
  const nativeShutdown = useRef(Promise.resolve());
  const nativeStart = useRef(Promise.resolve());
  const nativeListenersReady = useRef(Promise.resolve());
  const nativeRecording = useRef(false);
  const nativeRecordingId = useRef<string | undefined>(undefined);
  const nativeStopping = useRef<Promise<void> | null>(null);
  const nativeStopResolve = useRef<(() => void) | undefined>(undefined);
  const importedNativeTakes = useRef(new Map<string, Promise<void>>());
  const pendingNativeTakes = useRef(
    new Map<string, { native: NativeCameraTake; prepared?: RecordedTake }>(),
  );
  const zoomState = useRef<{ range: CameraZoomRange | null; value: number }>({
    range: null,
    value: 1,
  });
  const zoomPending = useRef<number | null>(null);
  const zoomApplying = useRef(false);
  const pointers = useRef(new Map<number, ZoomPoint>());
  const pinch = useRef<ReturnType<typeof beginPinchZoom>>(null);
  const pinched = useRef(false);
  const livePreview = useRef<ReturnType<typeof connectCameraPreview> | null>(
    null,
  );
  const previewVideo = useRef<HTMLVideoElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const sheetElement = useRef<HTMLElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const source = useRef<"camera" | "gallery">("camera");
  const savedTakes = useRef<RecordedTake[]>([]);
  const owner = useRef<string | undefined>(undefined);
  const generation = useRef(captureDraftGeneration());
  const closed = useRef(false);
  const active = useRef(true);
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const write = useRef(Promise.resolve());
  const stopped = useRef(Promise.resolve());
  const recordingStarted = useRef(0);
  const recordingStopped = useRef(0);
  const overlayRef = useRef<ImageOverlay | undefined>(undefined);
  const autoOpened = useRef(false);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );
  const timedRecording = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const baseClipId =
    run.clips.length === 1 && run.clips[0].mode === "session"
      ? run.clips[0].id
      : null;
  const seconds = sessionSeconds(takes);

  function releaseCamera() {
    clearInterval(countdownTimer.current);
    countdownTimer.current = undefined;
    if (!closed.current) {
      setCountdown(0);
      setTorch(false);
      setTorchAvailable(false);
    }
    requestId.current++;
    livePreview.current?.dispose();
    livePreview.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (nativeSessionOpen.current) {
      nativeSessionOpen.current = false;
      nativeShutdown.current = stopped.current
        .catch(() => {})
        .then(() => nativeCamera.stop())
        .catch(() => {});
    }
    zoomPending.current = null;
    pointers.current.clear();
    pinch.current = null;
    zoomState.current = { range: null, value: 1 };
    if (!closed.current) {
      setCameraStream(null);
      setNativeSession(false);
      setNativeCanFlip(false);
      setZoomRange(null);
      setZoomPresets([1]);
      setZoom(1);
      setCameraPreview("starting");
    }
  }
  async function persist(next: RecordedTake[]) {
    savedTakes.current = next;
    if (!closed.current) setTakes(next);
    if (!owner.current)
      throw new Error(
        "Local draft storage is unavailable. Keep this screen open and save your video.",
      );
    const draftOwner = owner.current;
    write.current = write.current
      .catch(() => {})
      .then(() =>
        next.length
          ? saveCaptureDraft(
              {
                owner: draftOwner,
                run: run.id,
                slot: SESSION_DRAFT_SLOT,
                baseClipId,
                file: next[0].file,
                takes: next,
                ...(overlayRef.current ? { overlay: overlayRef.current } : {}),
                duration: sessionSeconds(next),
                start: 0,
                end: sessionSeconds(next),
                fit: "fit",
                crop: 0.5,
                mute: false,
                caption: "",
                source: source.current,
                updatedAt: Date.now(),
              },
              generation.current,
            )
          : deleteCaptureDraft(draftOwner, run.id, SESSION_DRAFT_SLOT),
      );
    await write.current;
    if (!closed.current)
      setMessage(next.length ? "Draft saved on this device." : "");
  }
  function stopRecording() {
    if (nativeRecording.current) {
      if (nativeStopping.current) return nativeStopping.current;
      recordingStopped.current = performance.now();
      const recordingId = nativeRecordingId.current;
      clearInterval(timer.current);
      if (!closed.current) {
        setRecording(false);
        setFinishing(true);
      }
      nativeStopping.current = (async () => {
        try {
          await nativeStart.current;
          if (nativeRecording.current)
            await keepNativeTake(await nativeCamera.stopRecording());
        } catch (cause) {
          if (!closed.current)
            setError(
              (cause as Error).message ||
                "Recording stopped. Your earlier takes are saved.",
            );
        } finally {
          finishNativeRecording(recordingId);
        }
      })();
      return nativeStopping.current;
    }
    const current = recorder.current;
    if (!current || current.state === "inactive") return stopped.current;
    recordingStopped.current = performance.now();
    clearInterval(timer.current);
    timer.current = undefined;
    if (!closed.current) {
      setRecording(false);
      setFinishing(true);
    }
    try {
      current.stop();
    } catch {
      releaseCamera();
    }
    return stopped.current;
  }
  function finishNativeRecording(recordingId?: string) {
    if (recordingId && nativeRecordingId.current !== recordingId) return;
    clearInterval(timer.current);
    nativeRecording.current = false;
    nativeRecordingId.current = undefined;
    nativeStopResolve.current?.();
    nativeStopResolve.current = undefined;
    nativeStopping.current = null;
    if (!closed.current) {
      setRecording(false);
      setFinishing(false);
      setElapsed(0);
    }
  }
  function keepNativeTake(take: NativeCameraTake): Promise<void> {
    const previous = importedNativeTakes.current.get(take.fileUrl);
    if (previous) return previous;
    if (
      !pendingNativeTakes.current.has(take.fileUrl) &&
      savedTakes.current.some(
        (saved) => saved.nativeRecordingId === take.recordingId,
      )
    )
      return nativeCamera
        .discardRecording({ fileUrl: take.fileUrl })
        .catch(() => {});
    const pending = pendingNativeTakes.current.get(take.fileUrl) ?? {
      native: take,
    };
    pendingNativeTakes.current.set(take.fileUrl, pending);
    if (!closed.current) setNativeTakePending(true);
    const saving = (async () => {
      if (take.durationMs < 100) {
        await nativeCamera.discardRecording({ fileUrl: take.fileUrl });
        pendingNativeTakes.current.delete(take.fileUrl);
        if (!closed.current)
          setNativeTakePending(pendingNativeTakes.current.size > 0);
        return;
      }
      pending.prepared ??= {
        file: await readNativeCameraTake(take),
        duration: take.durationMs / 1000,
        nativeRecordingId: take.recordingId,
      };
      const next = savedTakes.current.includes(pending.prepared)
        ? savedTakes.current
        : [...savedTakes.current, pending.prepared];
      if (
        next.reduce((sum, entry) => sum + entry.file.size, 0) >
        40 * 1024 * 1024
      )
        throw new Error(
          "This take exceeds the 40 MB session limit. Your earlier takes are saved.",
        );
      await persist(next);
      await nativeCamera
        .discardRecording({ fileUrl: take.fileUrl })
        .catch(() => {});
      pendingNativeTakes.current.delete(take.fileUrl);
      if (!closed.current)
        setNativeTakePending(pendingNativeTakes.current.size > 0);
    })();
    importedNativeTakes.current.set(take.fileUrl, saving);
    // A failed read leaves the native file intact and can be retried.
    void saving.catch(() => importedNativeTakes.current.delete(take.fileUrl));
    return saving;
  }
  async function retryNativeTakes() {
    if (finishing || busy) return;
    setFinishing(true);
    setError("");
    try {
      for (const pending of pendingNativeTakes.current.values())
        await keepNativeTake(pending.native);
    } catch {
      setError(
        "Your recorded take is still on this device. Retry saving it before recording more or leaving.",
      );
    } finally {
      if (!closed.current) setFinishing(false);
    }
  }
  async function discardPendingNativeTakes() {
    if (
      finishing ||
      busy ||
      !confirm("Discard the unsaved take? Your earlier saved takes will stay.")
    )
      return;
    setFinishing(true);
    try {
      for (const [url, pending] of pendingNativeTakes.current) {
        if (pending.prepared && savedTakes.current.includes(pending.prepared))
          await persist(
            savedTakes.current.filter((take) => take !== pending.prepared),
          );
        await nativeCamera.discardRecording({ fileUrl: url });
        pendingNativeTakes.current.delete(url);
        importedNativeTakes.current.delete(url);
      }
      setNativeTakePending(pendingNativeTakes.current.size > 0);
      setError("");
    } catch {
      setError(
        "This take could not be discarded yet. Keep the camera open and try again.",
      );
    } finally {
      setFinishing(false);
    }
  }
  function applyNativeState(state: NativeCameraState) {
    const range = { min: state.minZoom, max: state.maxZoom, step: 0.01 };
    zoomState.current = { range, value: state.zoom };
    setZoom(state.zoom);
    setZoomRange(range);
    setZoomPresets(
      state.presets.filter((value) => value === 0.5 || value === 1),
    );
    setTorchAvailable(state.torchAvailable);
    if (typeof state.torch === "boolean") setTorch(state.torch);
    setNativeCanFlip(state.canFlip !== false);
  }
  useEffect(() => {
    if (!usesNativeCamera()) return;
    let disposed = false;
    const handles: { remove: () => Promise<void> }[] = [];
    nativeListenersReady.current = (async () => {
      const registrations = [
        nativeCamera.addListener("recordingStopped", (take) => {
          if (
            take.captureId !== nativeCaptureId ||
            take.contextId !== `${owner.current}:${run.id}` ||
            closed.current
          )
            return;
          void keepNativeTake(take)
            .catch((cause) => {
              if (!closed.current) setError((cause as Error).message);
            })
            .finally(() => finishNativeRecording(take.recordingId));
        }),
        nativeCamera.addListener("cameraReady", (state) => {
          if (
            !nativeSessionOpen.current ||
            closed.current ||
            state.captureId !== nativeCaptureId
          )
            return;
          applyNativeState(state);
          setCameraPreview("ready");
        }),
        nativeCamera.addListener("interrupted", (notice) => {
          if (closed.current) return;
          setCameraPreview("blocked");
          setError(
            notice.message ||
              "Camera paused. Your saved takes are kept. Restart the camera to continue.",
          );
          clearInterval(countdownTimer.current);
          setCountdown(0);
        }),
        nativeCamera.addListener("cameraError", (notice) => {
          if (closed.current) return;
          setCameraPreview("blocked");
          setError(
            notice.message || "Camera stopped. Restart it or import a video.",
          );
          void stopRecording();
        }),
      ];
      const results = await Promise.allSettled(registrations);
      for (const result of results) {
        if (result.status === "fulfilled") {
          if (disposed) await result.value.remove();
          else handles.push(result.value);
        }
      }
      if (results.some((result) => result.status === "rejected"))
        throw new Error(
          "Camera controls could not connect. Close and reopen the camera.",
        );
    })();
    // openCamera awaits this promise and reports failures to the user.
    void nativeListenersReady.current.catch(() => {});
    return () => {
      disposed = true;
      handles.forEach((handle) => void handle.remove());
    };
  }, []);
  useEffect(() => {
    if (!nativeSession) return;
    document.documentElement.classList.add("native-camera-active");
    const update = () => {
      const bounds = cameraStage.current?.getBoundingClientRect();
      if (!bounds || !nativeSessionOpen.current) return;
      void nativeCamera
        .updatePreview({
          preview: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        })
        .catch(() => {});
    };
    const observer = new ResizeObserver(update);
    if (cameraStage.current) observer.observe(cameraStage.current);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    update();
    return () => {
      document.documentElement.classList.remove("native-camera-active");
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [nativeSession]);
  useEffect(() => {
    closed.current = false;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    let canceled = false;
    void (async () => {
      try {
        const draftOwner = DEMO
          ? `demo:${demoActor().id}`
          : (await supabase?.auth.getSession())?.data.session?.user.id;
        if (!draftOwner || canceled) return;
        owner.current = draftOwner;
        const draft = await loadCaptureDraft(
          draftOwner,
          run.id,
          SESSION_DRAFT_SLOT,
        );
        if (
          canceled ||
          !draft ||
          draft.baseClipId !== baseClipId ||
          owner.current !== draftOwner ||
          captureDraftGeneration() !== generation.current
        )
          return;
        let restored = draft;
        let playbackPrepared = true;
        try {
          restored = await materializeCaptureDraft(draft);
        } catch {
          // Keep the saved session intact if its backing file cannot be read.
          // Starting from an empty session could overwrite the earlier takes.
          playbackPrepared = false;
        }
        if (
          canceled ||
          closed.current ||
          owner.current !== draftOwner ||
          captureDraftGeneration() !== generation.current
        )
          return;
        savedTakes.current = restored.takes || [
          { file: restored.file, duration: restored.duration },
        ];
        overlayRef.current = restored.overlay;
        setOverlay(restored.overlay);
        source.current = restored.source === "gallery" ? "gallery" : "camera";
        setTakes(savedTakes.current);
        setMessage("Your draft is here. Keep filming.");
        if (!playbackPrepared)
          setError(
            "Your saved takes are kept, but playback could not be prepared. Try reopening your draft.",
          );
      } catch {
        if (!canceled)
          setError(
            "Local draft storage is unavailable. Save your video before leaving.",
          );
      } finally {
        if (!canceled && owner.current && usesNativeCamera()) {
          try {
            const contextId = `${owner.current}:${run.id}`;
            const recovered = await nativeCamera.recoverRecordings({
              contextId,
            });
            if (
              canceled ||
              closed.current ||
              captureDraftGeneration() !== generation.current
            )
              return;
            for (const take of recovered.takes) {
              if (take.contextId === contextId) await keepNativeTake(take);
            }
          } catch {
            if (!canceled)
              setError(
                "A recorded take could not be recovered yet. Your earlier saved takes are kept.",
              );
          }
        }
        if (!canceled) setReady(true);
      }
    })();
    const unwatch = watchCaptureActivity((isActive) => {
      active.current = isActive;
      if (!isActive) {
        void stopRecording();
        releaseCamera();
      }
    });
    return () => {
      canceled = true;
      closed.current = true;
      unwatch();
      void stopRecording();
      releaseCamera();
      previousFocus?.focus();
    };
  }, [run.id, baseClipId]);
  useEffect(() => {
    if (!cameraStream || !liveVideo.current) return;
    const connection = connectCameraPreview(
      liveVideo.current,
      cameraStream,
      (state) => {
        if (closed.current || stream.current !== cameraStream) return;
        setCameraPreview(state);
        if (state === "blocked") {
          clearInterval(countdownTimer.current);
          countdownTimer.current = undefined;
          setCountdown(0);
          void stopRecording();
        }
      },
    );
    livePreview.current = connection;
    return () => {
      connection.dispose();
      if (livePreview.current === connection) livePreview.current = null;
    };
  }, [cameraStream]);
  useEffect(() => {
    const file = takes[previewIndex]?.file;
    if (!file || !preview) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [takes, previewIndex, preview]);

  useEffect(() => {
    if (!ready || autoOpened.current) return;
    autoOpened.current = true;
    void openCamera(undefined, true);
  }, [ready]);
  useEffect(() => {
    if (!overlay) {
      setOverlayUrl("");
      return;
    }
    const url = URL.createObjectURL(overlay.file);
    setOverlayUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [overlay]);
  useEffect(() => {
    const file = takes.at(-1)?.file;
    if (!file) {
      setGalleryUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setGalleryUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [takes]);

  useEffect(() => {
    if (!sheet) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetElement.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [sheet]);

  function finishSwipe(x: number, y: number) {
    const from = touchStart.current;
    touchStart.current = undefined;
    if (from && from.y - y > 70 && Math.abs(from.x - x) < 80 && !recording)
      setSheet("quest");
  }
  function requestZoom(value: number) {
    const range = zoomState.current.range;
    if (
      !range ||
      !camera ||
      cameraPreview !== "ready" ||
      opening ||
      busy ||
      pendingNativeTakes.current.size > 0 ||
      finishing ||
      countdown
    )
      return;
    zoomPending.current = clampCameraZoom(value, range);
    if (zoomApplying.current) return;
    zoomApplying.current = true;
    const id = requestId.current;
    void (async () => {
      try {
        while (
          zoomPending.current !== null &&
          id === requestId.current &&
          !closed.current
        ) {
          const next = zoomPending.current;
          zoomPending.current = null;
          let applied = next;
          if (nativeSessionOpen.current) {
            const state = await nativeCamera.setZoom({ zoom: next });
            applied = state.zoom;
          } else {
            const track = stream.current?.getVideoTracks()[0];
            if (!track) break;
            await track.applyConstraints(cameraZoomConstraints(next, range));
            applied =
              (track.getSettings() as MediaTrackSettings & { zoom?: number })
                .zoom ?? next;
          }
          if (id !== requestId.current || closed.current) break;
          zoomState.current.value = clampCameraZoom(applied, range);
          setZoom(zoomState.current.value);
        }
      } catch {
        if (id === requestId.current && !closed.current)
          setError("Zoom could not change. Try the lens button again.");
      } finally {
        zoomApplying.current = false;
      }
    })();
  }
  async function flipCamera() {
    if (nativeSessionOpen.current) {
      const id = ++requestId.current;
      setOpening(true);
      zoomPending.current = null;
      pointers.current.clear();
      pinch.current = null;
      try {
        const state = await nativeCamera.flip();
        if (closed.current || id !== requestId.current) return;
        applyNativeState(state);
        setTorch(false);
        setCameraPreview("ready");
      } catch (cause) {
        if (!closed.current)
          setError(
            (cause as Error).message || "Camera could not flip. Try again.",
          );
      } finally {
        if (!closed.current) setOpening(false);
      }
      return;
    }
    const facing = cameraFacing(
      stream.current?.getVideoTracks()[0]?.getSettings() ?? {},
    );
    const opposite = oppositeCameraDevice(devices, device, facing);
    await openCamera(
      opposite?.deviceId,
      false,
      facing === "user" ? "environment" : "user",
    );
  }

  async function openCamera(
    deviceId?: string,
    preserveError = false,
    facing: "user" | "environment" = "environment",
  ) {
    if (
      opening ||
      busy ||
      finishing ||
      recording ||
      countdown ||
      !active.current ||
      pendingNativeTakes.current.size > 0 ||
      !ready
    )
      return;
    if (!preserveError) setError("");
    setPreview(false);
    setOpening(true);
    releaseCamera();
    const id = ++requestId.current;
    try {
      if (usesNativeCamera()) {
        if (!owner.current)
          throw new Error(
            "Sign in to keep your recording drafts on this device.",
          );
        await nativeShutdown.current;
        await nativeListenersReady.current;
        if (closed.current || !active.current || id !== requestId.current)
          return;
        const bounds = cameraStage.current?.getBoundingClientRect();
        if (!bounds) throw new Error("Camera preview is not ready. Try again.");
        nativeSessionOpen.current = true;
        const state = await nativeCamera.start({
          contextId: `${owner.current}:${run.id}`,
          captureId: nativeCaptureId,
          position: facing === "user" ? "front" : "back",
          preview: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        });
        if (closed.current || !active.current || id !== requestId.current) {
          await nativeCamera.stop();
          nativeSessionOpen.current = false;
          return;
        }
        applyNativeState(state);
        setNativeSession(true);
        setCameraPreview("ready");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error();
      const acquired = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: facing }),
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: true,
      });
      if (closed.current || !active.current || id !== requestId.current) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = acquired;
      acquired.getTracks().forEach((track) => {
        track.onended = () => {
          if (stream.current !== acquired || id !== requestId.current) return;
          void stopRecording();
          releaseCamera();
        };
      });
      setCameraStream(acquired);
      const track = acquired.getVideoTracks()[0];
      const capabilities = track?.getCapabilities?.();
      const range = zoomRangeFromCapabilities(capabilities);
      const reportedZoom =
        (track?.getSettings() as MediaTrackSettings & { zoom?: number })
          ?.zoom ?? 1;
      const initialZoom = range ? clampCameraZoom(reportedZoom, range) : 1;
      zoomState.current = { range, value: initialZoom };
      setZoom(initialZoom);
      setZoomRange(range);
      setZoomPresets(
        range
          ? zoomButtonChoices(range, [0.5, 1]).filter(
              (value) => value === 0.5 || value === 1,
            )
          : [1],
      );
      setDevice(track?.getSettings().deviceId || deviceId || "");
      setTorchAvailable(
        Boolean(
          (
            track?.getCapabilities?.() as MediaTrackCapabilities & {
              torch?: boolean;
            }
          )?.torch,
        ),
      );
      const available =
        (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ||
        [];
      if (!closed.current && id === requestId.current)
        setDevices(
          available.filter(
            (entry) => entry.kind === "videoinput" && entry.deviceId,
          ),
        );
    } catch (cause) {
      if (nativeSessionOpen.current) {
        nativeSessionOpen.current = false;
        await nativeCamera.stop().catch(() => {});
      }
      if (!closed.current && id === requestId.current)
        setError(
          usesNativeCamera() && cause instanceof Error
            ? cause.message
            : "Camera access is unavailable. Import a video below or enable camera and microphone access in Settings.",
        );
    } finally {
      if (!closed.current) setOpening(false);
    }
  }
  function startRecording() {
    if (
      !active.current ||
      opening ||
      pendingNativeTakes.current.size > 0 ||
      (!stream.current && !nativeSessionOpen.current) ||
      cameraPreview !== "ready" ||
      finishing ||
      busy ||
      recorder.current?.state === "recording" ||
      nativeRecording.current
    )
      return;
    const total = sessionSeconds(savedTakes.current);
    if (total >= limit - 0.2 || savedTakes.current.length >= 30) {
      setError("Your session is full. Preview and save your video.");
      return;
    }
    setError("");
    setMessage("");
    source.current = "camera";
    if (nativeSessionOpen.current) {
      const recordingId = crypto.randomUUID();
      nativeRecordingId.current = recordingId;
      nativeRecording.current = true;
      stopped.current = new Promise<void>((resolve) => {
        nativeStopResolve.current = resolve;
      });
      setRecording(true);
      nativeStart.current = nativeCamera
        .startRecording({ recordingId })
        .then(() => {
          recordingStarted.current = performance.now();
          if (
            nativeStopping.current ||
            !nativeRecording.current ||
            closed.current
          )
            return;
          timer.current = setInterval(() => {
            const now = (performance.now() - recordingStarted.current) / 1000;
            setElapsed(now);
            if (total + now >= limit - 0.2) void stopRecording();
          }, 50);
        })
        .catch((cause) => {
          if (!closed.current)
            setError(
              (cause as Error).message ||
                "Recording could not start. Try again or import a video.",
            );
          finishNativeRecording(recordingId);
        });
      return;
    }
    if (!stream.current) return;
    const chunks: Blob[] = [];
    const mime = [
      "video/mp4;codecs=avc1.424028,mp4a.40.2",
      "video/webm;codecs=vp8,opus",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    try {
      const current = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined,
      );
      recorder.current = current;
      let resolveStop: () => void;
      stopped.current = new Promise<void>((resolve) => {
        resolveStop = resolve;
      });
      current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      current.onerror = () => {
        void stopRecording();
        setError("Recording was interrupted. Your earlier takes are saved.");
      };
      current.onstop = async () => {
        clearInterval(timer.current);
        const duration = Math.max(
          0,
          ((recordingStopped.current || performance.now()) -
            recordingStarted.current) /
            1000,
        );
        const file = new Blob(chunks, {
          type: current.mimeType || chunks[0]?.type,
        });
        recorder.current = null;
        if (!closed.current) setElapsed(0);
        try {
          if (duration >= 0.1 && file.size) {
            const next = [...savedTakes.current, { file, duration }];
            if (
              next.reduce((sum, take) => sum + take.file.size, 0) >
              40 * 1024 * 1024
            )
              throw new Error(
                "This take exceeds the 40 MB session limit. Your earlier takes are saved.",
              );
            await persist(next);
          }
        } catch (cause) {
          if (!closed.current) setError((cause as Error).message);
        } finally {
          if (!closed.current) {
            setRecording(false);
            setFinishing(false);
            setElapsed(0);
          }
          resolveStop!();
        }
      };
      recordingStarted.current = performance.now();
      recordingStopped.current = 0;
      current.start(250);
      setRecording(true);
      timer.current = setInterval(() => {
        const now = (performance.now() - recordingStarted.current) / 1000;
        setElapsed(now);
        if (total + now >= limit - 0.2) void stopRecording();
      }, 50);
    } catch {
      recorder.current = null;
      stopped.current = Promise.resolve();
      setError("Recording could not start. Try again or import a video.");
    }
  }
  function beginRecording() {
    if (recording) {
      void stopRecording();
      return;
    }
    if (countdownTimer.current || !camera || cameraPreview !== "ready") return;
    timedRecording.current = delay > 0;
    if (!delay) {
      startRecording();
      return;
    }
    let remaining: number = delay;
    setCountdown(remaining);
    countdownTimer.current = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (!remaining) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = undefined;
        if (active.current && !closed.current) startRecording();
      }
    }, 1000);
  }
  async function toggleTorch() {
    if (nativeSessionOpen.current && torchAvailable) {
      try {
        applyNativeState(await nativeCamera.setTorch({ enabled: !torch }));
        setTorch(!torch);
      } catch {
        setError("Camera light is unavailable. Try turning it on again.");
      }
      return;
    }
    const track = stream.current?.getVideoTracks()[0];
    if (!track || !torchAvailable) return;
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torch }],
      } as unknown as MediaTrackConstraints);
      setTorch(!torch);
    } catch {
      setError("Torch is unavailable on this camera.");
      setTorchAvailable(false);
    }
  }
  async function chooseOverlay(next?: ImageOverlay) {
    if (
      next &&
      (!next.file.size ||
        next.file.size > 5 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(next.file.type))
    ) {
      setError("Choose a JPG, PNG or WebP image up to 5 MB.");
      return;
    }
    overlayRef.current = next;
    setOverlay(next);
    setError("");
    if (savedTakes.current.length)
      try {
        await persist(savedTakes.current);
      } catch (cause) {
        setError((cause as Error).message);
      }
    if (next) setSheet("overlay");
  }
  async function showPreview() {
    await stopRecording();
    releaseCamera();
    setPreviewIndex(0);
    setPreview(true);
  }
  async function importVideo(file?: File) {
    if (!file) return;
    if (pendingNativeTakes.current.size) {
      setError("Save your recorded take using Retry saving take first.");
      return;
    }
    setError("");
    if (!file.size || file.size > 40 * 1024 * 1024) {
      setError("Choose a video no larger than 40 MB.");
      return;
    }
    if (
      savedTakes.current.length &&
      !confirm("Replace this device’s recording draft with the imported video?")
    )
      return;
    releaseCamera();
    source.current = "gallery";
    const next = [{ file, duration: 0 }];
    savedTakes.current = next;
    setTakes(next);
    setPreviewIndex(0);
    setPreview(true);
    try {
      await persist(next);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function close() {
    if (busy || finishing) return;
    await stopRecording();
    if (pendingNativeTakes.current.size) {
      setError(
        "Your recorded take is still on this device. Retry saving it before leaving.",
      );
      return;
    }
    try {
      await write.current;
      releaseCamera();
      onClose();
    } catch {
      setError(
        "Your draft could not be saved. Keep this screen open and save the video first.",
      );
    }
  }
  async function save() {
    if (pendingNativeTakes.current.size) {
      setError("Retry saving your recorded take first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveRecordingSession(
        run.id,
        savedTakes.current,
        source.current,
        overlayRef.current,
      );
      await write.current.catch(() => {});
      if (owner.current)
        await deleteCaptureDraft(
          owner.current,
          run.id,
          SESSION_DRAFT_SLOT,
        ).catch(() => {});
      onSaved();
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const locked =
    busy || finishing || recording || countdown > 0 || nativeTakePending;
  const takeRecovery = nativeTakePending && !recording;
  const previewRecovery = !preview && camera && cameraPreview === "blocked";
  const cameraRecovery = takeRecovery || previewRecovery;
  const positions: { value: ImageOverlay["position"]; label: string }[] = [
    { value: "top_left", label: "Top left" },
    { value: "top_right", label: "Top right" },
    { value: "center", label: "Center" },
    { value: "bottom_left", label: "Bottom left" },
    { value: "bottom_right", label: "Bottom right" },
  ];
  return (
    <div
      className={`capture-overlay session-capture session-fullscreen ${nativeSession ? "is-native-camera" : ""} ${cameraRecovery ? "is-camera-recovery" : ""} ${takeRecovery ? "is-take-recovery" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Record your quest"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          if (sheet) setSheet(null);
          else void close();
        }
        if (event.key === "Tab") {
          const controls = Array.from(
            (
              sheetElement.current || event.currentTarget
            ).querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary, video[controls], [tabindex="0"]',
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="session-capture-header">
        <button
          ref={closeButton}
          className="session-tool-icon"
          aria-label="Exit capture"
          onClick={() => void close()}
          disabled={busy || finishing}
        >
          <X />
        </button>
        <h1>{run.quest.title}</h1>
        <span className="session-duration" role="timer">
          {(seconds + elapsed).toFixed(1)}s / {preview ? 60 : limit}s
        </span>
      </header>
      <div
        className="session-timeline"
        aria-label={`${takes.length} takes saved`}
      >
        {takes.map((take, index) => (
          <span
            key={index}
            style={{ width: `${(take.duration / limit) * 100}%` }}
          />
        ))}
        {recording && (
          <span
            className="live-take"
            style={{ width: `${(elapsed / limit) * 100}%` }}
          />
        )}
      </div>
      <div
        ref={cameraStage}
        className={`session-camera-stage ${preview ? "is-preview" : ""}`}
        onPointerDown={(event) => {
          if (
            (event.target as HTMLElement).closest(
              "button, input, label, textarea, a",
            )
          )
            return;
          if (preview) return;
          pointers.current.set(event.pointerId, {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          });
          if (pointers.current.size === 1) {
            pinched.current = false;
            touchStart.current = { x: event.clientX, y: event.clientY };
          } else {
            pinched.current = true;
            touchStart.current = undefined;
            const range = zoomState.current.range;
            if (range)
              pinch.current = beginPinchZoom(
                [...pointers.current.values()],
                zoomState.current.value,
                range,
              );
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          });
          const range = zoomState.current.range;
          if (!range || pointers.current.size < 2) return;
          const update = updatePinchZoom(
            pinch.current,
            [...pointers.current.values()],
            zoomState.current.value,
            range,
          );
          pinch.current = update.gesture;
          requestZoom(update.zoom);
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (!pinched.current) finishSwipe(event.clientX, event.clientY);
          if (pointers.current.size < 2) pinch.current = null;
          if (!pointers.current.size) touchStart.current = undefined;
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          touchStart.current = undefined;
          pinch.current = null;
        }}
      >
        <div className="session-video-canvas">
          {nativeSession ? (
            <div
              className="session-native-preview"
              aria-label="Live camera preview"
            />
          ) : camera ? (
            <video
              ref={liveVideo}
              autoPlay
              playsInline
              muted
              aria-label="Live camera preview"
            />
          ) : preview && previewUrl ? (
            <video
              ref={previewVideo}
              key={previewUrl}
              src={previewUrl}
              controls
              playsInline
              autoPlay
              onError={() =>
                setError(
                  "This video could not be previewed. Choose a playable MP4, MOV, or WebM video.",
                )
              }
              onLoadedMetadata={(event) => {
                const measured = event.currentTarget.duration;
                if (
                  !takes[previewIndex]?.duration &&
                  Number.isFinite(measured)
                ) {
                  const next = savedTakes.current.map((take, index) =>
                    index === previewIndex
                      ? { ...take, duration: measured }
                      : take,
                  );
                  void persist(next).catch((cause) =>
                    setError((cause as Error).message),
                  );
                  if (measured < 5 || measured > 60.1)
                    setError(
                      "Choose a finished video between 5 and 60 seconds.",
                    );
                }
              }}
              onEnded={() => {
                if (previewIndex + 1 < takes.length)
                  setPreviewIndex(previewIndex + 1);
              }}
              aria-label="Your video preview"
            />
          ) : (
            <div className="session-camera-empty">
              <Camera size={38} />
              <p>{opening ? "Opening camera…" : "Your moment starts here."}</p>
              {!opening && (
                <Button onClick={() => void openCamera()} busy={!ready}>
                  {takes.length ? "Continue recording" : "Open camera"}
                </Button>
              )}
            </div>
          )}
          {camera && cameraPreview === "starting" && !takeRecovery && (
            <div className="session-camera-empty session-camera-starting">
              <p role="status">Starting camera preview…</p>
            </div>
          )}
          {overlayUrl && overlay && (
            <div
              className="session-overlay-frame"
              aria-label="Image overlay preview"
            >
              <img
                className={`session-image-overlay position-${overlay.position}`}
                src={overlayUrl}
                alt="Your image overlay"
                style={
                  overlaySize.width
                    ? {
                        width: `${((Math.min(1, (overlay.position === "center" ? 650 : 360) / overlaySize.width, (overlay.position === "center" ? 800 : 480) / overlaySize.height) * overlaySize.width) / 1080) * 100}%`,
                      }
                    : undefined
                }
                onLoad={(event) =>
                  setOverlaySize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                onError={() => {
                  void chooseOverlay();
                  setError(
                    "This image could not be opened. Choose a different JPG, PNG or WebP image.",
                  );
                }}
              />
            </div>
          )}
        </div>
        {promptOn && !preview && (
          <div
            className="session-teleprompter"
            aria-label="Teleprompter script"
          >
            <p
              key={`${promptText}-${promptSpeed}`}
              style={{
                animationDuration: `${promptSpeed === "slow" ? 65 : promptSpeed === "fast" ? 25 : 45}s`,
                animationPlayState: recording ? "running" : "paused",
              }}
            >
              {promptText}
            </p>
          </div>
        )}
      </div>
      {cameraRecovery && (
        <div className="session-recovery-layer">
          <section
            className="session-recovery-panel"
            aria-label="Camera recovery"
          >
            <Camera size={26} aria-hidden="true" />
            <h2>
              {takeRecovery ? "Save this take" : "Let’s restart your camera"}
            </h2>
            <p role="status">
              {takeRecovery
                ? "Your recorded take is still on this device. Save it before filming more."
                : "The preview paused. Your saved takes are kept."}
            </p>
            {error && (
              <p className="session-recovery-error" role="alert">
                {error}
              </p>
            )}
            {message && !error && (
              <p className="session-recovery-note" role="status">
                {message}
              </p>
            )}
            <div className="session-recovery-actions">
              {takeRecovery ? (
                <>
                  <Button
                    onClick={() => void retryNativeTakes()}
                    busy={finishing || busy}
                  >
                    Retry saving take
                  </Button>
                  <Button
                    secondary
                    onClick={() => void discardPendingNativeTakes()}
                    disabled={finishing || busy}
                  >
                    Discard unsaved take
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() =>
                      nativeSession
                        ? void openCamera()
                        : livePreview.current?.retry()
                    }
                    disabled={locked || opening}
                  >
                    Start preview
                  </Button>
                  <Button
                    secondary
                    onClick={() => void openCamera(device || undefined)}
                    disabled={locked || opening}
                  >
                    Restart camera
                  </Button>
                </>
              )}
            </div>
            <p className="session-recovery-note">
              {takeRecovery
                ? "Discard removes only this unsaved take. Earlier saved takes stay."
                : "You can also import a video from your gallery below."}
            </p>
          </section>
        </div>
      )}
      {!preview && (
        <aside className="session-tools" aria-label="Camera tools">
          <button
            className="session-tool-icon"
            aria-label="Flip camera"
            disabled={
              locked ||
              opening ||
              !camera ||
              (nativeSession ? !nativeCanFlip : devices.length < 2)
            }
            title={
              (nativeSession ? !nativeCanFlip : devices.length < 2)
                ? "Only one camera is available"
                : "Flip camera"
            }
            onClick={() => void flipCamera()}
          >
            <SwitchCamera />
            <span>Flip</span>
          </button>
          <button
            className="session-tool-icon"
            aria-label="Flash"
            aria-pressed={torch}
            disabled={locked || !torchAvailable}
            title={
              torchAvailable
                ? "Toggle camera light"
                : "Flash is unavailable on this camera"
            }
            onClick={() => void toggleTorch()}
          >
            <Zap />
            <span>{torch ? "Light on" : "Flash"}</span>
          </button>
          <button
            className="session-tool-icon"
            aria-label={`Timer ${delay}s`}
            disabled={locked}
            onClick={() => setDelay(delay === 0 ? 3 : delay === 3 ? 10 : 0)}
          >
            <Timer />
            <span>{delay ? `${delay}s` : "Timer"}</span>
          </button>
          <button
            className="session-tool-icon"
            aria-label="Teleprompter"
            aria-pressed={promptOn}
            disabled={locked}
            onClick={() => setSheet("prompt")}
          >
            <Captions />
            <span>Prompt</span>
          </button>
          <label
            className={`session-tool-icon session-file-tool ${locked ? "is-disabled" : ""}`}
          >
            <ImagePlus />
            <span>Photo</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Add image overlay"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  void chooseOverlay({
                    file,
                    position: overlayRef.current?.position || "center",
                  });
                event.target.value = "";
              }}
            />
          </label>
          {overlay && (
            <button
              className="session-tool-icon"
              aria-label="Edit image overlay"
              disabled={locked}
              onClick={() => setSheet("overlay")}
            >
              <ImageIcon />
              <span>Position</span>
            </button>
          )}
          {!!takes.length && (
            <button
              className="session-tool-icon"
              aria-label="Delete last take"
              disabled={locked}
              onClick={async () => {
                if (!confirm("Delete your last take?")) return;
                try {
                  await persist(savedTakes.current.slice(0, -1));
                } catch (cause) {
                  setError((cause as Error).message);
                }
              }}
            >
              <RotateCcw />
              <span>Undo</span>
            </button>
          )}
        </aside>
      )}
      {countdown > 0 && (
        <div className="session-countdown" role="status">
          <strong>{countdown}</strong>
          <button
            className="session-pill"
            onClick={() => {
              clearInterval(countdownTimer.current);
              countdownTimer.current = undefined;
              setCountdown(0);
            }}
          >
            Cancel timer
          </button>
        </div>
      )}
      <footer
        className={`session-camera-footer ${preview ? "is-preview" : ""}`}
      >
        {!cameraRecovery &&
          (error ? (
            <div className="session-feedback" role="alert">
              {error}
              <button aria-label="Dismiss message" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          ) : (
            message &&
            !recording && (
              <p className="session-draft-message" role="status">
                {message}
              </p>
            )
          ))}
        {preview ? (
          <>
            <div className="session-review-actions">
              <Button
                onClick={save}
                busy={busy}
                disabled={!validSession(takes) || nativeTakePending}
              >
                Save video <Check size={18} />
              </Button>
              <Button
                secondary
                onClick={() => void openCamera()}
                disabled={busy || seconds >= 59.8}
              >
                Add more takes
              </Button>
            </div>
            {takes.length > 1 && (
              <button
                className="session-pill"
                disabled={busy}
                onClick={() => {
                  setPreviewIndex(0);
                  if (previewVideo.current)
                    previewVideo.current.currentTime = 0;
                  void previewVideo.current?.play().catch(() => {});
                }}
              >
                <Play size={15} />
                Replay from start
              </button>
            )}
            <p className="session-preview-note">
              {seconds < 5
                ? `Record ${Math.max(0, 5 - seconds).toFixed(1)}s more to save. 5s minimum.`
                : takes.length > 1
                  ? `${takes.length} takes become one video.`
                  : "Your complete video."}
              {overlay ? " Photo is included when you save." : ""}
            </p>
            <label className="session-pill session-file-tool">
              Replace video
              <input
                type="file"
                accept="video/*,image/png,image/jpeg,image/webp"
                aria-label="Import video"
                disabled={!ready || busy || finishing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file?.type.startsWith("image/"))
                    void chooseOverlay({
                      file,
                      position: overlayRef.current?.position || "center",
                    });
                  else void importVideo(file);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        ) : (
          <>
            <div className="session-zoom-choices" aria-label="Camera zoom">
              {(zoomPresets.length ? zoomPresets : [1]).map((value) => (
                <button
                  key={value}
                  className="session-zoom"
                  aria-label={`Zoom ${value === 1 ? "1" : value}×`}
                  aria-pressed={Math.abs(zoom - value) < 0.025}
                  disabled={
                    !camera ||
                    !zoomRange ||
                    cameraPreview !== "ready" ||
                    opening ||
                    busy ||
                    finishing ||
                    countdown > 0
                  }
                  onClick={() => requestZoom(value)}
                >
                  {value === 1 ? "1" : value}×
                </button>
              ))}
              {camera &&
                zoomRange &&
                !zoomPresets.some(
                  (value) => Math.abs(zoom - value) < 0.025,
                ) && (
                  <output
                    className="session-zoom-value"
                    aria-label="Current zoom"
                  >
                    {zoom.toFixed(1)}×
                  </output>
                )}
            </div>
            <div
              className="session-duration-choices"
              aria-label="Recording duration"
            >
              {([15, 30, 60] as const).map((value) => (
                <button
                  key={value}
                  className="session-pill"
                  aria-pressed={limit === value}
                  disabled={locked || seconds >= value - 0.2}
                  onClick={() => setLimit(value)}
                >
                  {value}s
                </button>
              ))}
            </div>
            <div className="session-record-row">
              <label
                className={`session-gallery session-file-tool ${locked ? "is-disabled" : ""}`}
                title="Import a video or photo from your phone"
              >
                <span>
                  {galleryUrl ? (
                    <video
                      src={galleryUrl}
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <ImageIcon />
                  )}
                </span>
                <small>Gallery</small>
                <input
                  type="file"
                  accept="video/*,image/png,image/jpeg,image/webp"
                  aria-label="Import video"
                  disabled={!ready || locked}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file?.type.startsWith("image/"))
                      void chooseOverlay({
                        file,
                        position: overlayRef.current?.position || "center",
                      });
                    else void importVideo(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {camera ? (
                <button
                  className={`session-shutter ${recording ? "is-recording" : ""}`}
                  aria-label="Hold to record"
                  disabled={
                    cameraPreview !== "ready" ||
                    opening ||
                    nativeTakePending ||
                    finishing ||
                    busy ||
                    countdown > 0 ||
                    (!recording && seconds >= limit - 0.2)
                  }
                  onContextMenu={(event) => event.preventDefault()}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    beginRecording();
                  }}
                  onPointerUp={() => {
                    if (!timedRecording.current) void stopRecording();
                  }}
                  onPointerCancel={() => {
                    if (!timedRecording.current) void stopRecording();
                  }}
                  onKeyDown={(event) => {
                    if (
                      (event.key === " " || event.key === "Enter") &&
                      !event.repeat
                    ) {
                      event.preventDefault();
                      beginRecording();
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      if (!timedRecording.current) void stopRecording();
                    }
                  }}
                >
                  <span />
                </button>
              ) : (
                <span className="session-shutter-placeholder" />
              )}
              <button
                className="session-preview-check"
                aria-label="Preview video"
                disabled={!takes.length || locked}
                onClick={() => void showPreview()}
              >
                <Check />
                <small>Next</small>
              </button>
            </div>
            {camera && (
              <>
                <p className="session-instruction">
                  {delay
                    ? `Record hands-free after ${delay} seconds.`
                    : "Hold to record. Release to pause."}
                </p>
                <button
                  className="session-tap-record"
                  disabled={
                    (!recording && cameraPreview !== "ready") ||
                    opening ||
                    nativeTakePending ||
                    finishing ||
                    busy ||
                    countdown > 0 ||
                    (!recording && seconds >= limit - 0.2)
                  }
                  onClick={() => beginRecording()}
                >
                  {recording ? (
                    <>
                      <Square size={12} /> Stop recording
                    </>
                  ) : (
                    "Or tap to start recording"
                  )}
                </button>
              </>
            )}
          </>
        )}
        <button
          className="session-quest-toggle"
          aria-label="Quest instructions"
          disabled={busy}
          onClick={() => setSheet("quest")}
        >
          <ChevronUp size={18} />
          <span>Quest</span>
        </button>
      </footer>
      {sheet && (
        <div className="session-sheet-backdrop" onClick={() => setSheet(null)}>
          <section
            ref={sheetElement}
            className="session-tool-sheet"
            aria-label={
              sheet === "quest"
                ? "Quest instructions panel"
                : sheet === "prompt"
                  ? "Teleprompter settings"
                  : "Image overlay settings"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <h2>
                {sheet === "quest"
                  ? "Your quest"
                  : sheet === "prompt"
                    ? "Teleprompter"
                    : "Place your photo"}
              </h2>
              <button
                className="session-tool-icon"
                aria-label="Close panel"
                onClick={() => setSheet(null)}
              >
                <X />
              </button>
            </header>
            {sheet === "quest" ? (
              <>
                <p className="session-sheet-hook">{run.quest.hook}</p>
                <ol>
                  {run.quest.beats.map((beat, index) => (
                    <li key={index}>
                      <strong>{beat.label}</strong>
                      <p>{beat.action}</p>
                      <small>{beat.filming}</small>
                    </li>
                  ))}
                </ol>
              </>
            ) : sheet === "prompt" ? (
              <>
                <label className="session-prompt-label">
                  Your script
                  <textarea
                    aria-label="Teleprompter script"
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    maxLength={500}
                    rows={4}
                  />
                </label>
                <p>Only you see this. It won’t appear in your video.</p>
                <div
                  className="session-setting-pills"
                  aria-label="Scroll speed"
                >
                  {(["slow", "normal", "fast"] as const).map((speed) => (
                    <button
                      className="session-pill"
                      key={speed}
                      aria-pressed={promptSpeed === speed}
                      onClick={() => setPromptSpeed(speed)}
                    >
                      {speed}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={() => {
                    setPromptOn(!promptOn);
                    setSheet(null);
                  }}
                  disabled={!promptText.trim()}
                >
                  {promptOn ? "Hide teleprompter" : "Show teleprompter"}
                </Button>
              </>
            ) : (
              <>
                <p>This photo appears in your saved video.</p>
                <div className="session-setting-pills">
                  {positions.map(({ value, label }) => (
                    <button
                      className="session-pill"
                      key={value}
                      aria-pressed={overlay?.position === value}
                      onClick={() => {
                        if (overlay)
                          void chooseOverlay({ ...overlay, position: value });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button onClick={() => setSheet(null)}>Done</Button>
                <button
                  className="session-pill"
                  onClick={() => {
                    void chooseOverlay();
                    setSheet(null);
                  }}
                >
                  Remove photo
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
