import { describe, expect, it } from "vitest";
import { normalizeSpec, validateSpec } from "./spec.js";
import type { SimulatorSpec } from "./types.js";

const validSpec: SimulatorSpec = {
  schemaVersion: "simulator.v1",
  domain: "support-desk",
  entities: [
    {
      name: "ticket",
      count: 3,
      fields: [
        { name: "id", type: "id" },
        { name: "priority", type: "enum", values: ["low", "high"] },
      ],
    },
  ],
  events: [{ name: "ticket_created", sourceEntity: "ticket" }],
  outputs: { formats: ["csv", "jsonl", "manifest"] },
};

describe("validateSpec", () => {
  it("accepts a minimal valid simulator.v1 spec", () => {
    expect(validateSpec(validSpec).ok).toBe(true);
  });

  it("rejects broken event dependencies", () => {
    const result = validateSpec({
      ...validSpec,
      events: [{ name: "ticket_closed", sourceEntity: "ticket", dependsOn: ["missing"] }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("depends on missing event");
  });

  it("rejects missing reference targets", () => {
    const result = validateSpec({
      ...validSpec,
      entities: [
        {
          name: "ticket",
          count: 3,
          fields: [
            { name: "id", type: "id" },
            { name: "customer_id", type: "ref:customer" },
          ],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("references missing entity customer");
  });
});

describe("normalizeSpec", () => {
  it("normalizes common agent field type names", () => {
    const normalized = normalizeSpec({
      ...validSpec,
      entities: [
        {
          name: "WorkOrder",
          count: 3,
          fields: [
            { name: "id", type: "string" },
            { name: "customerId", type: "foreign_key" },
            { name: "createdAt", type: "datetime" },
          ],
        },
        {
          name: "Customer",
          count: 2,
          fields: [{ name: "id", type: "string" }],
        },
      ],
      relationships: [{ from: "WorkOrder", to: "Customer", type: "many_to_one", field: "customerId" }],
      events: [{ name: "created", sourceEntity: "WorkOrder" }],
    } as SimulatorSpec);

    expect(normalized.entities[0].fields[0].type).toBe("id");
    expect(normalized.entities[0].fields[1].type).toBe("ref:Customer");
    expect(normalized.entities[0].fields[2].type).toBe("timestamp");
  });
});
