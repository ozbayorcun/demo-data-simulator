#!/usr/bin/env node
import path from "node:path";
import { readJson } from "./fs-utils.js";
import { parseArgs, getBoolean, getNumber, getString, getStringArray } from "./args.js";
import { doctorAgent, type AgentName } from "./agent.js";
import { inferSpec } from "./infer.js";
import { initProject } from "./init.js";
import { validateSpec } from "./spec.js";
import { generateData } from "./generator.js";
import { explainSpec } from "./explain.js";
import type { SimulatorSpec } from "./types.js";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const project = path.resolve(getString(args.flags, "project", cwd) ?? cwd);

  if (args.command === "help" || getBoolean(args.flags, "help")) {
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
    const written = await initProject(project);
    console.log(written.length ? `Wrote ${written.map((file) => path.relative(project, file)).join(", ")}` : "Already initialized.");
    return;
  }

  if (args.command === "infer") {
    const envelope = await inferSpec({
      projectRoot: project,
      agent: (getString(args.flags, "agent", "auto") ?? "auto") as AgentName,
      agentCmd: getString(args.flags, "agent-cmd"),
      agentArgs: getStringArray(args.flags, "agent-arg"),
      include: getStringArray(args.flags, "include"),
      exclude: getStringArray(args.flags, "exclude"),
      maxFiles: getNumber(args.flags, "max-files"),
      maxBytes: getNumber(args.flags, "max-bytes"),
      acceptGenerated: getBoolean(args.flags, "accept-generated"),
    });
    console.log(`${envelope.status}: ${envelope.brief ?? envelope.error ?? "Inference finished."}`);
    if (envelope.status !== "ok") process.exitCode = envelope.status === "needs_decision" ? 2 : 1;
    return;
  }

  if (args.command === "validate") {
    const spec = await loadSpec(args.flags);
    const result = validateSpec(spec);
    for (const warning of result.warnings) console.warn(`WARN ${warning}`);
    if (!result.ok) {
      for (const error of result.errors) console.error(`ERR ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log("Spec is valid.");
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
  dds infer --agent codex --project .
  dds infer --agent claude --project .
  dds infer --agent command --agent-cmd node --agent-arg examples/agents/field-service-agent.mjs --project .
  dds validate --spec simulator.spec.json
  dds generate --spec simulator.spec.json --seed 42 --out demo-data
  dds explain --spec simulator.spec.json
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
