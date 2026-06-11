#!/usr/bin/env node

process.stdin.resume();
process.stdin.setEncoding("utf8");
let prompt = "";
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", () => {
  if (!prompt.includes("WorkOrder")) {
    console.log(JSON.stringify({
      schemaVersion: "inference.v1",
      status: "needs_decision",
      brief: "Could not find enough workflow evidence.",
      questions: [
        { id: "domain", question: "What workflow should be simulated?", default: "business workflow" }
      ]
    }));
    return;
  }

  console.log(JSON.stringify({
    schemaVersion: "inference.v1",
    status: "ok",
    brief: "Detected a field service workflow with customers, technicians, and work orders.",
    confidence: 0.88,
    evidence: [
      { claim: "Work orders belong to customers and technicians.", files: ["src/models.ts"] },
      { claim: "Work orders move through created, scheduled, completed states.", files: ["src/models.ts"] }
    ],
    assumptions: [
      "Each work order produces one created, scheduled, and completed event.",
      "CSV and JSONL are sufficient for the first output set."
    ],
    spec: {
      schemaVersion: "simulator.v1",
      domain: "field-service",
      description: "Work orders move from customer request to technician completion.",
      defaults: {
        days: 14,
        startDate: "2026-01-01",
        timezone: "UTC",
        locale: "en-US"
      },
      entities: [
        {
          name: "customer",
          count: 8,
          fields: [
            { name: "id", type: "id", required: true },
            { name: "name", type: "string", required: true },
            { name: "segment", type: "enum", values: ["residential", "commercial"] }
          ]
        },
        {
          name: "technician",
          count: 5,
          fields: [
            { name: "id", type: "id", required: true },
            { name: "name", type: "string", required: true },
            { name: "skill", type: "enum", values: ["hvac", "plumbing", "electrical"] }
          ]
        },
        {
          name: "work_order",
          count: 30,
          fields: [
            { name: "id", type: "id", required: true },
            { name: "customer_id", type: "ref:customer", required: true },
            { name: "technician_id", type: "ref:technician", required: true },
            { name: "priority", type: "enum", values: ["low", "normal", "urgent"] },
            { name: "created_at", type: "timestamp" }
          ]
        }
      ],
      relationships: [
        { from: "work_order", to: "customer", type: "many_to_one", field: "customer_id" },
        { from: "work_order", to: "technician", type: "many_to_one", field: "technician_id" }
      ],
      events: [
        { name: "work_order_created", sourceEntity: "work_order", countPerEntity: 1, sequence: 1 },
        { name: "work_order_scheduled", sourceEntity: "work_order", countPerEntity: 1, sequence: 2, dependsOn: ["work_order_created"] },
        { name: "work_order_completed", sourceEntity: "work_order", countPerEntity: 1, sequence: 3, dependsOn: ["work_order_scheduled"], fields: [{ name: "first_time_fix", type: "boolean" }] }
      ],
      metrics: [
        { name: "completed_work_orders", expression: "count(work_order_completed)", dependsOn: ["work_order_completed"], unit: "orders" }
      ],
      outputs: {
        formats: ["csv", "jsonl", "manifest"]
      }
    }
  }));
});

