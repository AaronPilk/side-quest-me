import { MEDIA_LIMITS } from "../../shared/media";
import { isNativeApp } from "./runtime";

const CACHE_FOLDER = "sidequest-shares";
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const WRITE_CHUNK_BYTES = 1024 * 1024;
const activeExports = new Set<string>();

export function isShareCancellation(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as { name?: string; message?: string };
  return (
    error.name === "AbortError" ||
    /^Share cancel(?:ed|led)$/i.test(error.message ?? "")
  );
}

export async function copyText(text: string): Promise<void> {
  if (isNativeApp()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

export async function sharePublicLink(options: {
  title: string;
  url: string;
  text?: string;
}): Promise<"shared" | "copied"> {
  // Call the browser share API before any await: it requires a user gesture.
  if (!isNativeApp()) {
    if (navigator.share) {
      await navigator.share(options);
      return "shared";
    }
    await copyText(options.url);
    return "copied";
  }
  const { Share } = await import("@capacitor/share");
  await Share.share(options);
  return "shared";
}

/** Retain recently shared files while the receiving app reads them. This runs
 * on native startup and before another export; it never touches other caches. */
export async function cleanupNativeShareCache(now = Date.now()): Promise<void> {
  if (!isNativeApp()) return;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const listing = await Filesystem.readdir({
    path: CACHE_FOLDER,
    directory: Directory.Cache,
  }).catch(() => undefined);
  if (!listing) return;
  await Promise.all(
    listing.files.map(async (file) => {
      const timestamp = /^(\d+)-[a-f0-9-]+-/.exec(file.name)?.[1];
      const path = `${CACHE_FOLDER}/${file.name}`;
      if (
        file.type !== "file" ||
        !timestamp ||
        activeExports.has(path) ||
        now - Number(timestamp) < CACHE_LIFETIME_MS
      )
        return;
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(
        () => undefined,
      );
    }),
  );
}

async function base64Chunk(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16384)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}

/** In the app, Save is an explicit iOS share sheet with Save Video / Save to
 * Files choices. A resolved promise does not claim the user saved or posted. */
export async function exportVideoFile(
  file: File,
  options: { title: string; text?: string },
): Promise<void> {
  if (!file.size || file.size > MEDIA_LIMITS.maxOutputBytes)
    throw new Error("This video is empty or exceeds the export limit.");
  if (!isNativeApp()) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  await cleanupNativeShareCache();
  const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
  const path = `${CACHE_FOLDER}/${Date.now()}-${crypto.randomUUID()}-${name}`;
  activeExports.add(path);
  let shared = false;
  try {
    // Avoid bridging a 100MB video as one giant base64 string on iPhone.
    for (let offset = 0; offset < file.size; offset += WRITE_CHUNK_BYTES) {
      const data = await base64Chunk(
        file.slice(offset, offset + WRITE_CHUNK_BYTES),
      );
      if (offset === 0)
        await Filesystem.writeFile({
          path,
          directory: Directory.Cache,
          data,
          recursive: true,
        });
      else
        await Filesystem.appendFile({ path, directory: Directory.Cache, data });
    }
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });
    await Share.share({ ...options, files: [uri] });
    shared = true;
  } finally {
    activeExports.delete(path);
    // On success the receiver may still be importing. Stale-cache cleanup
    // handles that file later; failures/cancellation cannot leave a partial file.
    if (!shared)
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(
        () => undefined,
      );
  }
}
