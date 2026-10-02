import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  assertPublicImageAllowed,
  assertPublicTextAllowed,
  requireContentReviewPermission,
} from "../worker/content-moderation";

const env = { OPENAI_API_KEY: "test-server-key" };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ results: [{ flagged: false }] })),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("requires an explicit true permission value rather than trusting missing, truthy or false values", () => {
  for (const value of [undefined, "", "1", "TRUE", "false"])
    expect(() => requireContentReviewPermission(value)).toThrow(
      "Allow OpenAI content review",
    );
  expect(() => requireContentReviewPermission("true")).not.toThrow();
});
it("sends only the provided public text to a fixed server endpoint without identifiers or provider persistence options", async () => {
  await assertPublicTextAllowed(env, [
    "public_handle",
    "Public name",
    "Public bio",
  ]);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.openai.com/v1/moderations");
  expect(options.headers).toEqual({
    Authorization: "Bearer test-server-key",
    "Content-Type": "application/json",
  });
  expect(JSON.parse(options.body)).toEqual({
    model: "omni-moderation-latest",
    input: "public_handle\n\nPublic name\n\nPublic bio",
  });
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it("sends the normalized profile bytes inline without a public image URL or other data", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 0, 255]);
  await assertPublicImageAllowed(env, png);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    model: "omni-moderation-latest",
    input: [
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,iVBORwD/" },
      },
    ],
  });
});
it("rejects flagged content without exposing submitted content or provider data", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        results: [{ flagged: true }],
        privateProviderData: "hidden",
      }),
    ),
  );
  await expect(
    assertPublicTextAllowed(env, ["submitted private-looking text"]),
  ).rejects.toMatchObject({ code: "content_not_allowed", status: 422 });
});
it("fails closed before any provider call when the server key is absent", async () => {
  await expect(assertPublicTextAllowed({}, ["name"])).rejects.toMatchObject({
    code: "content_review_unavailable",
    status: 503,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  ["missing result", {}],
  ["empty result", { results: [] }],
  ["multiple results", { results: [{ flagged: false }, { flagged: false }] }],
  ["missing flag", { results: [{}] }],
  ["nonboolean flag", { results: [{ flagged: "false" }] }],
])(
  "fails closed on %s rather than assuming provider success",
  async (_name, value) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(value)));
    await expect(assertPublicTextAllowed(env, ["name"])).rejects.toMatchObject({
      code: "content_review_unavailable",
      status: 503,
    });
  },
);
it("fails closed on transport, timeout, non-JSON, HTTP and oversized provider responses", async () => {
  for (const response of [
    new Response("provider-secret", { status: 401 }),
    new Response("not-json"),
    new Response("x".repeat(65 * 1024)),
    new Response("{}", { headers: { "Content-Length": String(65 * 1024) } }),
    new Response(null),
  ]) {
    fetchMock.mockResolvedValueOnce(response);
    await expect(assertPublicTextAllowed(env, ["name"])).rejects.toMatchObject({
      code: "content_review_unavailable",
      status: 503,
    });
  }
  for (const error of [
    new Error("provider-secret"),
    new DOMException("secret", "TimeoutError"),
  ]) {
    fetchMock.mockRejectedValueOnce(error);
    await expect(assertPublicTextAllowed(env, ["name"])).rejects.toMatchObject({
      message:
        "Content review is temporarily unavailable. Your changes have not been shared. Please try again.",
    });
  }
});
