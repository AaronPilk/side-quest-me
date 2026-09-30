/** Shared by the iOS build and Node release guard. No configuration values are logged. */
export function assertProductionOrigin(value, label = "iOS service origin") {
  const invalid = () => {
    throw new Error(`${label} must be an exact public HTTPS origin`);
  };
  if (
    typeof value !== "string" ||
    !/^[\x21-\x7e]+$/.test(value) ||
    /[\\%?#@]/.test(value)
  )
    return invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (value !== url.origin && value !== `${url.origin}/`)
  )
    return invalid();
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  const mappedHigh = mapped ? Number.parseInt(mapped[1], 16) : -1;
  const mappedLow = mapped ? Number.parseInt(mapped[2], 16) : -1;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    (mapped &&
      (mappedHigh >>> 8 === 127 || (mappedHigh === 0 && mappedLow === 0)))
  )
    return invalid();
  return url.origin;
}

export function validateIosReleaseRecord(record) {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    record.platform !== "ios" ||
    record.environment !== "production"
  )
    throw new Error(
      "A TestFlight/App Store archive requires production iOS assets. Run npm run ios:sync first; demo assets cannot be released.",
    );
  if (
    typeof record.builtAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.builtAt) ||
    !Number.isFinite(Date.parse(record.builtAt)) ||
    new Date(record.builtAt).toISOString() !== record.builtAt
  )
    throw new Error("Production iOS assets need a valid build timestamp.");
  for (const key of ["apiOrigin", "publicOrigin"])
    assertProductionOrigin(record[key], key);
}
