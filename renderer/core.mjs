import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat, rm, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MEDIA_LIMITS, renderManifestSchema } from "./contracts.mjs";
import { writeWatermark, writeImageOverlay } from "./overlays.mjs";

export class MediaError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

export function command(bin, args, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      limit = null;
    const timer = setTimeout(() => {
      if (limit) return;
      limit = "timeout";
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (chunk) => {
      if (limit) return;
      stdout += chunk;
      if (stdout.length > 1024 * 1024) {
        limit = "output";
        clearTimeout(timer);
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-12_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new MediaError(
          `Required media tool unavailable: ${error.message}`,
          503,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (limit === "timeout")
        reject(
          new MediaError(
            "Media processing reached the server time limit. Please try again shortly.",
            503,
          ),
        );
      else if (limit === "output")
        reject(
          new MediaError("Media processing exceeded its output limit.", 422),
        );
      else if (code)
        reject(
          new MediaError(`Media processing failed: ${stderr.slice(-700)}`),
        );
      else resolve(stdout);
    });
  });
}

export async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function probeMedia(
  file,
  { output = false, minSeconds = 5 } = {},
) {
  const info = await stat(file);
  const cap = output
    ? MEDIA_LIMITS.maxOutputBytes
    : MEDIA_LIMITS.maxUploadBytes;
  if (!info.size || info.size > cap)
    throw new MediaError(
      `Video must contain data and be no larger than ${Math.round(cap / 1024 ** 2)} MB.`,
    );
  const raw = JSON.parse(
    await command("ffprobe", [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
  const videos = raw.streams.filter((s) => s.codec_type === "video");
  const audios = raw.streams.filter((s) => s.codec_type === "audio");
  if (
    videos.length !== 1 ||
    audios.length > 1 ||
    raw.streams.some((s) => !["video", "audio"].includes(s.codec_type))
  )
    throw new MediaError(
      "Choose a video with one video track and at most one audio track.",
    );
  const v = videos[0];
  let duration = Number(raw.format.duration || v.duration);
  // MediaRecorder commonly emits streaming WebM without a Duration element. Derive it
  // from a bounded packet scan; never treat missing browser metadata as valid evidence.
  if (
    !Number.isFinite(duration) &&
    /matroska|webm/.test(raw.format.format_name)
  ) {
    const scanned = JSON.parse(
      await command("ffprobe", [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-read_intervals",
        "%+61",
        "-select_streams",
        "v:0",
        "-show_entries",
        "packet=pts_time,duration_time",
        "-of",
        "json",
        file,
      ]),
    );
    const packets = scanned.packets || [];
    const rate = String(v.avg_frame_rate || v.r_frame_rate || "30/1")
      .split("/")
      .map(Number);
    const frameSeconds =
      rate[0] > 0 && rate[1] > 0 ? rate[1] / rate[0] : 1 / 30;
    const times = packets
      .map((p) => ({
        start: Number(p.pts_time),
        length: Number(p.duration_time) || frameSeconds,
      }))
      .filter((p) => Number.isFinite(p.start) && p.length > 0);
    if (times.length)
      duration =
        Math.max(...times.map((p) => p.start + p.length)) -
        Math.min(...times.map((p) => p.start));
  }
  if (
    !Number.isFinite(duration) ||
    duration < minSeconds ||
    duration > MEDIA_LIMITS.maxRawSeconds + (output ? 0.3 : 0.1)
  )
    throw new MediaError(
      "Upload a video between 5 and 60 seconds. Trim longer footage before uploading.",
    );
  if (
    !v.width ||
    !v.height ||
    v.width > 4096 ||
    v.height > 4096 ||
    v.width * v.height > 16_777_216
  )
    throw new MediaError("Upload video at 4K resolution or lower.");
  if (
    !["h264", "hevc", "vp8", "vp9", "av1", "mjpeg", "mpeg4", "prores"].includes(
      v.codec_name,
    )
  )
    throw new MediaError(
      "This video codec is not supported. Export it as H.264 MP4 and try again.",
    );
  if (!/mov|mp4|matroska|webm/.test(raw.format.format_name))
    throw new MediaError("Use MP4, MOV, or WebM video.");
  if (
    output &&
    (v.codec_name !== "h264" ||
      audios[0]?.codec_name !== "aac" ||
      v.width !== MEDIA_LIMITS.width ||
      v.height !== MEDIA_LIMITS.height ||
      v.pix_fmt !== "yuv420p")
  )
    throw new MediaError("Rendered output failed the format checks.", 500);
  // Parse all selected source bytes before accepting them as evidence; ffprobe alone only reads headers.
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      "-threads",
      "2",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      file,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-f",
      "null",
      "-",
    ],
    60_000,
  );
  return {
    duration,
    width: v.width,
    height: v.height,
    videoCodec: v.codec_name,
    hasAudio: audios.length === 1,
    audioCodec: audios[0]?.codec_name || null,
    format: raw.format.format_name,
    bytes: info.size,
    sha256: await hashFile(file),
  };
}

const xml = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function lines(text, max = 26, maxRows = 4) {
  const result = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").split(" ")) {
    if ((line + " " + word).trim().length > max && line) {
      result.push(line);
      line = "";
    }
    // Break an excessively long word without letting it leave safe margins.
    for (let i = 0; i < word.length; i += max) {
      const part = word.slice(i, i + max);
      if (i) {
        result.push(line);
        line = part;
      } else line = (line + " " + part).trim();
    }
  }
  if (line) result.push(line);
  return result.slice(0, maxRows);
}
async function overlay(file, text, position, eyebrow, sponsorDisclosure) {
  const rows = lines(text);
  const y = position === "top" ? 210 : 1415;
  const body = rows
    .map(
      (line, i) =>
        `<text x="92" y="${y + 86 + i * 62}" fill="#F7F6F2" font-size="51" font-weight="700">${xml(line)}</text>`,
    )
    .join("");
  const disclosureRows = sponsorDisclosure
    ? lines(`Sponsored · ${sponsorDisclosure}`, 32, 8)
    : [];
  const disclosure = disclosureRows
    .map(
      (line, i) =>
        `<text x="92" y="${y + rows.length * 62 + 77 + i * 36}" fill="#CBB6FF" font-size="27" font-weight="500">${xml(line)}</text>`,
    )
    .join("");
  const extraHeight = disclosureRows.length
    ? disclosureRows.length * 36 + 30
    : 0;
  // Only XML-escaped plain text is interpolated. No external image, CSS, or user-controlled attributes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><g font-family="DejaVu Sans, Arial, sans-serif"><rect x="64" y="${y - 14}" width="952" height="${rows.length * 62 + 105 + extraHeight}" rx="28" fill="#171A22" fill-opacity="0.87"/><text x="92" y="${y + 25}" fill="#CBB6FF" font-size="27" font-weight="600" letter-spacing="3">${xml(eyebrow)}</text>${body}${disclosure}</g></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

export async function renderReel(
  input,
  assets,
  outputDirectory,
  { workRoot = outputDirectory } = {},
) {
  const manifest = renderManifestSchema.parse(input);
  const started = performance.now(),
    work = path.join(workRoot, `work-${manifest.outputId}`);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(work, { recursive: false });
  const output = path.join(outputDirectory, `${manifest.outputId}.mp4`),
    thumbnail = path.join(outputDirectory, `${manifest.outputId}.jpg`);
  try {
    const watermark =
      manifest.clips.length === 1 ? path.join(work, "watermark.png") : null;
    if (watermark) await writeWatermark(watermark);
    const parts = [];
    for (const [index, clip] of manifest.clips.entries()) {
      const asset = assets.get(clip.assetId);
      if (!asset || asset.runId !== manifest.runId || asset.slot !== index)
        throw new MediaError(
          "This clip does not belong to the required run and slot.",
          403,
        );
      const metadata = await probeMedia(asset.path);
      if (metadata.sha256 !== asset.sha256)
        throw new MediaError("The sealed source digest has changed.", 409);
      if (clip.end > metadata.duration + 0.08)
        throw new MediaError(
          `Clip ${index + 1} selection extends beyond its duration.`,
        );
      const duration = clip.end - clip.start;
      const labelPng = path.join(work, `label-${index}.png`),
        treatmentPng = path.join(work, `treatment-${index}.png`);
      await overlay(
        labelPng,
        clip.label || ["The setup", "Commit to the bit", "The reaction"][index],
        "bottom",
        `SIDEQUEST  /  ${index + 1} OF 3`,
      );
      await overlay(
        treatmentPng,
        index === 2 ? "You actually did it." : manifest.title,
        "top",
        index === 2 ? "QUEST COMPLETE" : "YOUR SIDEQUEST",
        manifest.sponsorDisclosure,
      );
      const part = path.join(work, `part-${index}.mp4`);
      parts.push(part);
      const inputArgs = [
        "-ss",
        String(clip.start),
        "-t",
        String(duration),
        "-i",
        asset.path,
        "-loop",
        "1",
        "-i",
        labelPng,
        "-loop",
        "1",
        "-i",
        treatmentPng,
      ];
      const needsSilence = clip.mute || !metadata.hasAudio;
      if (watermark) inputArgs.push("-loop", "1", "-i", watermark);
      if (needsSilence)
        inputArgs.push(
          "-f",
          "lavfi",
          "-t",
          String(duration),
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
        );
      const size =
        clip.fit === "fill"
          ? `scale=1080:1920:force_original_aspect_ratio=increase:out_range=tv,crop=1080:1920:(iw-1080)*${clip.crop}:(ih-1920)/2`
          : "scale=1080:1920:force_original_aspect_ratio=decrease:out_range=tv,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x171A22";
      const titleSeconds = manifest.sponsorDisclosure
        ? Math.min(duration, 4.5)
        : 2.3;
      const closingSeconds = manifest.sponsorDisclosure
        ? Math.min(duration, 4.5)
        : 2;
      const enable =
        index === 0
          ? `lt(t,${titleSeconds})`
          : index === 2
            ? `gte(t,${duration - closingSeconds})`
            : "0";
      const videoTreatment =
        manifest.clips.length === 1
          ? manifest.sponsorDisclosure
            ? `[v][2:v]overlay=0:0:shortest=1:enable='${enable}'[disclosed];[disclosed][3:v]overlay=0:0:shortest=1,format=yuv420p[outv]`
            : "[v][3:v]overlay=0:0:shortest=1,format=yuv420p[outv]"
          : `[v][1:v]overlay=0:0:shortest=1[vlabel];[vlabel][2:v]overlay=0:0:shortest=1:enable='${enable}',format=yuv420p[outv]`;
      // Native camera H.264 can be full-range. Convert samples as well as the
      // range metadata; format=yuv420p alone can retain full-range yuvj420p.
      const filter = `[0:v]${size},setparams=range=limited,setsar=1,fps=30,setpts=PTS-STARTPTS[v];${videoTreatment};[${needsSilence ? (watermark ? 4 : 3) : 0}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[outa]`;
      await command(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          "-threads",
          "2",
          "-filter_complex_threads",
          "2",
          "-protocol_whitelist",
          "file,pipe",
          ...inputArgs,
          "-filter_complex",
          filter,
          "-map",
          "[outv]",
          "-map",
          "[outa]",
          "-t",
          String(duration),
          "-c:v",
          "libx264",
          "-threads",
          "2",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-color_range",
          "tv",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-ar",
          "48000",
          "-map_metadata",
          "-1",
          "-map_chapters",
          "-1",
          "-movflags",
          "+faststart",
          part,
        ],
        Math.max(10_000, MEDIA_LIMITS.maxJobMs - (performance.now() - started)),
      );
    }
    // All concat entries are generated local filenames, never user strings.
    await writeFile(
      path.join(work, "concat.txt"),
      parts.map((_, i) => `file 'part-${i}.mp4'`).join("\n"),
    );
    if (parts.length === 1) await copyFile(parts[0], output);
    else
      await command("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        path.join(work, "concat.txt"),
        "-c",
        "copy",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        output,
      ]);
    const metadata = await probeMedia(output, { output: true });
    const expected = manifest.clips.reduce(
      (sum, clip) => sum + clip.end - clip.start,
      0,
    );
    if (Math.abs(metadata.duration - expected) > 0.3)
      throw new MediaError(
        "Rendered duration does not match the selected clips.",
        500,
      );
    await command("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-ss",
      "1",
      "-i",
      output,
      "-frames:v",
      "1",
      "-vf",
      "scale=360:640",
      "-update",
      "1",
      thumbnail,
    ]);
    return {
      output,
      thumbnail,
      metadata: {
        ...metadata,
        renderMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    await Promise.all([
      rm(output, { force: true }),
      rm(thumbnail, { force: true }),
    ]);
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Normalize independent recorder containers before joining; never append raw MP4/WebM bytes. */
export async function composeTakes(files, directory, imageOverlay) {
  if (!files.length || files.length > 30)
    throw new MediaError("Choose between 1 and 30 takes.", 400);
  let seconds = 0;
  let bytes = 0;
  const sources = [];
  for (const file of files) {
    const metadata = await probeMedia(file, { minSeconds: 0.1 });
    seconds += metadata.duration;
    bytes += metadata.bytes;
    if (seconds > 60.1 || bytes > MEDIA_LIMITS.maxUploadBytes)
      throw new MediaError(
        "Your complete video must be at most 60 seconds and 40 MB.",
      );
    sources.push({ file, metadata });
  }
  if (seconds < 5 || seconds > 60.1 || bytes > MEDIA_LIMITS.maxUploadBytes)
    throw new MediaError(
      "Your complete video must be 5–60 seconds and no larger than 40 MB.",
    );
  const started = performance.now();
  const overlay = imageOverlay
    ? path.join(directory, "image-overlay.png")
    : null;
  if (imageOverlay) {
    try {
      await writeImageOverlay(
        imageOverlay.file,
        imageOverlay.position,
        overlay,
        imageOverlay.transform,
      );
    } catch {
      throw new MediaError(
        "Choose a still PNG, JPEG or WebP image no larger than 5 MB.",
        400,
      );
    }
  }
  for (const [index, { file, metadata }] of sources.entries()) {
    const args = ["-i", file];
    if (!metadata.hasAudio)
      args.push(
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=48000",
      );
    await command(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-threads",
        "2",
        "-filter_complex_threads",
        "2",
        "-protocol_whitelist",
        "file,pipe",
        ...args,
        "-filter_complex",
        `[0:v]scale=1080:1920:force_original_aspect_ratio=decrease:out_range=tv,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x171A22,setparams=range=limited,setsar=1,fps=30,setpts=PTS-STARTPTS,format=yuv420p[v];[${metadata.hasAudio ? 0 : 1}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${metadata.duration},asetpts=PTS-STARTPTS[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-t",
        String(metadata.duration),
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-color_range",
        "tv",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        path.join(directory, `part-${index}.mp4`),
      ],
      Math.max(1000, MEDIA_LIMITS.maxJobMs - (performance.now() - started)),
    );
  }
  await writeFile(
    path.join(directory, "concat.txt"),
    sources.map((_, i) => `file 'part-${i}.mp4'`).join("\n"),
  );
  const output = path.join(directory, "session.mp4");
  await command("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "concat",
    "-safe",
    "1",
    "-i",
    path.join(directory, "concat.txt"),
    ...(overlay
      ? [
          "-loop",
          "1",
          "-i",
          overlay,
          "-filter_complex",
          "[0:v]setpts=PTS-STARTPTS[v];[v][1:v]overlay=0:0:shortest=1,format=yuv420p[outv]",
          "-map",
          "[outv]",
          "-map",
          "0:a",
        ]
      : ["-vf", "setpts=PTS-STARTPTS"]),
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-color_range",
    "tv",
    "-c:a",
    "aac",
    "-af",
    `asetpts=PTS-STARTPTS,atrim=duration=${Math.min(seconds, 60)}`,
    "-t",
    String(Math.min(seconds, 60)),
    "-map_metadata",
    "-1",
    "-movflags",
    "+faststart",
    output,
  ]);
  const result = await probeMedia(output);
  if (Math.abs(result.duration - seconds) > 0.3)
    throw new MediaError("The recorded takes could not be joined accurately.");
  return output;
}
