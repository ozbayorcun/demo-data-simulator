import path from "node:path";
import { existsSync } from "node:fs";
import { writeJson } from "./fs-utils.js";
import { getScenarioPack, listScenarioPackIds } from "./packs.js";
import { validateSpec } from "./spec.js";
import type { SimulatorSpec } from "./types.js";

export interface InitOptions {
  pack?: string;
}

export async function initProject(projectRoot: string, options: InitOptions = {}): Promise<string[]> {
  const written: string[] = [];
  const configPath = path.join(projectRoot, "demo-data-simulator.config.json");
  if (!existsSync(configPath)) {
    await writeJson(configPath, {
      schemaVersion: "config.v1",
      agent: "auto",
      spec: "simulator.spec.json",
      outDir: "demo-data",
    });
    written.push(configPath);
  }

  const specPath = path.join(projectRoot, "simulator.spec.json");
  if (!existsSync(specPath)) {
    await writeJson(specPath, specForInit(options));
    written.push(specPath);
  }
  return written;
}

function specForInit(options: InitOptions): SimulatorSpec {
  if (!options.pack) return templateSpec();

  const pack = getScenarioPack(options.pack);
  if (!pack) {
    throw new Error(`Unknown scenario pack "${options.pack}". Available packs: ${listScenarioPackIds().join(", ")}`);
  }

  const result = validateSpec(pack.spec);
  if (!result.ok) {
    throw new Error(`Built-in scenario pack "${options.pack}" is invalid: ${result.errors.join("; ")}`);
  }
  return pack.spec;
}

function templateSpec(): SimulatorSpec {
  return {
    schemaVersion: "simulator.v1",
    domain: "sample-workflow",
    description: "Replace this template with an inferred or edited simulator spec.",
    defaults: {
      days: 14,
      startDate: "2026-01-01",
      timezone: "UTC",
      locale: "en-US",
    },
    entities: [
      {
        name: "customer",
        count: 10,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
        ],
      },
    ],
    events: [
      {
        name: "customer_created",
        sourceEntity: "customer",
        countPerEntity: 1,
      },
    ],
    outputs: {
      formats: ["csv", "jsonl", "manifest"],
    },
  };
}
