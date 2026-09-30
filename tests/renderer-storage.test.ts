import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

let runtime: Miniflare;
beforeAll(async () => {
  const helper = ts.transpileModule(
    await readFile(
      new URL("../worker/renderer-storage.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    },
  ).outputText;
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "storage-test",
          modules: true,
          compatibilityDate: "2026-09-27",
          r2Buckets: ["MEDIA"],
          serviceBindings: { RENDERER: "renderer-test" },
          script:
            helper +
            `
        export default { async fetch(request, env) {
          const mode = new URL(request.url).pathname.slice(1);
          const response = await env.RENDERER.fetch('http://renderer/' + mode);
          try {
            if (mode === 'unfixed') {
              await env.MEDIA.put(mode, response.body);
            } else {
              const bucket = mode === 'storage-error'
                ? { put() { throw new TypeError('Synthetic storage failure'); } }
                : env.MEDIA;
              const options = mode === 'checksum-error' ? { sha256: '0'.repeat(64) } : {};
              await storeRendererObject(bucket, mode, response, 16, 1024, options);
            }
            const object = await env.MEDIA.get(mode);
            return Response.json({ ok: true, bytes: object.size, value: await object.text() });
          } catch (error) {
            await response.body?.cancel().catch(() => {});
            return Response.json({ ok: false, error: error.message, saved: !!await env.MEDIA.head(mode) });
          }
        } };
      `,
        },
        {
          name: "renderer-test",
          modules: true,
          compatibilityDate: "2026-09-27",
          // Match the Container SDK's IdentityTransformStream response across a
          // service boundary, including a header that cannot make R2 know its size.
          script: `export default { fetch(request, env, ctx) {
        const mode = new URL(request.url).pathname.slice(1);
        const value = mode === 'truncated' ? 'too short'
          : mode === 'overlong' ? 'rendered fixture plus extra'
          : 'rendered fixture';
        const source = mode === 'source-error'
          ? new ReadableStream({ pull(controller) { controller.error(new Error('Synthetic source interrupted')); } })
          : new Response(value).body;
        const stream = new IdentityTransformStream();
        ctx.waitUntil(source.pipeTo(stream.writable).catch(() => {}));
        return new Response(stream.readable, { headers: mode === 'missing-length' ? {} : { 'content-length': '16' } });
      } };`,
        },
      ],
    }),
  );
}, 15000);
afterAll(async () => {
  await runtime?.dispose();
});

describe("real workerd renderer-to-R2 streaming", () => {
  it("reproduces the production failure without fixed-length framing", async () => {
    const result = await (
      await runtime.dispatchFetch("http://test/unfixed")
    ).json();
    expect(result).toMatchObject({ ok: false, saved: false });
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("known length"),
    );
  });

  it("stores the exact streamed bytes with fixed-length framing", async () => {
    const result = await (
      await runtime.dispatchFetch("http://test/complete")
    ).json();
    expect(result).toEqual({ ok: true, bytes: 16, value: "rendered fixture" });
  });

  it.each([
    "truncated",
    "overlong",
    "source-error",
    "storage-error",
    "checksum-error",
    "missing-length",
  ])(
    "rejects %s without saving a partial object or leaving a pending pipe",
    async (mode) => {
      const result = await (
        await runtime.dispatchFetch(`http://test/${mode}`)
      ).json();
      expect(result).toMatchObject({ ok: false, saved: false });
    },
    10000,
  );
});
