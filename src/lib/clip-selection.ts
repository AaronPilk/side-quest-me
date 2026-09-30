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
