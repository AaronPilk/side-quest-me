import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  enabled: true,
  platform: true,
  listeners: new Map<
    string,
    (event: { url?: string; isActive?: boolean }) => void
  >(),
  removers: [] as ReturnType<typeof vi.fn>[],
  launch: undefined as { url: string } | undefined,
  close: vi.fn(async () => {}),
  open: vi.fn(async () => {}),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.platform },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: { close: native.close, open: native.open },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(
      async (
        event: string,
        handler: (event: { url?: string; isActive?: boolean }) => void,
      ) => {
        native.listeners.set(event, handler);
        const remove = vi.fn(async () => {});
        native.removers.push(remove);
        return { remove };
      },
    ),
    getLaunchUrl: async () => native.launch,
    getState: async () => ({ isActive: true }),
  },
}));
vi.mock("../src/lib/runtime", () => ({
  isNativeApp: () => native.enabled,
  publicUrl: (path: string) => `https://sidequest.example${path}`,
}));

import {
  classifyNativeLink,
  createNativeAuthHandler,
  emailSignInRedirect,
  NATIVE_AUTH_REDIRECT,
  parseNativeAuthCallback,
  rememberNativeSignIn,
  startNativeApp,
} from "../src/lib/native-app";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}
function authFixture() {
  return {
    exchangeCodeForSession: vi.fn(async (_code: string) => ({
      error: null as unknown,
    })),
    startAutoRefresh: vi.fn(async () => {}),
    stopAutoRefresh: vi.fn(async () => {}),
  };
}
let local: ReturnType<typeof memoryStorage>;
let session: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  native.enabled = true;
  native.platform = true;
  native.launch = undefined;
  native.listeners.clear();
  native.removers = [];
  native.close.mockClear();
  native.open.mockClear();
  local = memoryStorage();
  session = memoryStorage();
  vi.stubGlobal("window", {
    location: { origin: "null", href: "capacitor://localhost/create" },
    localStorage: local,
    sessionStorage: session,
  });
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("document", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

describe("native sign-in callback validation", () => {
  it("accepts only a PKCE code at the exact configured callback", () => {
    expect(
      parseNativeAuthCallback(`${NATIVE_AUTH_REDIRECT}?code=abcdefgh-1234`),
    ).toEqual({
      kind: "code",
      code: "abcdefgh-1234",
    });
    for (const url of [
      "https://auth/callback?code=abcdefgh",
      "com.attacker.app://auth/callback?code=abcdefgh",
      "com.aaronpilk.sidequest://evil/callback?code=abcdefgh",
      "com.aaronpilk.sidequest://auth/not-callback?code=abcdefgh",
      "com.aaronpilk.sidequest://user@auth/callback?code=abcdefgh",
      "com.aaronpilk.sidequest://auth:42/callback?code=abcdefgh",
      "com.aaronpilk.sidequest://auth/elsewhere/../callback?code=abcdefgh",
      `${NATIVE_AUTH_REDIRECT}?code=abcdefgh&code=ijklmnop`,
      `${NATIVE_AUTH_REDIRECT}?code=abcdefgh&next=https://evil.example`,
      `${NATIVE_AUTH_REDIRECT}?code=abcdefgh&error=expired`,
      `${NATIVE_AUTH_REDIRECT}?code=bad%0Acode`,
      `${NATIVE_AUTH_REDIRECT}#code=abcdefgh`,
      `${NATIVE_AUTH_REDIRECT}#access_token=secret&refresh_token=secret`,
      `${NATIVE_AUTH_REDIRECT}?code=abcdefgh#access_token=secret`,
    ])
      expect(parseNativeAuthCallback(url), url).toBeNull();
  });

  it("recognizes expired-link errors without rendering untrusted descriptions", () => {
    expect(
      parseNativeAuthCallback(
        `${NATIVE_AUTH_REDIRECT}#error=access_denied&error_code=otp_expired&error_description=anything`,
      ),
    ).toEqual({ kind: "error" });
    expect(
      parseNativeAuthCallback(`${NATIVE_AUTH_REDIRECT}?error=access_denied`),
    ).toEqual({ kind: "error" });
  });

  it("accepts a bounded query-only flow ID and rejects ambiguous callback combinations", () => {
    expect(
      parseNativeAuthCallback(
        `${NATIVE_AUTH_REDIRECT}?sb_flow_id=01234567-abcd&code=abcdefgh-1234`,
      ),
    ).toEqual({ kind: "code", code: "abcdefgh-1234", flowId: "01234567-abcd" });
    expect(
      parseNativeAuthCallback(
        `${NATIVE_AUTH_REDIRECT}?sb_flow_id=01234567-abcd#error=access_denied&error_code=otp_expired`,
      ),
    ).toEqual({ kind: "error" });
    for (const query of [
      "?code=abcdefgh&sb_flow_id=short",
      "?code=abcdefgh&sb_flow_id=",
      `?code=abcdefgh&sb_flow_id=${"a".repeat(65)}`,
      "?code=abcdefgh&sb_flow_id=flow%2Felsewhere",
      "?code=abcdefgh&sb_flow_id=valid-id&sb_flow_id=other-id",
      "?code=abcdefgh&sb_flow_id=valid-id#sb_flow_id=other-id",
      "?code=abcdefgh#sb_flow_id=valid-id",
      "?code=abcdefgh&sb_flow_id=valid-id&error=expired",
      "?code=&sb_flow_id=valid-id",
      "?sb_flow_id=valid-id",
    ])
      expect(
        parseNativeAuthCallback(`${NATIVE_AUTH_REDIRECT}${query}`),
      ).toBeNull();
  });

  it("uses the device callback and retains only a known internal return route", () => {
    session.setItem("sq-return-to", "/series/abc?part=next");
    expect(emailSignInRedirect()).toBe(NATIVE_AUTH_REDIRECT);
    expect(JSON.parse(local.getItem("sq-native-sign-in-v1")!)).toMatchObject({
      version: 1,
      returnTo: "/series/abc?part=next",
    });
    rememberNativeSignIn("https://evil.example", local);
    expect(JSON.parse(local.getItem("sq-native-sign-in-v1")!).returnTo).toBe(
      "/create",
    );
    native.enabled = false;
    vi.stubGlobal("window", {
      location: { origin: "https://sidequest.example" },
    });
    expect(emailSignInRedirect()).toBe(
      "https://sidequest.example/auth/callback",
    );
  });
});

describe("native PKCE exchange", () => {
  it("selects the verifier belonging to the callback instead of the last resend", async () => {
    const auth = authFixture(),
      complete = vi.fn(),
      error = vi.fn();
    rememberNativeSignIn("/profile", local);
    const handle = createNativeAuthHandler({
      auth,
      onComplete: complete,
      onError: error,
      storage: local,
    });
    const link = `${NATIVE_AUTH_REDIRECT}?code=scoped-code-005&sb_flow_id=matching-flow-005`;
    await Promise.all([handle(link), handle(link)]);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith(
      "scoped-code-005",
      { flowId: "matching-flow-005" },
    );
    expect(complete).toHaveBeenCalledWith("/profile");
    expect(error).not.toHaveBeenCalled();
  });

  it("returns to the saved route and consumes its pending state", async () => {
    const auth = authFixture(),
      complete = vi.fn(),
      error = vi.fn();
    rememberNativeSignIn("/create?template=outdoor-date", local);
    const handle = createNativeAuthHandler({
      auth,
      onComplete: complete,
      onError: error,
      storage: local,
    });
    await handle(`${NATIVE_AUTH_REDIRECT}?code=happy-code-001`);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("happy-code-001");
    expect(complete).toHaveBeenCalledWith("/create?template=outdoor-date");
    expect(error).not.toHaveBeenCalled();
    expect(local.getItem("sq-native-sign-in-v1")).toBeNull();
    expect(native.close).toHaveBeenCalledOnce();
  });

  it("exchanges a cold-launch/event duplicate only once", async () => {
    const auth = authFixture(),
      complete = vi.fn(),
      error = vi.fn();
    rememberNativeSignIn("/rewards?tab=offers", local);
    const handle = createNativeAuthHandler({
      auth,
      onComplete: complete,
      onError: error,
      storage: local,
    });
    await Promise.all([
      handle(`${NATIVE_AUTH_REDIRECT}?code=duplicate-code-002`),
      handle(`${NATIVE_AUTH_REDIRECT}?code=duplicate-code-002`),
    ]);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it("hands an in-flight exchange to the active StrictMode mount", async () => {
    const auth = authFixture(),
      firstComplete = vi.fn(),
      complete = vi.fn();
    let resolve!: (result: { error: unknown }) => void;
    auth.exchangeCodeForSession.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    rememberNativeSignIn("/profile", local);
    let active = true;
    const first = createNativeAuthHandler({
      auth,
      onComplete: firstComplete,
      onError: vi.fn(),
      storage: local,
      isActive: () => active,
    });
    const pending = first(`${NATIVE_AUTH_REDIRECT}?code=strict-mode-code-003`);
    active = false;
    const second = createNativeAuthHandler({
      auth,
      onComplete: complete,
      onError: vi.fn(),
      storage: local,
    });
    const secondPending = second(
      `${NATIVE_AUTH_REDIRECT}?code=strict-mode-code-003`,
    );
    resolve({ error: null });
    await Promise.all([pending, secondPending]);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(firstComplete).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith("/profile");
  });

  it("rejects missing, corrupted, expired and external pending destinations", async () => {
    const invalid = [
      null,
      "invalid JSON",
      JSON.stringify({
        version: 1,
        returnTo: "https://evil.example",
        createdAt: Date.now(),
      }),
      JSON.stringify({ version: 1, returnTo: "/create", createdAt: 1 }),
    ];
    for (const [index, value] of invalid.entries()) {
      const storage = memoryStorage(),
        auth = authFixture(),
        complete = vi.fn(),
        error = vi.fn();
      if (value) storage.setItem("sq-native-sign-in-v1", value);
      const handle = createNativeAuthHandler({
        auth,
        onComplete: complete,
        onError: error,
        storage,
      });
      await handle(`${NATIVE_AUTH_REDIRECT}?code=invalid-state-00${index}`);
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Request a new link"),
      );
    }
  });

  it("reports failed and expired exchanges without navigating or leaking errors", async () => {
    const auth = authFixture(),
      complete = vi.fn(),
      error = vi.fn();
    auth.exchangeCodeForSession.mockResolvedValue({
      error: new Error("private-token-or-server-detail"),
    });
    rememberNativeSignIn("/create", local);
    const handle = createNativeAuthHandler({
      auth,
      onComplete: complete,
      onError: error,
      storage: local,
    });
    await handle(`${NATIVE_AUTH_REDIRECT}?code=failed-code-004`);
    await handle(
      `${NATIVE_AUTH_REDIRECT}#error=access_denied&error_description=untrusted-message`,
    );
    expect(complete).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(
      /private-token|untrusted-message/,
    );
  });

  for (const code of ["flow_state_expired", "otp_expired"]) {
    it(`explains ${code} with a fresh-link recovery and no provider details`, async () => {
      const auth = authFixture(),
        complete = vi.fn(),
        error = vi.fn();
      auth.exchangeCodeForSession.mockResolvedValue({
        error: { code, message: "private-token-or-server-detail" },
      });
      rememberNativeSignIn("/create", local);
      const handle = createNativeAuthHandler({
        auth,
        onComplete: complete,
        onError: error,
        storage: local,
      });
      await handle(`${NATIVE_AUTH_REDIRECT}?code=expired-${code}-callback`);
      expect(error).toHaveBeenCalledWith(
        "Your sign-in link expired. Request a new link in this app, then open the newest email right away on this device.",
      );
      expect(complete).not.toHaveBeenCalled();
      expect(native.close).not.toHaveBeenCalled();
      expect(local.getItem("sq-native-sign-in-v1")).not.toBeNull();
      expect(JSON.stringify(error.mock.calls)).not.toContain("private-token");
    });
  }
});

describe("native app lifecycle and outbound links", () => {
  it("keeps app routes internal and classifies other web links for Safari", () => {
    const classify = (url: string) =>
      classifyNativeLink(
        url,
        "capacitor://localhost",
        "https://sidequest.example",
      );
    expect(classify("/create")).toBeNull();
    expect(classify("#brand-videos")).toBeNull();
    expect(classify("https://sidequest.example/posts/123?from=feed")).toEqual({
      kind: "internal",
      route: "/posts/123?from=feed",
    });
    expect(classify("https://maps.apple.com/?q=park")).toEqual({
      kind: "external",
      url: "https://maps.apple.com/?q=park",
    });
    expect(classify("https://sidequest.example.evil.com/create")).toEqual({
      kind: "external",
      url: "https://sidequest.example.evil.com/create",
    });
    expect(classify("https://sidequest.example/api/private-download")).toEqual({
      kind: "external",
      url: "https://sidequest.example/api/private-download",
    });
    expect(classify("javascript:alert(1)")).toBeNull();
    expect(classify("https://user:secret@example.com")).toBeNull();
  });

  it("handles cold and warm links, pauses refresh, and removes only its listeners", async () => {
    const auth = authFixture(),
      navigate = vi.fn(),
      error = vi.fn();
    rememberNativeSignIn("/journal", local);
    native.launch = { url: `${NATIVE_AUTH_REDIRECT}?code=lifecycle-code-005` };
    const cleanup = startNativeApp({
      auth,
      onNavigate: navigate,
      onError: error,
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/journal", true),
    );
    native.listeners.get("appUrlOpen")!({ url: native.launch.url });
    native.listeners.get("appStateChange")!({ isActive: false });
    await vi.waitFor(() => expect(auth.stopAutoRefresh).toHaveBeenCalledOnce());
    native.listeners.get("appStateChange")!({ isActive: true });
    await vi.waitFor(() =>
      expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2),
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    cleanup();
    expect(native.removers).toHaveLength(2);
    native.removers.forEach((remove) => expect(remove).toHaveBeenCalledOnce());
  });

  it("does not start device hooks in the regular web app", () => {
    native.enabled = false;
    const auth = authFixture();
    startNativeApp({ auth, onNavigate: vi.fn(), onError: vi.fn() })();
    expect(native.listeners.size).toBe(0);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it("removes listeners that finish registering after an immediate unmount", async () => {
    const auth = authFixture(),
      navigate = vi.fn();
    startNativeApp({ auth, onNavigate: navigate, onError: vi.fn() })();
    await vi.waitFor(() => {
      expect(native.removers).toHaveLength(2);
      native.removers.forEach((remove) =>
        expect(remove).toHaveBeenCalledOnce(),
      );
    });
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens outbound anchors in Safari and respects handled clicks and downloads", async () => {
    let onClick!: (event: MouseEvent) => void;
    vi.stubGlobal("document", {
      addEventListener: (_type: string, listener: typeof onClick) => {
        onClick = listener;
      },
      removeEventListener: vi.fn(),
    });
    class Anchor {
      constructor(
        public href: string,
        public download = false,
      ) {}
      closest() {
        return this;
      }
      hasAttribute(name: string) {
        return name === "download" && this.download;
      }
      getAttribute() {
        return this.href;
      }
    }
    vi.stubGlobal("Element", Anchor);
    const navigate = vi.fn();
    const cleanup = startNativeApp({
      auth: null,
      onNavigate: navigate,
      onError: vi.fn(),
    });
    const event = (anchor: Anchor, prevented = false) =>
      ({
        target: anchor,
        defaultPrevented: prevented,
        button: 0,
        preventDefault: vi.fn(),
      }) as unknown as MouseEvent;
    const external = event(new Anchor("https://maps.apple.com/?q=park"));
    onClick(external);
    expect(external.preventDefault).toHaveBeenCalledOnce();
    expect(native.open).toHaveBeenCalledWith({
      url: "https://maps.apple.com/?q=park",
    });
    const internal = event(new Anchor("https://sidequest.example/create"));
    onClick(internal);
    expect(navigate).toHaveBeenCalledWith("/create");
    onClick(event(new Anchor("https://example.com"), true));
    onClick(event(new Anchor("https://example.com/video.mp4", true)));
    expect(native.open).toHaveBeenCalledOnce();
    cleanup();
  });
});
