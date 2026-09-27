import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  chmod,
  appendFile,
} from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { generateDatabaseTypes } from "./db-types.mjs";
import { runDatabaseTests } from "../tests/database/invariants.mjs";
const root = resolve(import.meta.dirname, "..");
const pgBindir = spawnSync("pg_config", ["--bindir"], {
  encoding: "utf8",
}).stdout?.trim();
const binary = (name) => (pgBindir ? join(pgBindir, name) : name);
const temp = await mkdtemp(join(tmpdir(), "sq-db-"));
const data = join(temp, "data");
const socketServer = createServer();
await new Promise((resolve) => socketServer.listen(0, "127.0.0.1", resolve));
const port = socketServer.address().port;
await new Promise((resolve) => socketServer.close(resolve));
let started = false;
function cmd(name, args) {
  const r = spawnSync(binary(name), args, { encoding: "utf8", cwd: root });
  if (r.status !== 0)
    throw new Error(`${name}: ${r.stderr || r.stdout || r.error}`);
  return r.stdout;
}
try {
  cmd("initdb", [
    "-D",
    data,
    "-A",
    "trust",
    "-U",
    "postgres",
    "--no-locale",
    "-E",
    "UTF8",
  ]);
  if (process.argv.includes("--advisors")) {
    const tls = spawnSync(
      "openssl",
      [
        "req",
        "-new",
        "-x509",
        "-days",
        "1",
        "-nodes",
        "-out",
        join(temp, "server.crt"),
        "-keyout",
        join(temp, "server.key"),
        "-subj",
        "/CN=localhost",
      ],
      { encoding: "utf8" },
    );
    if (tls.status !== 0) throw new Error(tls.stderr);
    await chmod(join(temp, "server.key"), 0o600);
    await appendFile(
      join(data, "postgresql.conf"),
      `\nssl = on\nssl_cert_file = '${join(temp, "server.crt")}'\nssl_key_file = '${join(temp, "server.key")}'\n`,
    );
  }
  cmd("pg_ctl", [
    "-D",
    data,
    "-l",
    join(temp, "postgres.log"),
    "-o",
    `-k ${temp} -h ${process.argv.includes("--advisors") ? "127.0.0.1" : "''"} -p ${port}`,
    "-w",
    "start",
  ]);
  started = true;
  const sql = (query, role = "service_role") =>
    new Promise((res, rej) => {
      const p = spawn(
        binary("psql"),
        [
          "-X",
          "-q",
          "-A",
          "-t",
          "-v",
          "ON_ERROR_STOP=1",
          "-h",
          temp,
          "-p",
          String(port),
          "-U",
          "postgres",
          "-d",
          "postgres",
        ],
        { cwd: root },
      );
      let out = "",
        err = "";
      p.stdout.on("data", (b) => (out += b));
      p.stderr.on("data", (b) => (err += b));
      p.on("error", rej);
      p.on("close", (code) =>
        code === 0 ? res(out.trim()) : rej(new Error(err.trim())),
      );
      p.stdin.end(`${role ? `set role ${role};\n` : ""}${query}`);
    });
  await sql(
    await readFile(join(root, "tests/database/bootstrap.sql"), "utf8"),
    null,
  );
  for (const file of (await readdir(join(root, "supabase/migrations")))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await sql(
      await readFile(join(root, "supabase/migrations", file), "utf8"),
      null,
    );
  await sql(await readFile(join(root, "supabase/seed.sql"), "utf8"), null);
  if (process.argv.includes("--advisors")) {
    const advisory = spawnSync(
      "supabase",
      [
        "db",
        "advisors",
        "--db-url",
        `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
        "--type",
        "security",
        "--level",
        "warn",
      ],
      { encoding: "utf8", cwd: root },
    );
    console.log(
      `Supabase advisors exit ${advisory.status}: ${(advisory.stdout || "").trim()} ${(advisory.stderr || "").trim()}`,
    );
    if (advisory.status !== 0)
      throw new Error("Supabase security advisors failed.");
  }
  if (process.argv.includes("--generate-types"))
    await generateDatabaseTypes(
      sql,
      join(root, "shared/database.generated.ts"),
    );
  await runDatabaseTests(sql);
  console.log(
    "Database checks passed against isolated PostgreSQL; no remote database used.",
  );
} finally {
  if (started) cmd("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  await rm(temp, { recursive: true, force: true });
}
