#!/usr/bin/env node
import path from "node:path";
import { readJson } from "./fs-utils.js";
import { writeJson } from "./fs-utils.js";
import { parseArgs, getBoolean, getPositiveInteger, getString, getStringArray } from "./args.js";
import { doctorAgent, type AgentName } from "./agent.js";
import { inferSpec } from "./infer.js";
import { initProject } from "./init.js";
import { validateSpec } from "./spec.js";
import { generateData } from "./generator.js";
import { explainSpec } from "./explain.js";
import { generateProofReport } from "./proof.js";
import { diffProofReports, renderProofDiff } from "./proof-diff.js";
import { isEvidenceProfile } from "./evidence.js";
import { getScenarioPack, listScenarioPackIds, listScenarioPacks } from "./packs.js";
import type { SimulatorSpec } from "./types.js";
import type { ProofReport } from "./proof.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const project = path.resolve(getString(args.flags, "project", cwd) ?? cwd);

  if (args.command === "help" || args.command === "--help" || args.command === "-h" || getBoolean(args.flags, "help")) {
    printHelp();
    return;
  }

  if (args.command === "doctor") {
    const result = doctorAgent((getString(args.flags, "agent", "auto") ?? "auto") as AgentName);
    console.log(`${result.ok ? "OK" : "FAIL"} ${result.detail}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (args.command === "init") {
    const written = await initProject(project, { pack: getString(args.flags, "pack") });
    console.log(written.length ? `Wrote ${written.map((file) => path.relative(project, file)).join(", ")}` : "Already initialized.");
    return;
  }

  if (args.command === "pack") {
    const action = args.positionals[0] ?? "list";
    if (action === "list") {
      for (const pack of listScenarioPacks()) {
        console.log(`${pack.id}\t${pack.description}`);
      }
      return;
    }

    if (action === "export") {
      const packId = getString(args.flags, "pack") ?? args.positionals[1];
      if (!packId) {
        console.error(`Missing --pack. Available packs: ${listScenarioPackIds().join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const pack = getScenarioPack(packId);
      if (!pack) {
        console.error(`Unknown scenario pack "${packId}". Available packs: ${listScenarioPackIds().join(", ")}`);
        process.exitCode = 1;
        return;
      }

      const outPath = path.resolve(getString(args.flags, "out", `${pack.id}.simulator.spec.json`) ?? `${pack.id}.simulator.spec.json`);
      await writeJson(outPath, pack.spec);
      console.log(`Exported ${pack.id} scenario pack to ${outPath}`);
      return;
    }

    console.error(`Unknown pack action: ${action}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (args.command === "infer") {
    const evidenceProfile = getString(args.flags, "profile", "balanced") ?? "balanced";
    if (!isEvidenceProfile(evidenceProfile)) {
      console.error(`Invalid --profile "${evidenceProfile}". Expected fast, balanced, or wide.`);
      process.exitCode = 1;
      return;
    }

    const envelope = await inferSpec({
      projectRoot: project,
      agent: (getString(args.flags, "agent", "auto") ?? "auto") as AgentName,
      agentCmd: getString(args.flags, "agent-cmd"),
      agentArgs: getStringArray(args.flags, "agent-arg"),
      include: getStringArray(args.flags, "include"),
      exclude: getStringArray(args.flags, "exclude"),
      maxFiles: getPositiveInteger(args.flags, "max-files"),
      maxBytes: getPositiveInteger(args.flags, "max-bytes"),
      evidenceProfile,
      acceptGenerated: getBoolean(args.flags, "accept-generated"),
    });
    console.log(`${envelope.status}: ${envelope.brief ?? envelope.error ?? "Inference finished."}`);
    if (envelope.status !== "ok") process.exitCode = envelope.status === "needs_decision" ? 2 : 1;
    return;
  }

  if (args.command === "validate" || args.command === "lint") {
    const spec = await loadSpec(args.flags);
    const result = validateSpec(spec);
    for (const warning of result.warnings) console.warn(`WARN ${warning}`);
    if (!result.ok) {
      for (const error of result.errors) console.error(`ERR ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(args.command === "lint" ? "Spec lint passed." : "Spec is valid.");
    return;
  }

  if (args.command === "generate") {
    const spec = await loadSpec(args.flags);
    const result = validateSpec(spec);
    if (!result.ok) {
      for (const error of result.errors) console.error(`ERR ${error}`);
      process.exitCode = 1;
      return;
    }
    const outDir = path.resolve(getString(args.flags, "out", "demo-data") ?? "demo-data");
    const seed = getString(args.flags, "seed", "1") ?? "1";
    const generated = await generateData({ spec: spec as SimulatorSpec, seed, outDir });
    console.log(`Generated ${generated.files.length} files in ${outDir}`);
    return;
  }

  if (args.command === "proof") {
    if (args.positionals[0] === "diff") {
      const baselinePath = getString(args.flags, "baseline");
      const candidatePath = getString(args.flags, "candidate");
      if (!baselinePath || !candidatePath) {
        console.error("proof diff requires --baseline <proof.json> and --candidate <proof.json>.");
        process.exitCode = 1;
        return;
      }

      const baseline = await readJson<ProofReport>(path.resolve(baselinePath));
      const candidate = await readJson<ProofReport>(path.resolve(candidatePath));
      const diff = diffProofReports(baseline, candidate);
      console.log(renderProofDiff(diff));
      if (!diff.ok && !getBoolean(args.flags, "allow-differences")) process.exitCode = 1;
      return;
    }

    const spec = await loadSpec(args.flags);
    const dataDir = path.resolve(getString(args.flags, "data", "demo-data") ?? "demo-data");
    const markdownOut = getString(args.flags, "out", path.join(dataDir, "proof.md"));
    const jsonOut = getString(args.flags, "json-out", path.join(dataDir, "proof.json"));
    const report = await generateProofReport({ spec: spec as SimulatorSpec, dataDir, markdownOut, jsonOut });
    console.log(`Proof ${report.ok ? "passed" : "failed"} for ${report.spec.domain}.`);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (args.command === "explain") {
    const spec = await loadSpec(args.flags);
    console.log(explainSpec(spec as SimulatorSpec));
    return;
  }

  console.error(`Unknown command: ${args.command}`);
  printHelp();
  process.exitCode = 1;
}

async function loadSpec(flags: Record<string, string | boolean | string[]>): Promise<SimulatorSpec> {
  const specPath = path.resolve(getString(flags, "spec", "simulator.spec.json") ?? "simulator.spec.json");
  return readJson<SimulatorSpec>(specPath);
}

function printHelp(): void {
  console.log(`demo-data-simulator

Usage:
  dds doctor --agent auto
  dds init --project .
  dds init --pack field-service --project .
  dds pack list
  dds pack export --pack field-service --out field-service.simulator.spec.json
  dds infer --agent codex --project .
  dds infer --agent codex --project . --profile fast
  dds infer --agent claude --project .
  dds infer --agent command --agent-cmd node --agent-arg examples/agents/field-service-agent.mjs --project .
  dds validate --spec simulator.spec.json
  dds lint --spec simulator.spec.json
  dds generate --spec simulator.spec.json --seed 42 --out demo-data
  dds proof --spec simulator.spec.json --data demo-data --out demo-data/proof.md
  dds proof diff --baseline proof-before.json --candidate proof-after.json
  dds explain --spec simulator.spec.json
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
