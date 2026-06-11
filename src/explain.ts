import type { SimulatorSpec } from "./types.js";

export function explainSpec(spec: SimulatorSpec): string {
  return [
    `${spec.domain}: ${spec.description ?? "business workflow simulation"}`,
    "",
    `Entities: ${spec.entities.map((entity) => `${entity.name} (${entity.count})`).join(", ")}`,
    `Events: ${spec.events.map((event) => event.name).join(", ")}`,
    `Metrics: ${(spec.metrics ?? []).map((metric) => metric.name).join(", ") || "daily event counts"}`,
    `Outputs: ${spec.outputs.formats.join(", ")}`,
    "",
    "Generation is deterministic for the same spec, seed, and runtime version.",
  ].join("\n");
}

