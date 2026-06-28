import type { SimulatorSpec } from "./types.js";

export interface ScenarioPack {
  id: string;
  description: string;
  spec: SimulatorSpec;
}

const fieldServicePack: ScenarioPack = {
  id: "field-service",
  description: "Work orders move from customer request to technician completion.",
  spec: {
    schemaVersion: "simulator.v1",
    domain: "field-service",
    description: "Work orders move from customer request to technician completion.",
    defaults: {
      days: 14,
      startDate: "2026-01-01",
      timezone: "UTC",
      locale: "en-US",
    },
    entities: [
      {
        name: "customer",
        count: 8,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "segment", type: "enum", values: ["residential", "commercial"] },
        ],
      },
      {
        name: "technician",
        count: 5,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "skill", type: "enum", values: ["hvac", "plumbing", "electrical"] },
        ],
      },
      {
        name: "work_order",
        count: 30,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "customer_id", type: "ref:customer", required: true },
          { name: "technician_id", type: "ref:technician", required: true },
          { name: "priority", type: "enum", values: ["low", "normal", "urgent"] },
          { name: "created_at", type: "timestamp" },
        ],
      },
    ],
    relationships: [
      { from: "work_order", to: "customer", type: "many_to_one", field: "customer_id" },
      { from: "work_order", to: "technician", type: "many_to_one", field: "technician_id" },
    ],
    events: [
      {
        name: "work_order_created",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 1,
      },
      {
        name: "work_order_scheduled",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 2,
        dependsOn: ["work_order_created"],
      },
      {
        name: "work_order_completed",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 3,
        dependsOn: ["work_order_scheduled"],
        fields: [{ name: "first_time_fix", type: "boolean" }],
      },
    ],
    scenarios: [
      {
        name: "normal-week",
        description: "Balanced demand with normal completion flow.",
        startsOnDay: 1,
        endsOnDay: 14,
      },
    ],
    metrics: [
      {
        name: "completed_work_orders",
        expression: "count(work_order_completed)",
        dependsOn: ["work_order_completed"],
        unit: "orders",
      },
    ],
    outputs: {
      formats: ["csv", "jsonl", "manifest"],
    },
  },
};

const PACKS = new Map<string, ScenarioPack>([[fieldServicePack.id, fieldServicePack]]);

export function listScenarioPackIds(): string[] {
  return [...PACKS.keys()].sort();
}

export function getScenarioPack(id: string): ScenarioPack | undefined {
  const pack = PACKS.get(id);
  if (!pack) return undefined;
  return {
    ...pack,
    spec: structuredClone(pack.spec),
  };
}
