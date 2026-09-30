/** Origins are public build configuration. Never put server credentials here. */
export function isNativeApp(): boolean {
  return [true, "true"].includes(import.meta.env.VITE_NATIVE);
}
export const IS_NATIVE = isNativeApp();

function configuredOrigin(value: unknown, name: string, loopback = false) {
  try {
    if (typeof value !== "string" || !value || value !== value.trim())
      throw new Error();
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          loopback &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        ))
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(`This app build needs a valid ${name} origin.`);
  }
}

export function apiOrigin(): string {
  if (!isNativeApp()) return window.location.origin;
  if (
    [true, "true"].includes(import.meta.env.VITE_DEMO_MODE) &&
    import.meta.env.VITE_NATIVE_DEMO_API_ORIGIN
  )
    return configuredOrigin(
      import.meta.env.VITE_NATIVE_DEMO_API_ORIGIN,
      "native demo API",
      true,
    );
  return configuredOrigin(import.meta.env.VITE_API_ORIGIN, "API");
}

/** API requests can carry credentials, so an external URL must never pass here. */
export function apiUrl(path: string): string {
  const origin =
    !isNativeApp() && path.startsWith("/")
      ? "https://sidequest.invalid"
      : apiOrigin();
  const url = new URL(path, `${origin}/`);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/api/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path)
  )
    throw new Error("This API address is not trusted.");
  return isNativeApp() ? url.href : `${url.pathname}${url.search}`;
}

/** Resolve API-hosted media; leave bundled assets and local blob previews alone. */
export function mediaUrl(src: string): string {
  return src.startsWith("/api/") ? apiUrl(src) : src;
}

export function isTrustedApiUrl(src: string): boolean {
  const url = new URL(mediaUrl(src), window.location.href);
  return (
    url.origin === apiOrigin() &&
    !url.username &&
    !url.password &&
    url.pathname.startsWith("/api/")
  );
}

/** Public shares must use the website, never the packaged WebView origin. */
export function publicUrl(path: string): string {
  const origin = isNativeApp()
    ? configuredOrigin(import.meta.env.VITE_PUBLIC_ORIGIN, "public website")
    : window.location.origin;
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path)
  )
    throw new Error("This public address is not valid.");
  const url = new URL(path, `${origin}/`);
  if (url.origin !== origin)
    throw new Error("This public address is not valid.");
  return url.href;
}

/** Native API images/video use CORS rather than no-cors cross-origin embedding. */
export function mediaCrossOrigin(src?: string): "anonymous" | undefined {
  return src && isNativeApp() && isTrustedApiUrl(src) ? "anonymous" : undefined;
}
