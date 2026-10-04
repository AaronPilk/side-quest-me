import { useRef, type PointerEvent } from "react";
import {
  boundOverlayTransform,
  overlayLayout,
  overlayTransformForLayout,
  type OverlaySize,
  type OverlayTransform,
} from "../../shared/image-overlay.mjs";
import type { ImageOverlay } from "../lib/recording-session";

type Point = { x: number; y: number };
const center = (points: Point[]) => ({
  x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
  y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
});
const distance = (points: Point[]) =>
  points.length < 2
    ? 0
    : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

export function ImageOverlayPreview({
  overlay,
  url,
  size,
  disabled,
  onSize,
  onChange,
  onCommit,
  onError,
  onSettings,
}: {
  overlay: ImageOverlay;
  url: string;
  size: OverlaySize;
  disabled: boolean;
  onSize: (size: OverlaySize) => void;
  onChange: (transform: OverlayTransform) => void;
  onCommit: () => void;
  onError: () => void;
  onSettings: () => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const current = useRef<OverlayTransform | null>(null);
  const gesture = useRef<{
    origin: OverlayTransform;
    center: Point;
    distance: number;
    width: number;
    height: number;
  } | null>(null);
  const layout =
    size.width && size.height
      ? overlayLayout(size, overlay.position, overlay.transform)
      : null;

  function rebase() {
    const points = [...pointers.current.values()];
    const rect = frame.current?.getBoundingClientRect();
    if (!layout || !points.length || !rect?.width || !rect.height) {
      gesture.current = null;
      return;
    }
    gesture.current = {
      origin: current.current || overlayTransformForLayout(layout),
      center: center(points),
      distance: distance(points),
      width: rect.width,
      height: rect.height,
    };
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    rebase();
    if (!pointers.current.size && current.current) {
      onCommit();
      current.current = null;
    }
  }
  return (
    <div
      ref={frame}
      className="session-overlay-frame"
      aria-label="Image overlay preview"
    >
      <button
        type="button"
        className="session-overlay-handle"
        aria-label="Move and resize photo. Drag to move, pinch to resize. Use arrow keys to move, plus or minus to resize."
        disabled={disabled || !layout}
        style={
          layout
            ? {
                left: `${(layout.left / 1080) * 100}%`,
                top: `${(layout.top / 1920) * 100}%`,
                width: `${(layout.width / 1080) * 100}%`,
                height: `${(layout.height / 1920) * 100}%`,
              }
            : { visibility: "hidden" }
        }
        onDoubleClick={onSettings}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (disabled || event.button !== 0 || pointers.current.size >= 2)
            return;
          event.preventDefault();
          if (!pointers.current.size) current.current = null;
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          event.currentTarget.setPointerCapture(event.pointerId);
          rebase();
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          if (
            !pointers.current.has(event.pointerId) ||
            !gesture.current ||
            disabled
          )
            return;
          event.preventDefault();
          pointers.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          const points = [...pointers.current.values()],
            start = gesture.current,
            midpoint = center(points);
          const next = boundOverlayTransform(size, {
            x: start.origin.x + (midpoint.x - start.center.x) / start.width,
            y: start.origin.y + (midpoint.y - start.center.y) / start.height,
            width:
              start.origin.width *
              (start.distance > 0 && points.length === 2
                ? distance(points) / start.distance
                : 1),
          });
          current.current = next;
          onChange(next);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={(event) => {
          if (pointers.current.has(event.pointerId)) finish(event);
        }}
        onKeyDown={(event) => {
          if (!layout || disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSettings();
            return;
          }
          if (
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
            ].includes(event.key)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const next = overlayTransformForLayout(layout),
            step = event.shiftKey ? 0.05 : 0.01;
          if (event.key === "ArrowLeft") next.x -= step;
          if (event.key === "ArrowRight") next.x += step;
          if (event.key === "ArrowUp") next.y -= step;
          if (event.key === "ArrowDown") next.y += step;
          if (["+", "="].includes(event.key)) next.width += 0.025;
          if (event.key === "-") next.width -= 0.025;
          onChange(boundOverlayTransform(size, next));
          onCommit();
        }}
      >
        <img
          className={`session-image-overlay position-${overlay.position}`}
          src={url}
          alt="Your image overlay"
          draggable={false}
          onLoad={(event) =>
            onSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          onError={onError}
        />
      </button>
    </div>
  );
}
