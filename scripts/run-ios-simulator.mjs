import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--demo" && !arg.startsWith("--device="))) {
  throw new Error(
    "Usage: npm run ios:simulator -- [--demo] [--device=SIMULATOR_UUID]",
  );
}
function run(command, commandArgs, capture = false) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} failed (${result.status}).${capture ? ` ${result.stderr}` : ""}`,
    );
  return result.stdout;
}
const inventory = JSON.parse(
  run("xcrun", ["simctl", "list", "devices", "available", "-j"], true),
);
const phones = Object.values(inventory.devices)
  .flat()
  .filter((d) => d.isAvailable && d.name.startsWith("iPhone"));
const requested = args.find((arg) => arg.startsWith("--device="))?.slice(9);
const device = requested
  ? phones.find((d) => d.udid === requested)
  : (phones.find((d) => d.state === "Booted") ?? phones.at(-1));
if (!device)
  throw new Error(
    "Install an iPhone Simulator runtime in Xcode, or choose an available iPhone UUID with --device=.",
  );
run("npm", ["run", args.includes("--demo") ? "ios:sync:demo" : "ios:sync"]);
if (device.state !== "Booted") run("xcrun", ["simctl", "boot", device.udid]);
run("open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", device.udid]);
run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
const derived = path.join(root, ".local/ios-derived");
run("xcodebuild", [
  "-project",
  "ios/App/App.xcodeproj",
  "-scheme",
  "App",
  "-configuration",
  "Debug",
  "-destination",
  `platform=iOS Simulator,id=${device.udid}`,
  "-derivedDataPath",
  derived,
  "CODE_SIGNING_ALLOWED=NO",
  "build",
]);
run("xcrun", [
  "simctl",
  "install",
  device.udid,
  path.join(derived, "Build/Products/Debug-iphonesimulator/App.app"),
]);
run("xcrun", [
  "simctl",
  "launch",
  "--terminate-running-process",
  device.udid,
  "com.aaronpilk.sidequest",
]);
console.log(
  `Sidequest installed and launched on ${device.name}. ${args.includes("--demo") ? "Demo mode: run npm run dev:demo and npm run render:dev for media tests." : "Production services: native CORS and Supabase redirect allowlist must be configured."}`,
);
