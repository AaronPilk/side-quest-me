import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { command, probeMedia } from "../renderer/core.mjs";

const directory = path.resolve(process.env.FIXTURE_DIR || ".local/fixtures");
await mkdir(directory, { recursive: true });
const fixtures = [
  { name: "landscape-with-audio", size: "960x540", tone: 440 },
  { name: "portrait-silent", size: "540x960", tone: null },
  { name: "square-with-audio", size: "640x640", tone: 660 },
];
for (const f of fixtures) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${f.size}:rate=30:duration=8`,
  ];
  if (f.tone)
    args.push(
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${f.tone}:sample_rate=48000:duration=8`,
    );
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
  );
  if (f.tone) args.push("-c:a", "aac", "-b:a", "96k");
  args.push("-map_metadata", "-1", path.join(directory, `${f.name}.mp4`));
  await command("ffmpeg", args);
}
const streamingWebm = path.join(directory, "streaming-recorder.webm");
await command("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  path.join(directory, "portrait-silent.mp4"),
  "-c:v",
  "libvpx",
  "-deadline",
  "realtime",
  "-cpu-used",
  "8",
  "-b:v",
  "900k",
  "-f",
  "webm",
  "-live",
  "1",
  streamingWebm,
]);
const liveHeaders = JSON.parse(
  await command("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-of",
    "json",
    streamingWebm,
  ]),
);
assert.equal(liveHeaders.format.duration, undefined);
const streamingProbe = await probeMedia(streamingWebm);
assert.ok(
  Math.abs(streamingProbe.duration - 8) < 0.1,
  "Streaming WebM needs a bounded packet-derived duration",
);
process.env.MEDIA_DATA_DIR ||= path.join(directory, "adapter-data");
const { startServer } = await import("../renderer/server.mjs");
const server = await startServer(0),
  base = `http://127.0.0.1:${server.address().port}`;
try {
  const runId = randomUUID(),
    assets = [];
  const emptyUpload = await fetch(
    `${base}/api/local-media/uploads?runId=${runId}&slot=0`,
    {
      method: "POST",
      headers: { "x-sidequest-demo": "1", "content-type": "video/mp4" },
      body: new Uint8Array(),
    },
  );
  assert.equal(emptyUpload.status, 413);
  const corruptUpload = await fetch(
    `${base}/api/local-media/uploads?runId=${runId}&slot=0`,
    {
      method: "POST",
      headers: { "x-sidequest-demo": "1", "content-type": "video/mp4" },
      body: "This is not video data.",
    },
  );
  assert.equal(corruptUpload.status, 422);
  const hostileOrigin = await fetch(
    `${base}/api/local-media/uploads?runId=${runId}&slot=0`,
    {
      method: "POST",
      headers: { "x-sidequest-demo": "1", origin: "https://untrusted.example" },
      body: "not video",
    },
  );
  assert.equal(hostileOrigin.status, 403);
  for (const [slot, fixture] of fixtures.entries()) {
    const bytes = await readFile(path.join(directory, `${fixture.name}.mp4`));
    const response = await fetch(
      `${base}/api/local-media/uploads?runId=${runId}&slot=${slot}`,
      {
        method: "POST",
        headers: { "content-type": "video/mp4", "x-sidequest-demo": "1" },
        body: bytes,
      },
    );
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    assets.push(result);
  }
  assert.equal(assets[1].probe.hasAudio, false);
  const denied = await fetch(`${base}/api/local-media/renders`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const unauthenticated = await fetch(
    `${base}/internal/probe/${assets[0].assetId}`,
    { method: "POST" },
  );
  assert.equal(unauthenticated.status, 401);
  const manifest = {
    version: 1,
    runId,
    revision: 1,
    outputId: randomUUID(),
    title: "The most overproduced sandwich",
    clips: assets.map((a, i) => ({
      assetId: a.assetId,
      start: 0.5,
      end: 7.5,
      mute: false,
      fit: "fit",
      crop: 0.5,
      label: [
        "The overly serious setup",
        "Commit to the bit",
        "The big reveal",
      ][i],
    })),
  };
  const invalid = await fetch(`${base}/api/local-media/renders`, {
    method: "POST",
    headers: { "x-sidequest-demo": "1", "content-type": "application/json" },
    body: JSON.stringify({ ...manifest, sourceUrl: "http://169.254.169.254/" }),
  });
  assert.equal(invalid.status, 400);
  const response = await fetch(`${base}/api/local-media/renders`, {
    method: "POST",
    headers: { "x-sidequest-demo": "1", "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  const downloaded = await fetch(base + result.url);
  assert.equal(downloaded.headers.get("content-type"), "video/mp4");
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    result.metadata.sha256,
  );
  const proof = path.join(directory, "sidequest-proof.mp4");
  await writeFile(proof, bytes);
  const checked = await probeMedia(proof, { output: true });
  assert.equal(checked.width, 1080);
  assert.equal(checked.height, 1920);
  assert.ok(Math.abs(checked.duration - 21) < 0.3);
  const silentWindow = await command("ffmpeg", [
    "-v",
    "error",
    "-ss",
    "8",
    "-t",
    "4",
    "-i",
    proof,
    "-vn",
    "-af",
    "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f",
    "null",
    "-",
  ]);
  assert.ok(
    silentWindow.includes("RMS_level=-inf"),
    "The middle silent source must stay silent and preserve the timeline",
  );
  const thumbnail = await fetch(base + result.thumbnailUrl);
  await writeFile(
    path.join(directory, "sidequest-proof.jpg"),
    Buffer.from(await thumbnail.arrayBuffer()),
  );
  // A replacement cannot mutate the sealed generation in the accepted old manifest.
  const replacement = await fetch(
    `${base}/api/local-media/uploads?runId=${runId}&slot=0`,
    {
      method: "POST",
      headers: { "x-sidequest-demo": "1", "content-type": "video/mp4" },
      body: await readFile(path.join(directory, "square-with-audio.mp4")),
    },
  );
  assert.equal(replacement.status, 201);
  const oldSource = await fetch(base + assets[0].previewUrl);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await oldSource.arrayBuffer()))
      .digest("hex"),
    assets[0].sha256,
  );
  const repeated = await fetch(`${base}/api/local-media/renders`, {
    method: "POST",
    headers: { "x-sidequest-demo": "1", "content-type": "application/json" },
    body: JSON.stringify(manifest),
  });
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).metadata.sha256, result.metadata.sha256);
  // This is an engineering disclosure fixture, not a funded campaign or real sponsor.
  const sponsoredManifest = {
    ...manifest,
    outputId: randomUUID(),
    revision: 2,
    sponsorDisclosure: "DEMO FIXTURE ONLY · no sponsor agreement",
  };
  const sponsoredResponse = await fetch(`${base}/api/local-media/renders`, {
    method: "POST",
    headers: { "x-sidequest-demo": "1", "content-type": "application/json" },
    body: JSON.stringify(sponsoredManifest),
  });
  const sponsored = await sponsoredResponse.json();
  assert.equal(sponsoredResponse.status, 201, JSON.stringify(sponsored));
  const sponsoredFile = path.join(directory, "sidequest-sponsored-fixture.mp4");
  const sponsoredDownload = await fetch(base + sponsored.url);
  const sponsoredBytes = Buffer.from(await sponsoredDownload.arrayBuffer());
  assert.equal(
    createHash("sha256").update(sponsoredBytes).digest("hex"),
    sponsored.metadata.sha256,
  );
  assert.notEqual(sponsored.metadata.sha256, result.metadata.sha256);
  await writeFile(sponsoredFile, sponsoredBytes);
  const sponsoredProbe = await probeMedia(sponsoredFile, { output: true });
  assert.ok(Math.abs(sponsoredProbe.duration - checked.duration) < 0.05);
  const sponsoredThumbnail = await fetch(base + sponsored.thumbnailUrl);
  await writeFile(
    path.join(directory, "sidequest-sponsored-fixture.jpg"),
    Buffer.from(await sponsoredThumbnail.arrayBuffer()),
  );
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-ss",
    "20",
    "-i",
    sponsoredFile,
    "-frames:v",
    "1",
    "-vf",
    "scale=360:640",
    "-update",
    "1",
    path.join(directory, "sidequest-sponsored-closing.jpg"),
  ]);
  const evidence = {
    fixture:
      "mixed orientation, portrait silence, 48kHz tones; genuine HTTP upload and independent download",
    checked,
    renderMs: result.metadata.renderMs,
    manifest,
    result,
    sponsored: {
      file: sponsoredFile,
      disclosure: sponsoredManifest.sponsorDisclosure,
      metadata: sponsoredProbe,
    },
    ffmpeg: (await command("ffmpeg", ["-version"])).split("\n")[0],
  };
  await writeFile(
    path.join(directory, "proof.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        proof,
        thumbnail: path.join(directory, "sidequest-proof.jpg"),
        ...checked,
        renderMs: result.metadata.renderMs,
        sponsored: { file: sponsoredFile, metadata: sponsoredProbe },
        checks: [
          "sealed replacement remains unchanged",
          "duplicate render idempotent",
          "HTTP download digest matches",
          "SSRF manifest rejected",
          "internal authentication enforced",
          "cross-site mutation blocked",
          "all streams decoded",
          "middle source audio silence retained",
          "optional sponsor disclosure encoded in a separate clearly marked demo fixture",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
}
