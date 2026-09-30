import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  command,
  composeTakes,
  probeMedia,
  renderReel,
} from "../renderer/core.mjs";
const directory = await mkdtemp(path.join(tmpdir(), "sq-session-"));
let server;
try {
  const files = [];
  for (let i = 0; i < 2; i++) {
    const file = path.join(directory, `take-${i}.mp4`);
    await command("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${i ? "blue" : "red"}:size=180x320:rate=30:duration=3`,
      ...(i
        ? []
        : [
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000:duration=3",
          ]),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      ...(i ? [] : ["-c:a", "aac"]),
      file,
    ]);
    files.push(file);
  }
  const output = await composeTakes(files, directory);
  const metadata = await probeMedia(output);
  assert(Math.abs(metadata.duration - 6) < 0.3);
  assert.equal(metadata.hasAudio, true);
  const runId = randomUUID(),
    assetId = randomUUID();
  const result = await renderReel(
    {
      version: 1,
      runId,
      revision: 1,
      outputId: randomUUID(),
      title: "A complete imported video",
      clips: [
        { assetId, start: 0, end: 6, fit: "fit", mute: false, label: "" },
      ],
    },
    new Map([
      [assetId, { runId, slot: 0, path: output, sha256: metadata.sha256 }],
    ]),
    directory,
  );
  assert(Math.abs(result.metadata.duration - 6) < 0.3);
  assert((await stat(result.output)).size > 0);
  // The full frame remains unlabelled; single-video output does not add legacy 1 OF 3 text.
  await command("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-ss",
    "1",
    "-i",
    result.output,
    "-frames:v",
    "1",
    "-vf",
    "scale=1:1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    path.join(directory, "pixel.rgb"),
  ]);
  const pixel = await readFile(path.join(directory, "pixel.rgb"));
  assert(pixel[0] > 230 && pixel[1] < 20 && pixel[2] < 20);
  process.env.MEDIA_DATA_DIR = path.join(directory, "service");
  const { startServer } = await import("../renderer/server.mjs");
  server = await startServer(0);
  const endpoint = `http://127.0.0.1:${server.address().port}/api/local-media/compose`;
  const form = new FormData();
  for (const file of files)
    form.append(
      "take",
      new Blob([await readFile(file)], { type: "video/mp4" }),
      "take.mp4",
    );
  let response = await fetch(endpoint, { method: "POST", body: form });
  assert.equal(
    response.status,
    403,
    "composition requires explicit local demo authorization",
  );
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "X-Sidequest-Demo": "1" },
    body: form,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get("content-type"), "video/mp4");
  const httpOutput = path.join(directory, "http-session.mp4");
  await writeFile(httpOutput, Buffer.from(await response.arrayBuffer()));
  assert(Math.abs((await probeMedia(httpOutput)).duration - 6) < 0.3);
  const invalid = new FormData();
  invalid.append("take", new Blob(["not a video"]), "fake.mp4");
  response = await fetch(endpoint, {
    method: "POST",
    headers: { "X-Sidequest-Demo": "1" },
    body: invalid,
  });
  assert.equal(response.status, 422);
  console.log(
    "PASS: two independently recorded takes compose into one six-second video with audio, then render without legacy overlays.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
