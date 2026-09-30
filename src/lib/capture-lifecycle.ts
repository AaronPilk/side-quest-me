import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { isNativeApp } from "./runtime";

/** A foreground return permits a new user action; it never resumes recording. */
export function watchCaptureActivity(onChange: (active: boolean) => void) {
  let disposed = false;
  let pageVisible = !document.hidden;
  let nativeActive = true;
  let latest: boolean | undefined;
  const listeners: PluginListenerHandle[] = [];
  const emit = () => {
    const active = pageVisible && nativeActive;
    if (!disposed && active !== latest) {
      latest = active;
      onChange(active);
    }
  };
  const visibility = () => {
    pageVisible = !document.hidden;
    emit();
  };
  const hide = () => {
    pageVisible = false;
    emit();
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", visibility);
  emit();
  if (isNativeApp()) {
    const keepListener = async (promise: Promise<PluginListenerHandle>) => {
      const listener = await promise;
      if (disposed) await listener.remove();
      else listeners.push(listener);
    };
    void (async () => {
      try {
        // On iOS pause means didEnterBackground. appStateChange also fires for
        // permission dialogs, which must not cancel the initial camera grant.
        await Promise.all([
          keepListener(
            App.addListener("pause", () => {
              nativeActive = false;
              emit();
            }),
          ),
          keepListener(
            App.addListener("resume", () => {
              nativeActive = true;
              emit();
            }),
          ),
        ]);
      } catch {
        // Web visibility/page events remain available if the native bridge fails.
      }
    })();
  }
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("pageshow", visibility);
    for (const listener of listeners) void listener.remove().catch(() => {});
  };
}
