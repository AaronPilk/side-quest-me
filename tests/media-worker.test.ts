import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const renderer = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@cloudflare/containers", () => ({
  Container: class {},
  getContainer: () => renderer,
}));
import {
  MediaRouteError,
  rendererJson,
  uploadAndSeal,
  type MediaEnv,
} from "../worker/media";

const NativeRequest = globalThis.Request;
const asset = {
  id: "a012d494-69d6-413c-9e7c-2101a999f454",
  owner_id: "9c931c20-1ac5-4ce0-9ee0-4d21ae2a5080",
  run_id: "17e3a382-6ccd-46d4-9821-e4c8fe0746ba",
  slot: 1,
  kind: "source",
  state: "pending",
  expected_bytes: 4,
  staging_key: "staging/owner/asset",
  mime: "video/mp4",
  upload_expires_at: "2099-01-01T00:00:00Z",
};
beforeEach(() => {
  vi.stubGlobal(
    "Request",
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, { ...init, duplex: "half" } as RequestInit);
      }
    },
  );
  renderer.fetch.mockImplementation(async (request: Request) =>
    request.method === "DELETE"
      ? Response.json({ deleted: true })
      : Response.json({
          assetId: request.url.split("/").pop(),
          runId: asset.run_id,
          slot: 0,
          generation: 1,
          status: "validated",
          bytes: 4,
          mime: "video/mp4",
          sha256: "a".repeat(64),
          probe: {
            duration: 10,
            bytes: 4,
            width: 720,
            height: 1280,
            sha256: "a".repeat(64),
          },
        }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function harness(result: (sealedKey: string) => object) {
  const writes: string[] = [];
  const media = {
    put: vi.fn(async (key: string) => {
      writes.push(key);
      return { size: 4 };
    }),
    get: vi.fn(async () => ({
      size: 4,
      body: new Blob(["data"]).stream(),
      httpMetadata: { contentType: "video/mp4" },
    })),
    delete: vi.fn(async () => undefined),
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(async () => ({ data: asset, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const db = {
    from: vi.fn(() => query),
    rpc: vi.fn(async () =>
      result(writes.find((key) => key.startsWith("sealed/"))!),
    ),
  } as unknown as SupabaseClient;
  const env = {
    MEDIA: media,
    RENDERER: {},
    RENDERER_INTERNAL_TOKEN: "test-internal-token-with-at-least-32-characters",
  } as unknown as MediaEnv;
  return {
    env,
    db,
    media,
    writes,
    request: new Request("https://app.test/api/media/upload", {
      method: "PUT",
      body: "data",
      headers: { "content-length": "4" },
    }),
  };
}

describe("renderer response transport", () => {
  it.each([503, 429, 500])(
    "preserves a plain-text Container startup status %i for queue retry",
    async (status) => {
      const response = new Response("Private Container provisioning details", {
        status,
      });
      await expect(rendererJson(response)).rejects.toMatchObject({
        status,
        message: "Media processing failed.",
      });
      expect(response.bodyUsed).toBe(true);
    },
  );

  it("retains bounded validation errors and successful metadata", async () => {
    await expect(
      rendererJson(
        Response.json(
          { error: "Choose at least five seconds." },
          { status: 422 },
        ),
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: "Choose at least five seconds.",
    });
    await expect(rendererJson(Response.json({ bytes: 1024 }))).resolves.toEqual(
      { bytes: 1024 },
    );
  });

  it("classifies malformed success metadata as a retryable transport failure", async () => {
    await expect(
      rendererJson(new Response("malformed metadata")),
    ).rejects.toMatchObject({
      status: 502,
      message: "Media service returned an invalid response.",
    });
  });

  it("cancels oversized metadata without reading an unbounded body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1024 + 1));
      },
      cancel,
    });
    await expect(rendererJson(new Response(stream))).rejects.toBeInstanceOf(
      MediaRouteError,
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves non-JSON validation status without echoing the response body", async () => {
    await expect(
      rendererJson(new Response("Internal path details", { status: 422 })),
    ).rejects.toMatchObject({
      status: 422,
      message: "Media processing failed.",
    });
  });
});

describe("sealed upload transport recovery", () => {
  it("retains a potentially committed candidate when the database reply is lost", async () => {
    const h = harness(() => ({
      data: null,
      error: { message: "Network reply lost after commit" },
    }));
    await expect(
      uploadAndSeal(h.request, h.env, h.db, asset.owner_id, asset.id),
    ).rejects.toThrow("Network reply lost");
    expect(h.writes.some((key) => key.startsWith("sealed/"))).toBe(true);
    expect(h.media.delete).not.toHaveBeenCalled();
  });
  it("deletes staging only after a confirmed successful seal", async () => {
    const h = harness((object_key) => ({
      data: { ...asset, state: "sealed", object_key },
      error: null,
    }));
    const result = await uploadAndSeal(
      h.request,
      h.env,
      h.db,
      asset.owner_id,
      asset.id,
    );
    expect(result.state).toBe("sealed");
    expect(h.media.delete).toHaveBeenCalledExactlyOnceWith(asset.staging_key);
  });
  it("removes a concurrent losing candidate while preserving the chosen source", async () => {
    const h = harness(() => ({
      data: {
        ...asset,
        state: "sealed",
        object_key: "sealed/previous-valid-candidate",
      },
      error: null,
    }));
    await uploadAndSeal(h.request, h.env, h.db, asset.owner_id, asset.id);
    expect(h.media.delete).toHaveBeenCalledWith(
      h.writes.find((key) => key.startsWith("sealed/")),
    );
    expect(h.media.delete).not.toHaveBeenCalledWith(
      "sealed/previous-valid-candidate",
    );
  });
});
