import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderError, requestAiJson } from "../worker/ai-provider";

const config = {
  provider: "openai" as const,
  model: "gpt-6-astra",
  key: "fixture",
};
const schema = { type: "object", properties: {}, additionalProperties: false };
afterEach(() => vi.useRealTimers());

describe("AI reasoning and deadline budgets", () => {
  it("supports deliberate reasoning overrides without changing the fast default", async () => {
    const send = vi.fn<typeof fetch>(async () =>
      Response.json({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "{}" }] },
        ],
      }),
    );
    await requestAiJson(
      config,
      "instructions",
      {},
      schema,
      "concepts",
      send,
      3500,
      { reasoningEffort: "medium" },
    );
    await requestAiJson(config, "instructions", {}, schema, "filming", send);
    const requests = send.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );
    expect(requests[0]).toMatchObject({
      model: "gpt-6-astra",
      reasoning: { effort: "medium" },
      max_output_tokens: 3500,
      store: false,
    });
    expect(requests[1]).toMatchObject({
      reasoning: { effort: "low" },
      max_output_tokens: 3000,
    });
    for (const body of requests) {
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
    }
  });

  it.each([0, -1, NaN, Infinity])(
    "never makes a call with an exhausted or invalid deadline %s",
    async (timeoutMs) => {
      const send = vi.fn<typeof fetch>();
      await expect(
        requestAiJson(
          config,
          "instructions",
          {},
          schema,
          "concepts",
          send,
          3500,
          { timeoutMs },
        ),
      ).rejects.toMatchObject({ name: "AiProviderError", kind: "timeout" });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each([
    [17, 17],
    [90_000, 60_000],
  ])("aborts a %sms call at its %sms bound", async (requested, effective) => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const pending = requestAiJson(
      config,
      "instructions",
      {},
      schema,
      "concepts",
      send,
      3500,
      { timeoutMs: requested },
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AiProviderError",
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(effective - 1);
    expect(send.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    await expect(pending).rejects.toBeInstanceOf(AiProviderError);
    expect(send.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
