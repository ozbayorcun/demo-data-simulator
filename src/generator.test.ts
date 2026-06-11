import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateData } from "./generator.js";
import type { SimulatorSpec } from "./types.js";

const spec: SimulatorSpec = {
  schemaVersion: "simulator.v1",
  domain: "marketplace",
  defaults: { days: 7, startDate: "2026-01-01", timezone: "UTC", locale: "en-US" },
  entities: [
    {
      name: "buyer",
      count: 2,
      fields: [
        { name: "id", type: "id" },
        { name: "name", type: "string" },
      ],
    },
    {
      name: "order",
      count: 4,
      fields: [
        { name: "id", type: "id" },
        { name: "buyer_id", type: "ref:buyer" },
        { name: "total", type: "number", min: 10, max: 50 },
      ],
    },
  ],
  relationships: [{ from: "order", to: "buyer", type: "many_to_one", field: "buyer_id" }],
  events: [{ name: "order_created", sourceEntity: "order" }],
  metrics: [{ name: "orders", expression: "count(order_created)", dependsOn: ["order_created"], unit: "orders" }],
  outputs: { formats: ["csv", "jsonl", "manifest"] },
};

describe("generateData", () => {
  it("is deterministic for the same spec and seed", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "dds-first-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "dds-second-"));

    await generateData({ spec, seed: 42, outDir: first });
    await generateData({ spec, seed: 42, outDir: second });

    const firstEvents = await readFile(path.join(first, "events.jsonl"), "utf8");
    const secondEvents = await readFile(path.join(second, "events.jsonl"), "utf8");
    const firstOrders = await readFile(path.join(first, "entities", "order.csv"), "utf8");
    const secondOrders = await readFile(path.join(second, "entities", "order.csv"), "utf8");

    expect(firstEvents).toEqual(secondEvents);
    expect(firstOrders).toEqual(secondOrders);
  });
});

