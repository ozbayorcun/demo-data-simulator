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
          {
            name: "status",
            type: "enum",
            values: ["completed", "overdue", "reassigned", "missed_appointment", "high_priority", "capacity_pressure"],
          },
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
      {
        name: "work_order_delayed",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 4,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_reassigned",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 5,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_missed_appointment",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 6,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_escalated",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 7,
        dependsOn: ["work_order_created"],
      },
      {
        name: "technician_capacity_pressure",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 8,
        dependsOn: ["work_order_scheduled"],
      },
    ],
    scenarios: [
      {
        name: "normal-week",
        description: "Balanced demand with normal completion flow.",
        startsOnDay: 1,
        endsOnDay: 14,
      },
      {
        name: "overdue-work",
        description: "A work order misses its expected service window.",
        startsOnDay: 2,
        endsOnDay: 5,
        effects: [
          { target: "entity:work_order.status=overdue", description: "Rows marked as overdue work." },
          { target: "event:work_order_delayed", description: "Delay events show overdue workflow movement." },
        ],
      },
      {
        name: "reassignment",
        description: "A scheduled job is reassigned to another technician.",
        startsOnDay: 3,
        endsOnDay: 7,
        effects: [
          { target: "entity:work_order.status=reassigned", description: "Rows marked as reassigned work." },
          { target: "event:work_order_reassigned", description: "Reassignment events show technician handoff." },
        ],
      },
      {
        name: "missed-appointment",
        description: "A customer appointment is missed and needs follow-up.",
        startsOnDay: 4,
        endsOnDay: 8,
        effects: [
          { target: "entity:work_order.status=missed_appointment", description: "Rows marked as missed appointments." },
          { target: "event:work_order_missed_appointment", description: "Missed appointment events show failed visit flow." },
        ],
      },
      {
        name: "high-priority-customer",
        description: "Urgent customer work is escalated.",
        startsOnDay: 1,
        endsOnDay: 10,
        effects: [
          { target: "entity:work_order.status=high_priority", description: "Rows marked as high-priority work." },
          { target: "event:work_order_escalated", description: "Escalation events show priority handling." },
        ],
      },
      {
        name: "technician-capacity-pressure",
        description: "Technician capacity pressure creates operational strain.",
        startsOnDay: 6,
        endsOnDay: 14,
        effects: [
          { target: "entity:work_order.status=capacity_pressure", description: "Rows marked as capacity-pressure work." },
          { target: "event:technician_capacity_pressure", description: "Capacity pressure events show constrained operations." },
        ],
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
