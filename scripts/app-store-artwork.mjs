#!/usr/bin/env node
/**
 * Deterministic App Store presentation layout around authentic native captures.
 * No app UI is drawn, replaced, retouched, or fabricated by this script.
 *
 * node scripts/app-store-artwork.mjs --init
 * node scripts/app-store-artwork.mjs --manifest app-store/2026-10-02/captures.json
 * node scripts/app-store-artwork.mjs --check --manifest /absolute/captures.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  BRAND_COLORS,
  BRAND_MARK_PATH,
  BRAND_MARK_VIEWBOX,
} from "../shared/brand.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_MANIFEST = path.join(
  REPO_ROOT,
  "app-store/2026-10-02/captures.json",
);
const WIDTH = 1320;
const HEIGHT = 2868;
const PHONE = { x: 138, y: 570, width: 1044, height: 2232, border: 16 };
const FONT = "Arial, Helvetica, sans-serif";
const PRESETS = [
  {
    id: "01-make-tonight-a-story",
    capture: "raw/01-quest.png",
    headline: ["Make tonight", "a story."],
    subtitle: "A real adventure for your people.",
    background: "#EEE9FF",
  },
  {
    id: "02-your-people-your-pace",
    capture: "raw/02-create.png",
    headline: ["Your people.", "Your pace."],
    subtitle: "Choose the time, budget, and energy.",
    background: "#F7F8FD",
  },
  {
    id: "03-find-your-next-detour",
    capture: "raw/03-places.png",
    headline: ["Find your", "next detour."],
    subtitle: "Explore real places around you.",
    background: "#F3F1FF",
  },
  {
    id: "04-film-it-as-it-happens",
    capture: "raw/04-camera.png",
    headline: ["Film it", "as it happens."],
    subtitle: "Record. Pause. Keep the story going.",
    background: "#F7F8FD",
  },
  {
    id: "05-keep-the-story-going",
    capture: "raw/05-series.png",
    headline: ["Keep the", "story going."],
    subtitle: "Turn a filmed quest into a series.",
    background: "#EEE9FF",
  },
  {
    id: "06-your-stories-your-choice",
    capture: "raw/06-journal.png",
    headline: ["Your stories.", "Your choice."],
    subtitle: "Keep a private journal. Share when ready.",
    background: "#F7F8FD",
  },
];

function argsFrom(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    output: null,
    init: false,
    check: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--init") args.init = true;
    else if (value === "--check") args.check = true;
    else if (["--manifest", "--output"].includes(value)) {
      const next = argv[++index];
      if (!next || next.startsWith("--"))
        throw new Error(`${value} needs a path.`);
      args[value.slice(2)] = path.resolve(next);
    } else if (value === "--help" || value === "-h") {
      console.log(
        "Usage: node scripts/app-store-artwork.mjs [--init] [--check] [--manifest captures.json] [--output directory]\n" +
          "--init writes six suggested entries without replacing an existing manifest.\n" +
          "--check validates the native captures without creating artwork.\n" +
          "Each capture must be a real portrait iPhone PNG/JPEG. Its UI stays intact.",
      );
      process.exit(0);
    } else throw new Error(`Unknown option: ${value}`);
  }
  return args;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateEntry(entry) {
  if (!entry || !/^[0-9]{2}-[a-z0-9-]+$/.test(entry.id))
    throw new Error(
      "Every entry needs a safe id such as 01-make-tonight-a-story.",
    );
  if (typeof entry.capture !== "string" || !entry.capture.trim())
    throw new Error(`${entry.id}: a native capture path is required.`);
  if (
    !Array.isArray(entry.headline) ||
    entry.headline.length < 1 ||
    entry.headline.length > 2 ||
    entry.headline.some(
      (line) => typeof line !== "string" || !line.trim() || line.length > 22,
    )
  )
    throw new Error(
      `${entry.id}: use one or two headline lines, each at most 22 characters.`,
    );
  if (typeof entry.subtitle !== "string" || entry.subtitle.length > 48)
    throw new Error(`${entry.id}: use a subtitle at most 48 characters.`);
  if (!/^#[0-9a-f]{6}$/i.test(entry.background))
    throw new Error(`${entry.id}: use an opaque six-digit background color.`);
}

function canvasSvg(entry) {
  const title = entry.headline
    .map(
      (line, index) =>
        `<text x="110" y="${290 + index * 112}" font-size="104" font-weight="700" letter-spacing="-3.5" fill="${BRAND_COLORS.charcoal}">${escapeXml(line)}</text>`,
    )
    .join("");
  const subtitleY = entry.headline.length === 1 ? 377 : 484;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs><linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${entry.background}"/><stop offset="1" stop-color="#FAFBFF"/></linearGradient></defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#surface)"/>
    <g font-family="${FONT}">
      <svg x="110" y="87" width="62" height="64" viewBox="${BRAND_MARK_VIEWBOX}"><path fill="${BRAND_COLORS.violet}" d="${BRAND_MARK_PATH}"/></svg>
      <text x="191" y="137" font-size="53" font-weight="700" letter-spacing="-1.7" fill="${BRAND_COLORS.charcoal}">Sidequest</text>
      ${title}
      <text x="110" y="${subtitleY}" font-size="45" font-weight="400" letter-spacing="-0.7" fill="#575565">${escapeXml(entry.subtitle)}</text>
    </g>
    <rect x="${PHONE.x - 11}" y="${PHONE.y + 16}" width="${PHONE.width + 22}" height="${PHONE.height}" rx="143" fill="#171A22" fill-opacity="0.065"/>
    <rect x="${PHONE.x}" y="${PHONE.y}" width="${PHONE.width}" height="${PHONE.height}" rx="134" fill="#171A22" stroke="#393A43" stroke-width="3"/>
    <rect x="${PHONE.x + 5}" y="${PHONE.y + 5}" width="${PHONE.width - 10}" height="${PHONE.height - 10}" rx="129" fill="#07080B" stroke="#666772" stroke-opacity="0.28" stroke-width="2"/>
  </svg>`;
}

async function prepareCapture(entry, base) {
  validateEntry(entry);
  const sourcePath = path.resolve(base, entry.capture);
  const bytes = await readFile(sourcePath);
  if (bytes.byteLength > 50 * 1024 * 1024)
    throw new Error(`${entry.id}: the capture exceeds 50 MiB.`);
  const metadata = await sharp(bytes).metadata();
  if (!["png", "jpeg"].includes(metadata.format))
    throw new Error(`${entry.id}: the capture must be a PNG or JPEG.`);
  if (!metadata.width || !metadata.height || metadata.width >= metadata.height)
    throw new Error(`${entry.id}: expected a portrait native capture.`);
  const ratio = metadata.height / metadata.width;
  if (ratio < 2 || ratio > 2.3)
    throw new Error(
      `${entry.id}: screenshot aspect ratio is not a modern portrait iPhone capture.`,
    );
  if (metadata.width < 1000)
    throw new Error(
      `${entry.id}: use a full-resolution native capture, at least 1000px wide.`,
    );
  return { entry, sourcePath, bytes, metadata };
}

async function renderCapture(capture, output) {
  const { entry, bytes } = capture;
  const inset = PHONE.border;
  const innerWidth = PHONE.width - inset * 2;
  const innerHeight = PHONE.height - inset * 2;
  // fit: contain preserves the entire capture. It never crops app controls.
  const fitted = await sharp(bytes)
    .rotate()
    .resize(innerWidth, innerHeight, { fit: "contain", background: "#07080B" })
    .ensureAlpha()
    .toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${innerWidth}" height="${innerHeight}"><rect width="${innerWidth}" height="${innerHeight}" rx="118" fill="white"/></svg>`,
  );
  const framed = await sharp(fitted)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const target = path.join(output, `${entry.id}.png`);
  if (target === capture.sourcePath)
    throw new Error(
      `${entry.id}: refusing to overwrite the raw native capture.`,
    );
  await sharp(Buffer.from(canvasSvg(entry)))
    .composite([{ input: framed, left: PHONE.x + inset, top: PHONE.y + inset }])
    .flatten({ background: entry.background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(target);
  const resultBytes = await readFile(target);
  return {
    id: entry.id,
    file: path.basename(target),
    width: WIDTH,
    height: HEIGHT,
    source: capture.sourcePath,
    sourceWidth: capture.metadata.width,
    sourceHeight: capture.metadata.height,
    sourceSha256: hash(bytes),
    sha256: hash(resultBytes),
    headline: entry.headline,
    subtitle: entry.subtitle,
  };
}

async function contactSheet(files, output) {
  const width = 330;
  const height = 717;
  const gap = 22;
  const columns = 3;
  const rows = Math.ceil(files.length / columns);
  const thumbnails = await Promise.all(
    files.map(async (file, index) => ({
      input: await sharp(path.join(output, file.file))
        .resize(width, height)
        .toBuffer(),
      left: gap + (index % columns) * (width + gap),
      top: gap + Math.floor(index / columns) * (height + gap),
    })),
  );
  await sharp({
    create: {
      width: columns * width + (columns + 1) * gap,
      height: rows * height + (rows + 1) * gap,
      channels: 3,
      background: "#E5E5EE",
    },
  })
    .composite(thumbnails)
    .jpeg({ quality: 92 })
    .toFile(path.join(output, "contact-sheet.jpg"));
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  const base = path.dirname(args.manifest);
  if (args.init) {
    await mkdir(base, { recursive: true });
    await writeFile(
      args.manifest,
      JSON.stringify(
        { version: 1, locale: "en-US", captures: PRESETS },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    );
    console.log(
      `Created ${args.manifest}. Supply authentic captures at its raw/ paths, then run this script without --init.`,
    );
    return;
  }
  const manifest = JSON.parse(await readFile(args.manifest, "utf8"));
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.captures) ||
    !manifest.captures.length
  )
    throw new Error(
      "Expected a version 1 manifest with a nonempty captures array.",
    );
  if (manifest.captures.length > 10)
    throw new Error("A screenshot set may contain no more than ten images.");
  const ids = new Set();
  for (const entry of manifest.captures) {
    validateEntry(entry);
    if (ids.has(entry.id))
      throw new Error(`Duplicate screenshot id: ${entry.id}`);
    ids.add(entry.id);
  }
  const captures = await Promise.all(
    manifest.captures.map((entry) => prepareCapture(entry, base)),
  );
  if (args.check) {
    console.log(
      JSON.stringify(
        captures.map(({ entry, metadata }) => ({
          id: entry.id,
          source: entry.capture,
          width: metadata.width,
          height: metadata.height,
          targetWidth: WIDTH,
          targetHeight: HEIGHT,
        })),
        null,
        2,
      ),
    );
    return;
  }
  const output = args.output || base;
  await mkdir(output, { recursive: true });
  const files = [];
  // Sequential writes keep explicit render failures attributable to one screen.
  for (const capture of captures)
    files.push(await renderCapture(capture, output));
  await contactSheet(files, output);
  await writeFile(
    path.join(output, "artwork-manifest.json"),
    JSON.stringify(
      {
        version: 1,
        locale: manifest.locale || "en-US",
        size: { width: WIDTH, height: HEIGHT },
        method:
          "Deterministic SVG typography and vector phone frame around unchanged native captures.",
        brandSource:
          "shared/brand.mjs (approved owner-supplied violet direction)",
        capturesManifest: args.manifest,
        files,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Created ${files.length} opaque ${WIDTH}×${HEIGHT} PNGs, contact-sheet.jpg and artwork-manifest.json in ${output}. Inspect every image before uploading.`,
  );
}

main().catch((error) => {
  console.error(`App Store artwork: ${error.message}`);
  process.exitCode = 1;
});
