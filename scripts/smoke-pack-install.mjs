#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(path.join(tmpdir(), "dds-pack-smoke-"));
const packDir = path.join(tempRoot, "pack");
const projectDir = path.join(tempRoot, "clean-project");

const sampleSpec = {
  schemaVersion: "simulator.v1",
  domain: "field-service-pack-smoke",
  defaults: {
    days: 3,
    startDate: "2026-01-01",
    timezone: "UTC",
    locale: "en-US",
  },
  entities: [
    {
      name: "customer",
      count: 2,
      fields: [
        { name: "id", type: "id", required: true },
        { name: "name", type: "string", required: true },
      ],
    },
    {
      name: "ticket",
      count: 4,
      fields: [
        { name: "id", type: "id", required: true },
        { name: "customer_id", type: "ref:customer", required: true },
        { name: "priority", type: "enum", values: ["low", "normal", "urgent"] },
      ],
    },
  ],
  relationships: [{ from: "ticket", to: "customer", type: "many_to_one", field: "customer_id" }],
  events: [{ name: "ticket_created", sourceEntity: "ticket", countPerEntity: 1 }],
  metrics: [{ name: "tickets", expression: "count(ticket_created)", dependsOn: ["ticket_created"], unit: "tickets" }],
  outputs: { formats: ["csv", "jsonl", "manifest"] },
};

try {
  await mkdirFor(packDir);
  await run("npm", ["pack", "--pack-destination", packDir], repoRoot);
  const tarballName = (await readFile(path.join(packDir, "package.tgz"), "utf8").catch(() => "")).trim();
  const packed = tarballName ? path.join(packDir, tarballName) : await findTarball(packDir);

  await run("npm", ["init", "-y"], projectDir);
  await run("npm", ["install", "--ignore-scripts", packed], projectDir);
  await writeFile(path.join(projectDir, "simulator.spec.json"), `${JSON.stringify(sampleSpec, null, 2)}\n`, "utf8");

  await run(binPath("dds"), ["--help"], projectDir);
  await run(binPath("dds"), ["validate", "--spec", "simulator.spec.json"], projectDir);
  await run(binPath("dds"), ["generate", "--spec", "simulator.spec.json", "--seed", "42", "--out", "demo-data"], projectDir);

  const manifest = JSON.parse(await readFile(path.join(projectDir, "demo-data", "manifest.json"), "utf8"));
  const events = await readFile(path.join(projectDir, "demo-data", "events.jsonl"), "utf8");
  if (manifest.seed !== "42" || !events.includes("ticket_created")) {
    throw new Error("Generated smoke output did not include the expected manifest seed and ticket event.");
  }

  console.log(`Pack smoke passed from clean project using ${path.basename(packed)}.`);
} finally {
  if (process.env.DDS_KEEP_PACK_SMOKE !== "1") {
    await rm(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`Kept smoke workspace at ${tempRoot}`);
  }
}

function binPath(name) {
  return path.join(projectDir, "node_modules", ".bin", name);
}

async function findTarball(directory) {
  const { readdir } = await import("node:fs/promises");
  const tarballs = (await readdir(directory)).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error(`Expected one packed tarball in ${directory}, found ${tarballs.length}.`);
  }
  return path.join(directory, tarballs[0]);
}

async function run(command, args, cwd) {
  await mkdirFor(cwd);
  console.log(`$ ${[command, ...args].join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

async function mkdirFor(directory) {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(directory, { recursive: true });
}
