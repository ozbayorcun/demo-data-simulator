import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(repoRoot, "dist", "cli.js");
const projectDir = await mkdtemp(path.join(os.tmpdir(), "dds-authoring-gates-"));
const specPath = path.join(projectDir, "field-service.simulator.spec.json");
const baselineDir = path.join(projectDir, "baseline");
const candidateDir = path.join(projectDir, "candidate");
const driftDir = path.join(projectDir, "drift");

const packList = await run("node", [cli, "pack", "list"], repoRoot);
assert(packList.stdout.includes("field-service"), "pack list should include field-service");
assert(packList.stdout.includes("sales-pipeline"), "pack list should include sales-pipeline");
assert(packList.stdout.includes("recruiting-pipeline"), "pack list should include recruiting-pipeline");

await run("node", [cli, "pack", "export", "--pack", "field-service", "--out", specPath], repoRoot);
await run("node", [cli, "lint", "--spec", specPath], repoRoot);
await run("node", [cli, "generate", "--spec", specPath, "--seed", "authoring-gates", "--out", baselineDir], repoRoot);
await run("node", [cli, "generate", "--spec", specPath, "--seed", "authoring-gates", "--out", candidateDir], repoRoot);
await run("node", [
  cli,
  "proof",
  "--spec",
  specPath,
  "--data",
  baselineDir,
  "--out",
  path.join(baselineDir, "proof.md"),
  "--json-out",
  path.join(baselineDir, "proof.json"),
], repoRoot);
await run("node", [
  cli,
  "proof",
  "--spec",
  specPath,
  "--data",
  candidateDir,
  "--out",
  path.join(candidateDir, "proof.md"),
  "--json-out",
  path.join(candidateDir, "proof.json"),
], repoRoot);
const matchingDiff = await run("node", [
  cli,
  "proof",
  "diff",
  "--baseline",
  path.join(baselineDir, "proof.json"),
  "--candidate",
  path.join(candidateDir, "proof.json"),
], repoRoot);
assert(matchingDiff.stdout.includes("Proof reports match."), "proof diff should pass identical proof reports");

await run("node", [cli, "generate", "--spec", specPath, "--seed", "authoring-gates-drift", "--out", driftDir], repoRoot);
await run("node", [
  cli,
  "proof",
  "--spec",
  specPath,
  "--data",
  driftDir,
  "--out",
  path.join(driftDir, "proof.md"),
  "--json-out",
  path.join(driftDir, "proof.json"),
], repoRoot);
const driftDiff = await run(
  "node",
  [
    cli,
    "proof",
    "diff",
    "--baseline",
    path.join(baselineDir, "proof.json"),
    "--candidate",
    path.join(driftDir, "proof.json"),
  ],
  repoRoot,
  { expectedExitCode: 1 },
);
assert(driftDiff.stdout.includes("Proof reports differ:"), "proof diff should report expected drift");
await run("node", [
  cli,
  "proof",
  "diff",
  "--baseline",
  path.join(baselineDir, "proof.json"),
  "--candidate",
  path.join(driftDir, "proof.json"),
  "--allow-differences",
], repoRoot);

const proof = JSON.parse(await readFile(path.join(baselineDir, "proof.json"), "utf8"));
assert(proof.ok === true, "baseline proof should pass");
assert(proof.coverage.edgeCases.every((edgeCase) => edgeCase.count > 0), "edge cases should have supporting rows or events");

console.log("Scenario pack authoring gates smoke passed.");
console.log(`- Workspace: ${projectDir}`);
console.log("- Verified pack list/export, lint, generate, proof, proof diff, and allowed drift.");

async function run(command, args, cwd, options = {}) {
  const expectedExitCode = options.expectedExitCode ?? 0;
  console.log(`$ ${[command, ...args].join(" ")}`);
  const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr += text;
    process.stderr.write(text);
  });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== expectedExitCode) {
    throw new Error(`${command} ${args.join(" ")} exited with ${exitCode}; expected ${expectedExitCode}`);
  }
  return { stdout, stderr };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
