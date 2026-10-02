import { afterEach, expect, it, vi } from "vitest";

vi.mock("@capacitor/browser", () => ({
  Browser: { close: vi.fn(async () => {}) },
}));

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("a rate-limited resend cannot destroy the real SDK's first native sign-in flow", async () => {
  const storage = memoryStorage();
  vi.stubEnv("VITE_NATIVE", "true");
  vi.stubEnv("VITE_DEMO_MODE", "false");
  vi.stubEnv("VITE_SUPABASE_URL", "https://native-auth-test.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { href: "capacitor://localhost/", origin: "null" },
      localStorage: storage,
    }),
  );
  vi.stubGlobal("document", { visibilityState: "hidden" });
  vi.stubGlobal("localStorage", storage);
  // A WKWebView does not offer BroadcastChannel; avoid Node's open handle.
  vi.stubGlobal("BroadcastChannel", undefined);
  let sends = 0;
  let firstRedirect = "";
  let expectedVerifier = "";
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/otp") {
        const redirect = url.searchParams.get("redirect_to")!;
        if (sends++ === 0) {
          firstRedirect = redirect;
          const flowId = new URL(redirect).searchParams.get("sb_flow_id");
          expectedVerifier = JSON.parse(
            storage.getItem(
              `sb-native-auth-test-auth-token-flow-${flowId}-code-verifier`,
            )!,
          );
          return new Response("{}", { status: 200 });
        }
        return new Response(
          JSON.stringify({
            code: "over_email_send_rate_limit",
            msg: "rate limit",
          }),
          { status: 429, headers: { "x-supabase-api-version": "2024-01-01" } },
        );
      }
      if (url.pathname === "/auth/v1/token") {
        expect(url.searchParams.get("grant_type")).toBe("pkce");
        expect(JSON.parse(String(init?.body))).toEqual({
          auth_code: "fresh-auth-code-001",
          code_verifier: expectedVerifier,
        });
        return new Response(
          JSON.stringify({
            access_token: "fixture-access-token",
            refresh_token: "fixture-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
            user: {
              id: "00000000-0000-4000-8000-000000000001",
              aud: "authenticated",
              email: "auth-fixture@example.test",
              app_metadata: {},
              user_metadata: {},
              created_at: "2026-10-02T19:00:00Z",
            },
          }),
          { status: 200 },
        );
      }
      throw new Error("Unexpected auth request");
    },
  );
  vi.stubGlobal("fetch", transport);
  const { supabase } = await import("../src/lib/auth");
  const {
    createNativeAuthHandler,
    NATIVE_AUTH_REDIRECT,
    rememberNativeSignIn,
  } = await import("../src/lib/native-app");
  expect(supabase).not.toBeNull();
  const auth = supabase!.auth;
  await auth.getSession();
  rememberNativeSignIn("/create", storage);
  const credentials = {
    email: "auth-fixture@example.test",
    options: { emailRedirectTo: NATIVE_AUTH_REDIRECT },
  };
  expect((await auth.signInWithOtp(credentials)).error).toBeNull();
  expect(new URL(firstRedirect).searchParams.get("sb_flow_id")).toMatch(
    /^[A-Za-z0-9_-]{8,64}$/,
  );
  expect((await auth.signInWithOtp(credentials)).error?.code).toBe(
    "over_email_send_rate_limit",
  );
  // This is the real SDK cleanup seen on the failing phone: its legacy
  // fallback is absent, while the first email's scoped verifier survives.
  expect(
    storage.getItem("sb-native-auth-test-auth-token-code-verifier"),
  ).toBeNull();
  const complete = vi.fn(),
    error = vi.fn();
  const callback = new URL(firstRedirect);
  callback.searchParams.set("code", "fresh-auth-code-001");
  await createNativeAuthHandler({
    auth,
    storage,
    onComplete: complete,
    onError: error,
  })(callback.href);
  expect(error).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledExactlyOnceWith("/create");
  expect((await auth.getSession()).data.session?.user.id).toBe(
    "00000000-0000-4000-8000-000000000001",
  );
  expect(transport).toHaveBeenCalledTimes(3);
  await auth.stopAutoRefresh();
});
