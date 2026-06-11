import { describe, expect, it } from "vitest";
import { validateSpec } from "./spec.js";
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

