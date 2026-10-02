import {
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type VideoHTMLAttributes,
} from "react";
import { accessToken } from "../lib/auth";
import { MEDIA_LIMITS } from "../../shared/media";
import { isTrustedApiUrl, mediaCrossOrigin, mediaUrl } from "../lib/runtime";

export function mediaNeedsAuth(src: string) {
  const url = new URL(mediaUrl(src), window.location.href);
  return (
    isTrustedApiUrl(src) &&
    (url.pathname.startsWith("/api/media/") ||
      /^\/api\/community\/offers\/[^/]+\/media$/.test(url.pathname) ||
      /^\/api\/community\/reviews\/[^/]+\/media$/.test(url.pathname) ||
      /^\/api\/operator\/reviews\/[^/]+\/media\//.test(url.pathname))
  );
}

/** Never send session credentials to a URL provided by another origin. */
export async function fetchMediaBlob(
  src: string,
  kind: "video" | "image" = "video",
  signal?: AbortSignal,
) {
  const protectedRoute = mediaNeedsAuth(src);
  const token = protectedRoute ? await accessToken() : undefined;
  if (protectedRoute && !token)
    throw new Error("Sign in again to view your private video.");
  const response = await fetch(mediaUrl(src), {
    signal,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const mime = response.headers.get("content-type") || "";
  if (!response.ok || !mime.startsWith(`${kind}/`) || !response.body) {
    await response.body?.cancel();
    throw new Error(
      `Your ${kind === "image" ? "thumbnail" : "video"} could not be loaded. Refresh and try again.`,
    );
  }
  const cap = kind === "image" ? 2 * 1024 * 1024 : MEDIA_LIMITS.maxOutputBytes;
  if (Number(response.headers.get("content-length")) > cap) {
    await response.body.cancel();
    throw new Error("This media file exceeds the download limit.");
  }
  const reader = response.body.getReader(),
    parts: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > cap)
        throw new Error("This media file exceeds the download limit.");
      parts.push(new Uint8Array(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("This media file is empty.");
  return new Blob(parts, { type: mime });
}

function useMediaSource(
  src: string | undefined,
  kind: "video" | "image",
  enabled = true,
): { source?: string; url?: string; error?: string } {
  const [state, setState] = useState<{
    source: string;
    url?: string;
    error?: string;
  }>({ source: "" });
  const protectedRoute = !!src && mediaNeedsAuth(src);
  useEffect(() => {
    if (!src || !protectedRoute || !enabled) return;
    const controller = new AbortController();
    let created: string | undefined;
    setState({ source: src });
    fetchMediaBlob(src, kind, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        created = URL.createObjectURL(blob);
        setState({ source: src, url: created });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            source: src,
            error:
              error instanceof Error
                ? error.message
                : "Media could not be loaded.",
          });
      });
    return () => {
      controller.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, kind, enabled, protectedRoute]);
  return protectedRoute
    ? state.source === src
      ? state
      : { source: src }
    : { source: src, url: src ? mediaUrl(src) : src };
}

export function AuthVideo({
  src,
  poster,
  eager = true,
  ...props
}: VideoHTMLAttributes<HTMLVideoElement> & { eager?: boolean }) {
  const [requested, setRequested] = useState(eager);
  const media = useMediaSource(src, "video", requested);
  const image = useMediaSource(poster, "image");
  if (!requested && src && mediaNeedsAuth(src))
    return (
      <button className="button secondary" onClick={() => setRequested(true)}>
        Load private clip
      </button>
    );
  if (media.error)
    return (
      <p className="notice error" role="alert">
        {media.error}
      </p>
    );
  return (
    <video
      {...props}
      crossOrigin={mediaCrossOrigin(src || poster)}
      src={media.url}
      poster={image.url}
      aria-busy={!!src && !media.url}
      preload={props.preload || "metadata"}
    />
  );
}

export function AuthImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const media = useMediaSource(src, "image");
  if (media.error)
    return (
      <span
        className="support"
        role="img"
        aria-label={alt || "Thumbnail unavailable"}
      >
        Thumbnail unavailable
      </span>
    );
  return (
    <img
      {...props}
      crossOrigin={mediaCrossOrigin(src)}
      src={media.url}
      alt={alt || ""}
      loading={props.loading || "lazy"}
      aria-busy={!!src && !media.url}
    />
  );
}
