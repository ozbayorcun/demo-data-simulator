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

  it("rejects invalid date defaults and numeric bounds", () => {
    const result = validateSpec({
      ...validSpec,
      defaults: { days: 0, startDate: "not-a-date" },
      entities: [
        {
          name: "ticket",
          count: 3,
          fields: [
            { name: "id", type: "id" },
            { name: "score", type: "integer", min: 10, max: 1 },
          ],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("defaults.days");
    expect(result.errors.join("\n")).toContain("defaults.startDate");
    expect(result.errors.join("\n")).toContain("min must be <= max");
  });

  it("does not warn for valid forward references", () => {
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
        {
          name: "customer",
          count: 2,
          fields: [{ name: "id", type: "id" }],
        },
      ],
      relationships: [{ from: "ticket", to: "customer", type: "many_to_one", field: "customer_id" }],
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
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
            { name: "tags", type: "array_string" },
            { name: "refs", type: "ref_array" },
            { name: "reviewedAt", type: "timestamp_optional" },
            { name: "title", type: "task_title" },
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
    expect(normalized.entities[0].fields[3].type).toBe("string");
    expect(normalized.entities[0].fields[4].type).toBe("string");
    expect(normalized.entities[0].fields[5].type).toBe("timestamp");
    expect(normalized.entities[0].fields[6].type).toBe("string");
  });

  it("cleans common agent dialect drift before validation", () => {
    const normalized = normalizeSpec({
      ...validSpec,
      entities: [
        {
          name: "Release",
          count: 3,
          fields: [
            { name: "id", type: "uuid" },
            { name: "version", type: "semver_or_current", min: null, max: null, values: null },
            { name: "optionalOwner", type: "string|null" },
            { name: "lastSeenAt", type: "datetime | null" },
          ],
        },
      ],
      events: [
        { name: "release_created", sourceEntity: "Release", dependsOn: ["Release"] },
        { name: "release_checked", sourceEntity: "Release", dependsOn: ["release_created", "Release"] },
      ],
    } as unknown as SimulatorSpec);

    expect(normalized.entities[0].fields[1]).toEqual({ name: "version", type: "string" });
    expect(normalized.entities[0].fields[2].type).toBe("string");
    expect(normalized.entities[0].fields[3].type).toBe("timestamp");
    expect(normalized.events[0].dependsOn).toEqual([]);
    expect(normalized.events[1].dependsOn).toEqual(["release_created"]);
    expect(validateSpec(normalized).ok).toBe(true);
  });
});
