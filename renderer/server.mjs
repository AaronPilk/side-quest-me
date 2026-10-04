import http from "node:http";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { pathToFileURL } from "node:url";
import { assertId, MEDIA_LIMITS, renderManifestSchema } from "./contracts.mjs";
import { MediaError, probeMedia, renderReel, composeTakes } from "./core.mjs";
import { MAX_OVERLAY_BYTES, OVERLAY_POSITIONS } from "./overlays.mjs";
import { validOverlayTransform } from "../shared/image-overlay.mjs";

const mode = process.env.SIDEQUEST_RENDERER_MODE || "local";
const root = path.resolve(
  process.env.MEDIA_DATA_DIR ||
    (mode === "local" ? ".local/media" : "/tmp/sidequest-media"),
);
const token = process.env.RENDERER_INTERNAL_TOKEN || "";
const mutable = new Set();
let rendering = false;
const allowedOrigins = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8789",
    "http://127.0.0.1:8789",
    process.env.LOCAL_UI_ORIGIN,
  ].filter(Boolean),
);
const json = (res, value, status = 200) => {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(value));
};
const assetFile = (id) => path.join(root, "sources", `${assertId(id)}.bin`);
const assetMeta = (id) => path.join(root, "sources", `${assertId(id)}.json`);
const outputFile = (id, ext = "mp4") =>
  path.join(root, "outputs", `${assertId(id)}.${ext}`);
async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function saveJson(file, data) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data));
  await rename(temp, file);
}
async function bodyJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16_384) throw new MediaError("Request too large.", 413);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function currentBytes() {
  let total = 0;
  for (const dir of ["sources", "outputs"])
    for (const name of await readdir(path.join(root, dir)))
      total += (await stat(path.join(root, dir, name))).size;
  return total;
}
async function streamUpload(req, target) {
  const expected = Number(req.headers["content-length"]);
  if (
    !Number.isSafeInteger(expected) ||
    expected <= 0 ||
    expected > MEDIA_LIMITS.maxUploadBytes
  )
    throw new MediaError(
      "Provide a nonempty clip no larger than 40 MB. Trim or export larger recordings first.",
      413,
    );
  if ((await currentBytes()) + expected > MEDIA_LIMITS.maxLocalBytes)
    throw new MediaError(
      "Local media storage is full. Delete an old adventure before uploading.",
      507,
    );
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > MEDIA_LIMITS.maxUploadBytes
          ? new MediaError("Clip exceeds 40 MB.", 413)
          : null,
        chunk,
      );
    },
  });
  try {
    await pipeline(
      req,
      limiter,
      createWriteStream(target, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
  if (bytes !== expected) {
    await rm(target, { force: true });
    throw new MediaError(
      "Upload interrupted. Your earlier clips are still saved.",
      400,
    );
  }
}
function authorized(req) {
  const supplied = String(req.headers.authorization || "").replace(
    /^Bearer /,
    "",
  );
  return (
    !!token &&
    timingSafeEqual(
      createHash("sha256").update(supplied).digest(),
      createHash("sha256").update(token).digest(),
    )
  );
}
async function serveFile(req, res, file, type, download = false) {
  const info = await stat(file),
    range = req.headers.range;
  let start = 0,
    end = info.size - 1,
    code = 200;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { "content-range": `bytes */${info.size}` });
      res.end();
      return;
    }
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), end) : end;
    if (start > end || start >= info.size) {
      res.writeHead(416, { "content-range": `bytes */${info.size}` });
      res.end();
      return;
    }
    code = 206;
  }
  res.writeHead(code, {
    "content-type": type,
    "content-length": end - start + 1,
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    ...(code === 206
      ? { "content-range": `bytes ${start}-${end}/${info.size}` }
      : {}),
    ...(download
      ? { "content-disposition": 'attachment; filename="sidequest.mp4"' }
      : {}),
  });
  await pipeline(createReadStream(file, { start, end }), res);
}

async function upload(
  req,
  res,
  { id = randomUUID(), runId, slot, internal = false },
) {
  assertId(runId);
  assertId(id);
  if (![0, 1, 2].includes(slot))
    throw new MediaError("Choose clip slot 0, 1, or 2.", 400);
  const key = `${runId}:${slot}`;
  if (mutable.has(key))
    throw new MediaError(
      "This clip is already uploading. Try again in a moment.",
      409,
    );
  mutable.add(key);
  const staging = path.join(root, "staging", `${randomUUID()}.part`),
    sealed = assetFile(id);
  try {
    if (internal) {
      try {
        const existing = await readJson(assetMeta(id));
        req.resume();
        json(res, existing);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const all = (
      await Promise.all(
        (await readdir(path.join(root, "sources")))
          .filter((f) => f.endsWith(".json"))
          .map((f) => readJson(path.join(root, "sources", f))),
      )
    ).filter((a) => a.runId === runId);
    if (all.length >= MEDIA_LIMITS.maxInputsPerRun)
      throw new MediaError(
        "This run has reached its clip replacement limit. Delete unused local media first.",
        429,
      );
    const generation =
      1 +
      Math.max(
        0,
        ...all.filter((a) => a.slot === slot).map((a) => a.generation),
      );
    await streamUpload(req, staging);
    // The browser never receives this destination or any write route to it.
    await rename(staging, sealed);
    const probe = await probeMedia(sealed);
    const mime = /webm|matroska/.test(probe.format)
      ? "video/webm"
      : "video/mp4";
    const result = {
      assetId: id,
      runId,
      slot,
      generation,
      bytes: probe.bytes,
      mime,
      probe,
      sha256: probe.sha256,
      status: "validated",
      createdAt: new Date().toISOString(),
      previewUrl: `/api/local-media/assets/${id}`,
    };
    await saveJson(assetMeta(id), result);
    json(res, result, 201);
  } catch (error) {
    await Promise.all([
      rm(staging, { force: true }),
      rm(sealed, { force: true }),
      rm(assetMeta(id), { force: true }),
    ]);
    throw error;
  } finally {
    mutable.delete(key);
  }
}
async function compose(req, res) {
  if (rendering)
    throw new MediaError(
      "The video service is busy. Your takes are saved; try again shortly.",
      503,
    );
  rendering = true;
  const directory = path.join(root, "staging", randomUUID());
  try {
    const buffers = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MEDIA_LIMITS.maxUploadBytes + MAX_OVERLAY_BYTES + 1024 * 1024)
        throw new MediaError("Your recording and image are too large.", 413);
      buffers.push(chunk);
    }
    const form = await new Request("http://renderer/compose", {
      method: "POST",
      headers: { "Content-Type": req.headers["content-type"] || "" },
      body: Buffer.concat(buffers),
    }).formData();
    const takes = form.getAll("take");
    const overlays = form.getAll("overlay");
    const positions = form.getAll("overlayPosition");
    const transforms = form.getAll("overlayTransform");
    let transform;
    if (transforms.length) {
      try {
        if (typeof transforms[0] !== "string" || transforms[0].length > 200)
          throw new Error("Invalid transform");
        transform = JSON.parse(transforms[0]);
      } catch {
        throw new MediaError("Choose a valid photo position and size.", 400);
      }
      if (transforms.length !== 1 || !validOverlayTransform(transform))
        throw new MediaError("Choose a valid photo position and size.", 400);
    }
    const image = overlays[0];
    const position = positions[0] ?? "center";
    if (
      [...form.keys()].some(
        (key) =>
          !["take", "overlay", "overlayPosition", "overlayTransform"].includes(
            key,
          ),
      ) ||
      !takes.length ||
      takes.length > 30 ||
      takes.some((take) => typeof take === "string" || !take.size)
    )
      throw new MediaError("Choose playable recorded takes.", 400);
    if (
      overlays.length > 1 ||
      positions.length > 1 ||
      !OVERLAY_POSITIONS.includes(position) ||
      (positions.length && !image) ||
      (transforms.length && !image) ||
      (image &&
        (typeof image === "string" ||
          !image.size ||
          image.size > MAX_OVERLAY_BYTES ||
          !["image/png", "image/jpeg", "image/webp"].includes(image.type)))
    )
      throw new MediaError(
        "Choose one PNG, JPEG or WebP image up to 5 MB and a valid position.",
        400,
      );
    await mkdir(directory, { recursive: true });
    const files = [];
    for (const [index, take] of takes.entries()) {
      const file = path.join(directory, `source-${index}`);
      await writeFile(file, Buffer.from(await take.arrayBuffer()));
      files.push(file);
    }
    let imageOverlay;
    if (image) {
      const file = path.join(directory, "overlay-source");
      await writeFile(file, Buffer.from(await image.arrayBuffer()));
      imageOverlay = { file, position, transform };
    }
    const output = await composeTakes(files, directory, imageOverlay);
    await serveFile(req, res, output, "video/mp4");
  } finally {
    rendering = false;
    await rm(directory, { recursive: true, force: true });
  }
}
async function render(req, res) {
  const manifest = renderManifestSchema.parse(await bodyJson(req));
  const requestHash = createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex");
  try {
    const existing = await readJson(outputFile(manifest.outputId, "json"));
    if (existing.requestHash !== requestHash)
      throw new MediaError("Output generation is immutable.", 409);
    json(res, existing);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (rendering)
    throw new MediaError(
      "Renderer is busy. Your clips are saved; try rendering again shortly.",
      429,
    );
  if (
    (await currentBytes()) >
    MEDIA_LIMITS.maxLocalBytes - MEDIA_LIMITS.maxOutputBytes
  )
    throw new MediaError("Local media storage is full.", 507);
  rendering = true;
  try {
    const assets = new Map(
      await Promise.all(
        manifest.clips.map(async (c) => {
          const a = await readJson(assetMeta(c.assetId));
          return [c.assetId, { ...a, path: assetFile(c.assetId) }];
        }),
      ),
    );
    const result = await renderReel(
      manifest,
      assets,
      path.join(root, "outputs"),
      { workRoot: path.join(root, "work") },
    );
    const payload = {
      id: manifest.outputId,
      runId: manifest.runId,
      revision: manifest.revision,
      status: "ready",
      url: `/api/local-media/outputs/${manifest.outputId}`,
      thumbnailUrl: `/api/local-media/outputs/${manifest.outputId}/thumbnail`,
      metadata: result.metadata,
      requestHash,
      createdAt: new Date().toISOString(),
    };
    await saveJson(outputFile(manifest.outputId, "json"), payload);
    json(res, payload, 201);
  } finally {
    rendering = false;
  }
}

export async function startServer(port = Number(process.env.PORT || 8789)) {
  if (mode !== "local" && token.length < 32)
    throw new Error(
      "Container requires a RENDERER_INTERNAL_TOKEN of at least 32 characters.",
    );
  for (const dir of ["sources", "outputs", "staging", "work"])
    await mkdir(path.join(root, dir), { recursive: true });
  // Working files are ephemeral. A restart never promotes a half-written reel.
  for (const dir of ["staging", "work"])
    for (const name of await readdir(path.join(root, dir)))
      await rm(path.join(root, dir, name), { recursive: true, force: true });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const internal = url.pathname.startsWith("/internal/");
      if (internal && !authorized(req))
        throw new MediaError("Unauthorized renderer request.", 401);
      if (!internal && mode !== "local")
        throw new MediaError("Not found.", 404);
      if (!internal) {
        if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
          throw new MediaError("Loopback access only.", 403);
        if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
          throw new MediaError("Local origin is not allowed.", 403);
        if (
          !["GET", "HEAD"].includes(req.method) &&
          req.headers["x-sidequest-demo"] !== "1"
        )
          throw new MediaError("Explicit local demo header required.", 403);
      }
      const route = internal
        ? url.pathname.replace("/internal", "")
        : url.pathname.replace("/api/local-media", "");
      if (route === "/demo-reel" && req.method === "GET" && !internal) {
        // Only this synthetic, locally generated fixture is a public demo seed.
        // No user-selected path or source recording can enter this route.
        const thumbnail = url.searchParams.get("thumbnail") === "1";
        return await serveFile(
          req,
          res,
          path.resolve(
            ".local/fixtures",
            thumbnail ? "sidequest-proof.jpg" : "sidequest-proof.mp4",
          ),
          thumbnail ? "image/jpeg" : "video/mp4",
        );
      }
      if (route === "/health" && req.method === "GET")
        return json(res, {
          mode,
          demo: mode === "local",
          ffmpeg: "required",
          busy: rendering,
          limits: MEDIA_LIMITS,
        });
      if (route === "/uploads" && req.method === "POST" && !internal)
        return await upload(req, res, {
          runId: url.searchParams.get("runId"),
          slot: Number(url.searchParams.get("slot")),
        });
      if (route === "/compose" && req.method === "POST")
        return await compose(req, res);
      const asset = /^\/assets\/([a-f0-9-]+)$/.exec(route);
      if (asset && req.method === "PUT" && internal)
        return await upload(req, res, {
          id: asset[1],
          runId: req.headers["x-run-id"],
          slot: Number(req.headers["x-clip-slot"]),
          internal: true,
        });
      if (asset && req.method === "GET") {
        const meta = await readJson(assetMeta(asset[1]));
        return await serveFile(req, res, assetFile(asset[1]), meta.mime);
      }
      if (asset && req.method === "DELETE" && internal) {
        await Promise.all([
          rm(assetFile(asset[1]), { force: true }),
          rm(assetMeta(asset[1]), { force: true }),
        ]);
        return json(res, { deleted: true });
      }
      const probe = /^\/probe\/([a-f0-9-]+)$/.exec(route);
      if (probe && req.method === "POST" && internal)
        return json(res, await probeMedia(assetFile(probe[1])));
      if (
        (route === "/renders" || route === "/render") &&
        req.method === "POST"
      )
        return await render(req, res);
      const out = /^\/outputs\/([a-f0-9-]+)(\/thumbnail|\/metadata)?$/.exec(
        route,
      );
      if (out && req.method === "GET") {
        if (out[2] === "/metadata")
          return json(res, await readJson(outputFile(out[1], "json")));
        return await serveFile(
          req,
          res,
          outputFile(out[1], out[2] === "/thumbnail" ? "jpg" : "mp4"),
          out[2] === "/thumbnail" ? "image/jpeg" : "video/mp4",
          url.searchParams.has("download"),
        );
      }
      if (out && req.method === "DELETE" && internal) {
        await Promise.all(
          ["mp4", "jpg", "json"].map((ext) =>
            rm(outputFile(out[1], ext), { force: true }),
          ),
        );
        return json(res, { deleted: true });
      }
      if (route === "/account" && req.method === "DELETE" && !internal) {
        if (rendering || mutable.size)
          throw new MediaError(
            "Wait for the current upload or render to finish, then delete the local demo.",
            409,
          );
        for (const dir of ["sources", "outputs", "staging", "work"])
          for (const name of await readdir(path.join(root, dir)))
            await rm(path.join(root, dir, name), {
              recursive: true,
              force: true,
            });
        return json(res, { deleted: true, demo: true });
      }
      if (route === "/runs" && req.method === "DELETE" && !internal) {
        const runId = assertId(url.searchParams.get("runId"));
        if (rendering)
          throw new MediaError(
            "Wait for the current render to finish before deleting local media.",
            409,
          );
        for (const dir of ["sources", "outputs"])
          for (const name of await readdir(path.join(root, dir)))
            if (name.endsWith(".json")) {
              const meta = await readJson(path.join(root, dir, name));
              if (meta.runId === runId)
                for (const ext of dir === "sources"
                  ? ["json", "bin"]
                  : ["json", "mp4", "jpg"])
                  await rm(
                    path.join(root, dir, `${name.slice(0, -5)}.${ext}`),
                    { force: true },
                  );
            }
        return json(res, { deleted: true, demo: true });
      }
      throw new MediaError("Not found.", 404);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      const status =
        error.status ||
        (error.name === "ZodError" || error instanceof SyntaxError
          ? 400
          : error.code === "ENOENT"
            ? 404
            : 500);
      json(
        res,
        {
          error:
            status === 500
              ? "Media service failed. Your validated clips remain saved."
              : error.message,
          demo: mode === "local",
        },
        status,
      );
    }
  });
  server.requestTimeout = 300_000;
  server.headersTimeout = 15_000;
  await new Promise((resolve) =>
    server.listen(port, mode === "local" ? "127.0.0.1" : "0.0.0.0", resolve),
  );
  console.log(
    `Sidequest ${mode === "local" ? "LOCAL DEMO" : "authenticated container"} renderer listening on port ${server.address().port}`,
  );
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  await startServer();
