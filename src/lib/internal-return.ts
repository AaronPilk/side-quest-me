const RETURN_KEY = "sq-return-to";
const INTERNAL_ORIGIN = "https://sidequest.invalid";
const RETURN_PATH =
  /^\/(?:create|discover|activity|journal|rewards|profile(?:\/import)?|account|studio|operator|business|admin|settings(?:\/demo-tools)?|series(?:\/[A-Za-z0-9_-]+(?:\/edit)?)?|(?:posts|creators|quests|runs|offers|originals)\/[A-Za-z0-9_-]+)?$/;

/** Only return to a known app route, never a network URL or an encoded path escape. */
export function validateReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    // Check the original path too: URL normalizes dot segments before validation.
    const originalPath = value.split(/[?#]/, 1)[0];
    if (
      parsed.origin !== INTERNAL_ORIGIN ||
      !RETURN_PATH.test(originalPath) ||
      parsed.pathname !== originalPath
    )
      return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function rememberReturnTo(value: string): void {
  const target = validateReturnTo(value);
  if (target) sessionStorage.setItem(RETURN_KEY, target);
  else sessionStorage.removeItem(RETURN_KEY);
}

export function readReturnTo(fallback = "/create"): string {
  return (
    validateReturnTo(sessionStorage.getItem(RETURN_KEY)) ||
    validateReturnTo(fallback) ||
    "/create"
  );
}

export function consumeReturnTo(fallback = "/create"): string {
  const target = readReturnTo(fallback);
  sessionStorage.removeItem(RETURN_KEY);
  return target;
}
