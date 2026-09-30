import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
import { command, probeMedia, renderReel } from "../renderer/core.mjs";

// Real FFmpeg + multipart integration; ephemeral server uses a random loopback port.
const root = await mkdtemp(path.join(tmpdir(), "sq-session-proof-"));
process.env.MEDIA_DATA_DIR = path.join(root, "adapter");
const { startServer } = await import("../renderer/server.mjs");
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}`;
const fullRange = process.argv.includes("--full-range");
const takeSeconds = process.argv.includes("--minute") ? 30 : fullRange ? 5 : 3;
const totalSeconds = takeSeconds * 2;
try {
  const files = [];
  for (const color of ["blue", "green"]) {
    const file = path.join(root, `${color}.mp4`);
    await command("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=180x320:r=30:d=${takeSeconds}`,
      ...(fullRange
        ? ["-vf", "scale=out_range=full", "-color_range", "pc"]
        : []),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    files.push(file);
  }
  if (fullRange) {
    const inputInfo = JSON.parse(
      await command("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=pix_fmt,color_range",
        "-of",
        "json",
        files[0],
      ]),
    );
    assert.equal(inputInfo.streams[0].pix_fmt, "yuvj420p");
    assert.equal(inputInfo.streams[0].color_range, "pc");
    const metadata = await probeMedia(files[0]);
    const runId = randomUUID(),
      assetId = randomUUID();
    // Rendering a single native-style upload must also normalize its range,
    // even when it never went through the multi-take composer.
    const direct = await renderReel(
      {
        version: 1,
        runId,
        revision: 1,
        outputId: randomUUID(),
        title: "Full-range camera upload",
        clips: [{ assetId, start: 0, end: takeSeconds }],
      },
      new Map([
        [assetId, { runId, slot: 0, path: files[0], sha256: metadata.sha256 }],
      ]),
      root,
    );
    assert.equal(direct.metadata.duration, takeSeconds);
  }
  const image = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const body = new FormData();
  for (const file of files)
    body.append(
      "take",
      new Blob([await readFile(file)], { type: "video/mp4" }),
      path.basename(file),
    );
  body.append(
    "overlay",
    new Blob([image], { type: "image/png" }),
    "sticker.png",
  );
  body.append("overlayPosition", "top_left");
  const response = await fetch(`${base}/api/local-media/compose`, {
    method: "POST",
    headers: { "X-Sidequest-Demo": "1" },
    body,
  });
  assert.equal(
    response.status,
    200,
    await response
      .clone()
      .text()
      .then((v) => (response.ok ? "" : v)),
  );
  const source = path.join(root, "source.mp4");
  await writeFile(source, Buffer.from(await response.arrayBuffer()));
  const metadata = await probeMedia(source, { output: true });
  assert.ok(Math.abs(metadata.duration - totalSeconds) <= 0.1);
  const runId = randomUUID(),
    assetId = randomUUID();
  const rendered = await renderReel(
    {
      version: 1,
      runId,
      revision: 1,
      outputId: randomUUID(),
      title: "Our complete session",
      ...(process.argv.includes("--sponsor")
        ? { sponsorDisclosure: "Local fixture sponsor" }
        : {}),
      clips: [{ assetId, start: 0, end: totalSeconds }],
    },
    new Map([
      [assetId, { runId, slot: 0, path: source, sha256: metadata.sha256 }],
    ]),
    root,
  );
  assert.equal(rendered.metadata.duration, totalSeconds);
  const proof = path.resolve(".local/fixtures/session-overlay-proof.png");
  await mkdir(path.dirname(proof), { recursive: true });
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "1",
    "-i",
    rendered.output,
    "-frames:v",
    "1",
    "-update",
    "1",
    proof,
  ]);
  const red = await sharp(proof)
    .extract({ left: 70, top: 190, width: 1, height: 1 })
    .removeAlpha()
    .raw()
    .toBuffer();
  assert.ok(
    red[0] > 200 && red[1] < 30 && red[2] < 30,
    "The selected image must remain visible in the final exported video",
  );
  const logo = await sharp(proof)
    .extract({ left: 82, top: 1745, width: 62, height: 64 })
    .removeAlpha()
    .raw()
    .toBuffer();
  let white = 0;
  for (let i = 0; i < logo.length; i += 3)
    if (logo[i] > 220 && logo[i + 1] > 220 && logo[i + 2] > 220) white++;
  assert.ok(
    white > 250,
    "The approved white logo must appear in the final video watermark",
  );
  const invalid = new FormData();
  invalid.append(
    "take",
    new Blob([await readFile(files[0])], { type: "video/mp4" }),
  );
  invalid.append(
    "overlay",
    new Blob(
      ['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'],
      { type: "image/svg+xml" },
    ),
  );
  const rejected = await fetch(`${base}/api/local-media/compose`, {
    method: "POST",
    headers: { "X-Sidequest-Demo": "1" },
    body: invalid,
  });
  assert.equal(rejected.status, 400);
  console.log(
    JSON.stringify({
      pass: true,
      duration: rendered.metadata.duration,
      imageRetained: true,
      watermarkLogo: true,
      invalidImageRejected: true,
      fullRangeInput: fullRange,
      frame: proof,
    }),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
