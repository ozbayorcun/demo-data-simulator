import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = path.join(repoRoot, "dist", "cli.js");

const packProofs = [
  {
    id: "field-service",
    seed: "field-service-demo",
    entity: "work_order",
    rows: 30,
    event: "work_order_completed",
    scenarios: [
      "overdue-work",
      "reassignment",
      "missed-appointment",
      "high-priority-customer",
      "technician-capacity-pressure",
    ],
  },
  {
    id: "sales-pipeline",
    seed: "sales-demo",
    entity: "opportunity",
    rows: 36,
    event: "opportunity_closed_won",
    scenarios: ["healthy-new-business", "stalled-enterprise-deal", "expansion-signal", "competitive-loss"],
  },
  {
    id: "recruiting-pipeline",
    seed: "recruiting-demo",
    entity: "application",
    rows: 40,
    event: "offer_accepted",
    scenarios: ["fast-track-candidate", "stalled-interview-loop", "offer-declined"],
  },
];

for (const pack of packProofs) {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), `dds-${pack.id}-proof-`));
  const dataDir = path.join(projectDir, "demo-data");
  const specPath = path.join(projectDir, "simulator.spec.json");
  const proofMarkdown = path.join(dataDir, "proof.md");
  const proofJson = path.join(dataDir, "proof.json");

  await run("node", [cli, "init", "--pack", pack.id, "--project", projectDir], repoRoot);
  await run("node", [cli, "validate", "--spec", specPath], repoRoot);
  await run("node", [cli, "generate", "--spec", specPath, "--seed", pack.seed, "--out", dataDir], repoRoot);
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

  assert(markdown.includes(`# ${pack.id} Proof Report`), `${pack.id} proof.md should include the report heading`);
  assert(markdown.includes("Status: PASS"), `${pack.id} proof.md should show a passing status`);
  assert(proof.ok === true, `${pack.id} proof.json should pass`);
  assert(proof.spec.seed === pack.seed, `${pack.id} proof.json should include the seed`);
  assert(
    proof.coverage.entities.some((entity) => entity.name === pack.entity && entity.actualRows === pack.rows),
    `${pack.id} proof.json should include ${pack.entity} coverage`,
  );
  assert(
    proof.coverage.events.some((event) => event.name === pack.event && event.actualRows === pack.rows),
    `${pack.id} proof.json should include ${pack.event} coverage`,
  );
  for (const scenario of pack.scenarios) {
    assert(
      proof.coverage.edgeCases.some((edgeCase) => edgeCase.scenario === scenario && edgeCase.count > 0),
      `${pack.id} proof.json should include supporting rows or events for ${scenario}`,
    );
  }
}

console.log("Scenario pack proof smoke passed.");
for (const pack of packProofs) {
  console.log(`- Initialized, generated, and proofed ${pack.id} with seed ${pack.seed}.`);
}
console.log("- Verified proof.md and proof.json for every built-in pack.");

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
