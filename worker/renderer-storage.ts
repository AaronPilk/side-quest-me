/**
 * The Container SDK forwards output through IdentityTransformStream, which
 * loses the runtime's known-length marker even when Content-Length survives.
 * Re-establish that marker for R2 without buffering a reel in Worker memory.
 */
export async function storeRendererObject(
  bucket: R2Bucket,
  key: string,
  response: Response,
  expectedBytes: number,
  maxBytes: number,
  options: R2PutOptions,
) {
  if (
    !response.ok ||
    !response.body ||
    !Number.isSafeInteger(expectedBytes) ||
    expectedBytes <= 0 ||
    expectedBytes > maxBytes ||
    Number(response.headers.get("content-length")) !== expectedBytes
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new TypeError("Renderer output has an invalid byte length.");
  }
  const fixed = new FixedLengthStream(expectedBytes);
  const controller = new AbortController();
  const copying = response.body.pipeTo(fixed.writable, {
    signal: controller.signal,
  });
  // A synchronous R2 argument error must still enter the same cleanup path.
  const storing = Promise.resolve().then(() =>
    bucket.put(key, fixed.readable, options),
  );
  try {
    const [stored] = await Promise.all([storing, copying]);
    if (!stored || stored.size !== expectedBytes)
      throw new TypeError("Renderer output failed storage verification.");
    return stored;
  } catch (error) {
    controller.abort(error);
    // If put failed before consuming the readable side, release backpressure
    // so the source pipe can settle. If R2 owns it, pipe abort errors that read.
    await fixed.readable.cancel(error).catch(() => undefined);
    await Promise.allSettled([storing, copying]);
    throw error;
  }
}
