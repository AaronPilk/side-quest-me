import { nativeCamera, usesNativeCamera } from "./native-camera";

const DATABASE = "sidequest-private-capture-drafts";
const STORE = "drafts";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let generation = 0;

export type CaptureDraft = {
  owner: string;
  run: string;
  slot: number;
  baseClipId: string | null;
  file: Blob;
  takes?: import("./recording-session").RecordedTake[];
  overlay?: import("./recording-session").ImageOverlay;
  duration: number;
  start: number;
  end: number;
  fit: "fit" | "fill";
  crop: number;
  mute: boolean;
  caption: string;
  source: string;
  updatedAt: number;
};

export const captureDraftGeneration = () => generation;
const key = (owner: string, run: string, slot: number) =>
  JSON.stringify([owner, run, slot]);

async function database() {
  if (!globalThis.indexedDB)
    throw new Error("This browser cannot keep a local video draft.");
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function write(action: (store: IDBObjectStore) => void) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function loadCaptureDraft(
  owner: string,
  run: string,
  slot: number,
) {
  const db = await database();
  try {
    const draft = await new Promise<CaptureDraft | undefined>(
      (resolve, reject) => {
        const request = db
          .transaction(STORE)
          .objectStore(STORE)
          .get(key(owner, run, slot));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    if (draft && Date.now() - draft.updatedAt > MAX_AGE) {
      await deleteCaptureDraft(owner, run, slot);
      return undefined;
    }
    return draft;
  } finally {
    db.close();
  }
}

export async function materializeCaptureDraft(
  draft: CaptureDraft,
): Promise<CaptureDraft> {
  const takes = draft.takes?.map((take) => take.file) || [draft.file];
  const videos = new Set([draft.file, ...takes]);
  if (
    !takes.length ||
    takes.length > 30 ||
    [...videos].some((file) => !(file instanceof Blob) || !file.size) ||
    [...videos].reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024 ||
    (draft.overlay &&
      (!(draft.overlay.file instanceof Blob) ||
        !draft.overlay.file.size ||
        draft.overlay.file.size > 5 * 1024 * 1024))
  )
    throw new Error("This saved video draft could not be restored.");

  const files = new Set(videos);
  if (draft.overlay) files.add(draft.overlay.file);
  const copies = new Map<Blob, Blob>();
  for (const file of files) {
    // A Blob wrapper can retain an IndexedDB file backing. Reading its bytes
    // gives playback and later draft writes an independent in-memory copy.
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size)
      throw new Error("This saved video draft could not be restored.");
    copies.set(file, new Blob([bytes], { type: file.type }));
  }
  return {
    ...draft,
    file: copies.get(draft.file)!,
    ...(draft.takes
      ? {
          takes: draft.takes.map((take) => ({
            ...take,
            file: copies.get(take.file)!,
          })),
        }
      : {}),
    ...(draft.overlay
      ? {
          overlay: {
            ...draft.overlay,
            file: copies.get(draft.overlay.file)!,
          },
        }
      : {}),
  };
}

export async function saveCaptureDraft(
  draft: CaptureDraft,
  expectedGeneration: number,
) {
  if (
    draft.overlay &&
    (!draft.overlay.file.size || draft.overlay.file.size > 5 * 1024 * 1024)
  )
    throw new Error("Choose an overlay image no larger than 5 MB.");
  const files = draft.takes?.map((take) => take.file) || [draft.file];
  if (
    !files.length ||
    files.length > 30 ||
    files.some((file) => !file.size) ||
    files.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024
  )
    throw new Error("This video cannot be kept as a local draft.");
  await write((store) => {
    // A recorder stopping during sign-out must not recreate deleted footage.
    if (expectedGeneration !== generation) return;
    store.put(draft, key(draft.owner, draft.run, draft.slot));
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const current = cursor.result;
      if (!current) return;
      if (Date.now() - current.value.updatedAt > MAX_AGE) current.delete();
      current.continue();
    };
  });
}

export async function deleteCaptureDraft(
  owner: string,
  run: string,
  slot: number,
) {
  await write((store) => store.delete(key(owner, run, slot)));
}

export async function clearCaptureDrafts() {
  generation++;
  await Promise.all([
    usesNativeCamera() ? nativeCamera.clearRecordings() : Promise.resolve(),
    globalThis.indexedDB ? write((store) => store.clear()) : Promise.resolve(),
  ]);
}
