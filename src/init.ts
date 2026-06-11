import path from "node:path";
import { existsSync } from "node:fs";
import { writeJson } from "./fs-utils.js";
import type { SimulatorSpec } from "./types.js";

export async function initProject(projectRoot: string): Promise<string[]> {
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
    await writeJson(specPath, templateSpec());
    written.push(specPath);
  }
  return written;
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

