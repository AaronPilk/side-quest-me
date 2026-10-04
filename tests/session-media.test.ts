import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  saveClip: vi.fn(),
  token: vi.fn(async () => "session-token"),
}));
vi.mock("../src/lib/api", () => ({
  request: mocks.request,
  api: { saveClip: mocks.saveClip },
}));
vi.mock("../src/lib/auth", () => ({ DEMO: false, accessToken: mocks.token }));
import { saveRecordingSession } from "../src/lib/session-media";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_NATIVE", "true");
  vi.stubEnv("VITE_API_ORIGIN", "https://api.sidequest.test");
  mocks.request.mockImplementation(async (path: string, init: RequestInit) => {
    if (path.endsWith("/uploads"))
      return { id: "asset", uploadUrl: "/api/media/asset/upload" };
    if (path.endsWith("/upload")) return { duration_ms: 24000 };
    if (path.endsWith("/finalize"))
      return {
        id: "asset",
        slot: 0,
        duration: 24,
        ...JSON.parse(init.body as string),
      };
  });
  mocks.saveClip.mockImplementation(async (_id, clip) => ({ clips: [clip] }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("unified recording upload", () => {
  it("uploads one imported video once and selects its complete measured duration", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const file = new Blob(["finished video"], { type: "video/mp4" });
    await saveRecordingSession("run", [{ file, duration: 24 }], "gallery");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith("/upload")),
    ).toHaveLength(1);
    expect(mocks.saveClip).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ mode: "session", slot: 0, start: 0, end: 24 }),
    );
  });
  it("sends resumable independent takes for composition before one validated upload", async () => {
    const output = new Blob(["composed"], { type: "video/mp4" });
    const fetcher = vi.fn(async () => new Response(output));
    vi.stubGlobal("fetch", fetcher);
    const file = new Blob(["take"], { type: "video/webm" });
    await saveRecordingSession(
      "run",
      [
        { file, duration: 3 },
        { file, duration: 3 },
      ],
      "camera",
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.sidequest.test/api/quest-runs/run/compose");
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ Authorization: "Bearer session-token" });
    expect((init.body as FormData).getAll("take")).toHaveLength(2);
    expect(
      mocks.request.mock.calls.filter(([path]) => path.endsWith("/upload")),
    ).toHaveLength(1);
  });
  it("does not reserve media after composition failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("capacity", { status: 503 })),
    );
    const file = new Blob(["take"]);
    await expect(
      saveRecordingSession(
        "run",
        [
          { file, duration: 3 },
          { file, duration: 3 },
        ],
        "camera",
      ),
    ).rejects.toThrow("still saved");
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("burns an optional positioned photo into even one imported video before upload", async () => {
    const fetcher = vi.fn(
      async () => new Response(new Blob(["composed"], { type: "video/mp4" })),
    );
    vi.stubGlobal("fetch", fetcher);
    const file = new Blob(["video"], { type: "video/mp4" });
    const photo = new Blob(["photo"], { type: "image/png" });
    await saveRecordingSession("run", [{ file, duration: 12 }], "gallery", {
      file: photo,
      position: "top_right",
      transform: { x: 0.7, y: 0.3, width: 0.4 },
    });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.getAll("take")).toHaveLength(1);
    expect(body.get("overlayPosition")).toBe("top_right");
    expect(JSON.parse(body.get("overlayTransform") as string)).toEqual({
      x: 0.7,
      y: 0.3,
      width: 0.4,
    });
    expect((body.get("overlay") as Blob).size).toBe(photo.size);
  });
  it("normalizes a full-minute single take to avoid encoded-container padding exceeding the sealed limit", async () => {
    const fetcher = vi.fn(
      async () => new Response(new Blob(["normalized"], { type: "video/mp4" })),
    );
    vi.stubGlobal("fetch", fetcher);
    await saveRecordingSession(
      "run",
      [{ file: new Blob(["video"], { type: "video/mp4" }), duration: 60.02 }],
      "gallery",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
