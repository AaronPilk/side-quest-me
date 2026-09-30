import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateIosReleaseRecord } from "./ios-release-config.mjs";

const directory = resolve(process.argv[2] || "ios/App/App/public");
let record;
try {
  record = JSON.parse(
    readFileSync(resolve(directory, "native-build.json"), "utf8"),
  );
} catch {
  throw new Error(
    "Missing or invalid iOS build metadata. Run npm run ios:sync before archiving.",
  );
}
validateIosReleaseRecord(record);
console.log(
  "iOS release assets are production-configured; signing and device verification remain separate.",
);
