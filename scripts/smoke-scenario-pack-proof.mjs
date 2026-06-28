import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(repoRoot, "dist", "cli.js");
const projectDir = await mkdtemp(path.join(os.tmpdir(), "dds-scenario-proof-"));
const dataDir = path.join(projectDir, "demo-data");
const specPath = path.join(projectDir, "simulator.spec.json");
const proofMarkdown = path.join(dataDir, "proof.md");
const proofJson = path.join(dataDir, "proof.json");

await run("node", [cli, "init", "--pack", "field-service", "--project", projectDir], repoRoot);
await run("node", [cli, "validate", "--spec", specPath], repoRoot);
await run("node", [cli, "generate", "--spec", specPath, "--seed", "field-service-demo", "--out", dataDir], repoRoot);
await run("node", [
  cli,
  "proof",
  "--spec",
  specPath,
  "--data",
  dataDir,
  "--out",
  proofMarkdown,
  "--json-out",
  proofJson,
], repoRoot);

const markdown = await readFile(proofMarkdown, "utf8");
const proof = JSON.parse(await readFile(proofJson, "utf8"));

assert(markdown.includes("# field-service Proof Report"), "proof.md should include the report heading");
assert(markdown.includes("Status: PASS"), "proof.md should show a passing status");
assert(proof.ok === true, "proof.json should pass");
assert(proof.spec.seed === "field-service-demo", "proof.json should include the seed");
assert(
  proof.coverage.entities.some((entity) => entity.name === "work_order" && entity.actualRows === 30),
  "proof.json should include work_order coverage",
);
assert(
  proof.coverage.events.some((event) => event.name === "work_order_completed" && event.actualRows === 30),
  "proof.json should include completed work order coverage",
);
for (const scenario of [
  "overdue-work",
  "reassignment",
  "missed-appointment",
  "high-priority-customer",
  "technician-capacity-pressure",
]) {
  assert(
    proof.coverage.edgeCases.some((edgeCase) => edgeCase.scenario === scenario && edgeCase.count > 0),
    `proof.json should include supporting rows or events for ${scenario}`,
  );
}

console.log("Scenario pack proof smoke passed.");
console.log(`- Initialized field-service pack in ${projectDir}`);
console.log("- Generated demo data with seed field-service-demo.");
console.log("- Verified proof.md and proof.json.");

async function run(command, args, cwd) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const child = spawn(command, args, { cwd, stdio: "inherit" });
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${exitCode}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
