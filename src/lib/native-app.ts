import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { isNativeApp, publicUrl } from "./runtime";
import { readReturnTo, validateReturnTo } from "./internal-return";

export const NATIVE_AUTH_REDIRECT = "com.aaronpilk.sidequest://auth/callback";
const PENDING_SIGN_IN = "sq-native-sign-in-v1";
const SIGN_IN_LIFETIME = 24 * 60 * 60 * 1000;
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AuthCallback = { kind: "code"; code: string } | { kind: "error" };
type NativeAuth = {
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
  startAutoRefresh: () => Promise<void>;
  stopAutoRefresh: () => Promise<void>;
};

/** PKCE codes only: never install tokens or navigate to a URL supplied by a link. */
export function parseNativeAuthCallback(value: string): AuthCallback | null {
  if (value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value))
    return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "com.aaronpilk.sidequest:" ||
      url.host !== "auth" ||
      url.pathname !== "/callback" ||
      url.username ||
      url.password ||
      // URL parsing normalizes dot segments; do not accept an alternate path.
      (!value.startsWith(`${NATIVE_AUTH_REDIRECT}?`) &&
        !value.startsWith(`${NATIVE_AUTH_REDIRECT}#`))
    )
      return null;
    const parameters = new URLSearchParams(url.search);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const allowedErrors = new Set(["error", "error_code", "error_description"]);
    const seen = new Set<string>();
    for (const [key] of [...parameters, ...fragment]) {
      if (
        seen.has(key) ||
        (key !== "code" && !allowedErrors.has(key)) ||
        (key === "code" && fragment.has("code"))
      )
        return null;
      seen.add(key);
    }
    const code = parameters.get("code");
    if (code) {
      if (seen.size !== 1 || !/^[A-Za-z0-9._~-]{8,2048}$/.test(code))
        return null;
      return { kind: "code", code };
    }
    return [...allowedErrors].some((key) => seen.has(key))
      ? { kind: "error" }
      : null;
  } catch {
    return null;
  }
}

export function rememberNativeSignIn(
  returnTo: string,
  storage: StorageAccess = window.localStorage,
  now = Date.now(),
): void {
  storage.setItem(
    PENDING_SIGN_IN,
    JSON.stringify({
      version: 1,
      returnTo: validateReturnTo(returnTo) ?? "/create",
      createdAt: now,
    }),
  );
}

function pendingReturnTo(storage: StorageAccess, now = Date.now()): string {
  let saved: { version?: number; returnTo?: unknown; createdAt?: number };
  try {
    saved = JSON.parse(storage.getItem(PENDING_SIGN_IN) ?? "null");
  } catch {
    throw new Error("missing_sign_in");
  }
  const route = saved && validateReturnTo(saved.returnTo);
  if (
    !saved ||
    saved.version !== 1 ||
    !route ||
    typeof saved.createdAt !== "number" ||
    now < saved.createdAt ||
    now - saved.createdAt > SIGN_IN_LIFETIME
  )
    throw new Error("missing_sign_in");
  return route;
}

export function emailSignInRedirect(): string {
  if (!isNativeApp()) return `${window.location.origin}/auth/callback`;
  // The app may be terminated while Mail is open. Persist only the validated
  // destination; Supabase persists its separate PKCE verifier in app storage.
  rememberNativeSignIn(readReturnTo());
  return NATIVE_AUTH_REDIRECT;
}

type ExchangeResult = { route: string } | { error: string };
const exchanges = new Map<
  string,
  { promise: Promise<ExchangeResult>; delivered: boolean }
>();
const SIGN_IN_ERROR =
  "This sign-in link could not be completed. Request a new link in this app and open it on this device.";

export function createNativeAuthHandler({
  auth,
  onComplete,
  onError,
  storage = window.localStorage,
  isActive = () => true,
}: {
  auth: NativeAuth;
  onComplete: (route: string) => void;
  onError: (message: string) => void;
  storage?: StorageAccess;
  isActive?: () => boolean;
}) {
  return async (value: string): Promise<void> => {
    const callback = parseNativeAuthCallback(value);
    if (!callback || !isActive()) return;
    if (callback.kind === "error") {
      onError(SIGN_IN_ERROR);
      return;
    }
    let exchange = exchanges.get(callback.code);
    if (!exchange) {
      exchange = {
        delivered: false,
        promise: (async (): Promise<ExchangeResult> => {
          try {
            const route = pendingReturnTo(storage);
            const result = await auth.exchangeCodeForSession(callback.code);
            if (result.error) return { error: SIGN_IN_ERROR };
            // Failure to clear an optional destination must not undo sign-in.
            try {
              storage.removeItem(PENDING_SIGN_IN);
            } catch {
              /* Session establishment already succeeded. */
            }
            return { route };
          } catch {
            return { error: SIGN_IN_ERROR };
          }
        })(),
      };
      exchanges.set(callback.code, exchange);
      // Bound in-memory deduplication. Never persist authorization codes.
      if (exchanges.size > 20) exchanges.delete(exchanges.keys().next().value!);
    }
    const result = await exchange.promise;
    if (!isActive() || exchange.delivered) return;
    exchange.delivered = true;
    if ("error" in result) onError(result.error);
    else {
      // Closing Safari is optional (the link may have arrived from Mail).
      void Browser.close().catch(() => {});
      onComplete(result.route);
    }
  };
}

export type NativeLink =
  | { kind: "internal"; route: string }
  | { kind: "external"; url: string }
  | null;
export function classifyNativeLink(
  value: string,
  localBase: string,
  publicOrigin: string,
): NativeLink {
  if (!value || value.startsWith("#")) return null;
  try {
    // A custom-scheme URL can serialize its origin as "null". Its full href
    // remains a usable base; compare scheme + host for local app navigation.
    const local = new URL(localBase);
    const url = new URL(value, local);
    if (url.username || url.password) return null;
    if (url.protocol === local.protocol && url.host === local.host) return null;
    if (url.origin === publicOrigin) {
      const route = validateReturnTo(url.pathname + url.search + url.hash);
      if (route) return { kind: "internal", route };
    }
    return url.protocol === "https:" || url.protocol === "http:"
      ? { kind: "external", url: url.href }
      : null;
  } catch {
    return null;
  }
}

/** Register once per mounted app; cleanup also handles async listener setup. */
export function startNativeApp({
  auth,
  onNavigate,
  onError,
}: {
  auth: NativeAuth | null;
  onNavigate: (route: string, replace?: boolean) => void;
  onError: (message: string) => void;
}): () => void {
  if (!isNativeApp() || !Capacitor.isNativePlatform()) return () => {};
  let disposed = false;
  const listeners: PluginListenerHandle[] = [];
  const handleAuth = auth
    ? createNativeAuthHandler({
        auth,
        onComplete: (route) => onNavigate(route, true),
        onError,
        isActive: () => !disposed,
      })
    : async () => {};
  async function keepListener(promise: Promise<PluginListenerHandle>) {
    const listener = await promise;
    if (disposed) await listener.remove();
    else listeners.push(listener);
  }
  async function refreshState(isActive: boolean) {
    if (disposed || !auth) return;
    if (isActive) await auth.startAutoRefresh();
    else await auth.stopAutoRefresh();
  }
  void (async () => {
    try {
      await Promise.all([
        keepListener(
          CapacitorApp.addListener("appUrlOpen", ({ url }) => {
            void handleAuth(url);
          }),
        ),
        keepListener(
          CapacitorApp.addListener("appStateChange", ({ isActive }) => {
            void refreshState(isActive).catch(() => {
              if (!disposed)
                onError(
                  "Your sign-in could not refresh. Reopen the app to retry.",
                );
            });
          }),
        ),
      ]);
      if (disposed) return;
      const [launch, state] = await Promise.all([
        CapacitorApp.getLaunchUrl(),
        CapacitorApp.getState(),
      ]);
      if (disposed) return;
      await refreshState(state.isActive);
      if (launch?.url) await handleAuth(launch.url);
    } catch {
      if (!disposed)
        onError(
          "Phone sign-in could not start. Close and reopen the app to retry.",
        );
    }
  })();

  const onLink = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
    if (!link || link.hasAttribute("download")) return;
    const target = classifyNativeLink(
      link.getAttribute("href") ?? "",
      window.location.href,
      new URL(publicUrl("/")).origin,
    );
    if (!target) return;
    event.preventDefault();
    if (target.kind === "internal") onNavigate(target.route);
    else
      void Browser.open({ url: target.url }).catch(() => {
        if (!disposed)
          onError("That link could not open. Please try it again.");
      });
  };
  document.addEventListener("click", onLink);
  return () => {
    disposed = true;
    document.removeEventListener("click", onLink);
    for (const listener of listeners) void listener.remove().catch(() => {});
    // The next mount resumes refresh using the current app state.
    void auth?.stopAutoRefresh().catch(() => {});
  };
}
