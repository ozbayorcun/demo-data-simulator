import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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

  it("refuses to delete the current working directory", async () => {
    await expect(generateData({ spec, seed: 42, outDir: process.cwd() })).rejects.toThrow(
      /Refusing to generate into the current working directory/,
    );
  });

  it("refuses to overwrite non-generated non-empty directories", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-not-generated-"));
    await writeFile(path.join(outDir, "keep.txt"), "important", "utf8");

    await expect(generateData({ spec, seed: 42, outDir })).rejects.toThrow(
      /Refusing to overwrite a non-empty directory/,
    );
    await expect(readFile(path.join(outDir, "keep.txt"), "utf8")).resolves.toBe("important");
  });

  it("honors selected output formats", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-manifest-only-"));
    await generateData({
      spec: { ...spec, outputs: { formats: ["manifest"] } },
      seed: 42,
      outDir,
    });

    await expect(stat(path.join(outDir, "manifest.json"))).resolves.toBeTruthy();
    await expect(stat(path.join(outDir, "events.jsonl"))).rejects.toThrow();
    await expect(stat(path.join(outDir, "entities", "order.csv"))).rejects.toThrow();
  });

  it("preserves event sequence order for each source row", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-sequence-"));
    await generateData({
      spec: {
        ...spec,
        events: [
          { name: "order_created", sourceEntity: "order", sequence: 1 },
          {
            name: "order_scheduled",
            sourceEntity: "order",
            sequence: 2,
            dependsOn: ["order_created"],
          },
          {
            name: "order_completed",
            sourceEntity: "order",
            sequence: 3,
            dependsOn: ["order_scheduled"],
          },
        ],
      },
      seed: 42,
      outDir,
    });

    const events = (await readFile(path.join(outDir, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event_name: string; occurred_at: string; source_id: string });

    const order = new Map([
      ["order_created", 1],
      ["order_scheduled", 2],
      ["order_completed", 3],
    ]);

    for (const sourceId of new Set(events.map((event) => event.source_id))) {
      const sourceEvents = events
        .filter((event) => event.source_id === sourceId)
        .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
      expect(sourceEvents.map((event) => order.get(event.event_name))).toEqual([1, 2, 3]);
    }
  });
});
