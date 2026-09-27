import { describe, expect, it } from "vitest";
import { renderManifestSchema } from "../shared/media";
const valid = {
  version: 1,
  runId: "7fbbd5b5-4bf2-4a98-8ce1-b58c1169a2b5",
  revision: 1,
  outputId: "93c597a9-b74e-41ca-bbd1-a70c6754af70",
  title: "A title: %{movie} [literal] <script>hello</script>",
  clips: [
    "434033d7-ea23-4fb7-984a-e03fa45fca52",
    "5050a250-6c3b-4b9b-a3b8-f0d4a8e40510",
    "658b242e-7f54-4cd2-92c7-215039b43293",
  ].map((assetId) => ({
    assetId,
    start: 1,
    end: 8,
    fit: "fit",
    mute: false,
    label: "Your real reaction",
  })),
};
describe("narrow media manifest", () => {
  it("keeps sponsor disclosure optional and bounds it as plain text", () => {
    expect(renderManifestSchema.parse(valid).sponsorDisclosure).toBeUndefined();
    const label = "Approved provider & support <literal text>";
    expect(
      renderManifestSchema.parse({ ...valid, sponsorDisclosure: label })
        .sponsorDisclosure,
    ).toBe(label);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        sponsorDisclosure: "a".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        sponsorDisclosure: { url: "http://169.254.169.254" },
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        sponsorUrl: "http://169.254.169.254",
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        sponsorDisclosure: "Hidden\u0000control",
      }).success,
    ).toBe(false);
  });
  it("preserves captions as plain text with strict input structure", () => {
    expect(renderManifestSchema.parse(valid).title).toBe(valid.title);
    expect(
      renderManifestSchema.safeParse({ ...valid, command: "cat /etc/passwd" })
        .success,
    ).toBe(false);
  });
  it("rejects arbitrary URL and output path transport", () => {
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        sourceUrl: "http://169.254.169.254",
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({ ...valid, outputId: "../../etc/file" })
        .success,
    ).toBe(false);
  });
  it("requires three distinct immutable sources and 5–15 seconds", () => {
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        clips: [valid.clips[0], valid.clips[0], valid.clips[2]],
      }).success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        clips: valid.clips.map((c) => ({ ...c, end: 3 })),
      }).success,
    ).toBe(false);
  });
  it("bounds captions and framing controls", () => {
    expect(
      renderManifestSchema.safeParse({ ...valid, title: "a".repeat(97) })
        .success,
    ).toBe(false);
    expect(
      renderManifestSchema.safeParse({
        ...valid,
        clips: valid.clips.map((c) => ({ ...c, crop: 1.1 })),
      }).success,
    ).toBe(false);
  });
});
