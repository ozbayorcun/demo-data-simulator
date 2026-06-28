import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateData } from "./generator.js";
import type { SimulatorSpec } from "./types.js";

const fieldServiceSpecPath = path.resolve("examples/specs/field-service.simulator.spec.json");
const fieldServiceFixtureDir = path.resolve("examples/field-service/dashboard/data");
const fieldServiceFixtureFiles = [
  "entities/customer.csv",
  "entities/technician.csv",
  "entities/work_order.csv",
  "events.jsonl",
  "manifest.json",
  "metrics_daily.csv",
];

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

  it("generates richer deterministic values for common workflow fields", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-richer-fields-"));
    await generateData({
      spec: {
        ...spec,
        entities: [
          {
            name: "customer",
            count: 3,
            fields: [
              { name: "id", type: "id" },
              { name: "name", type: "string" },
              { name: "email", type: "string" },
              { name: "status", type: "enum", values: ["new", "active", "retained"] },
            ],
          },
        ],
        relationships: [],
        events: [{ name: "customer_created", sourceEntity: "customer" }],
      },
      seed: 42,
      outDir,
    });

    const customers = await readFile(path.join(outDir, "entities", "customer.csv"), "utf8");
    expect(customers).toContain("@example.test");
    expect(customers).toContain("new");
    expect(customers).toContain("active");
    expect(customers).not.toContain("name_1");
  });

  it("uses the seed when generating semantic string values", async () => {
    const first = await mkdtemp(path.join(os.tmpdir(), "dds-semantic-seed-first-"));
    const second = await mkdtemp(path.join(os.tmpdir(), "dds-semantic-seed-second-"));
    const semanticSpec: SimulatorSpec = {
      ...spec,
      entities: [
        {
          name: "customer",
          count: 3,
          fields: [
            { name: "id", type: "id" },
            { name: "name", type: "string" },
            { name: "email", type: "string" },
            { name: "region", type: "string" },
          ],
        },
      ],
      relationships: [],
      events: [],
    };

    await generateData({ spec: semanticSpec, seed: 42, outDir: first });
    await generateData({ spec: semanticSpec, seed: 43, outDir: second });

    const firstCustomers = await readFile(path.join(first, "entities", "customer.csv"), "utf8");
    const secondCustomers = await readFile(path.join(second, "entities", "customer.csv"), "utf8");
    expect(firstCustomers).not.toEqual(secondCustomers);
  });

  it("uses seeded selection after covering status enum values", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-status-seed-"));
    await generateData({
      spec: {
        ...spec,
        entities: [
          {
            name: "ticket",
            count: 12,
            fields: [
              { name: "id", type: "id" },
              { name: "status", type: "enum", values: ["open", "in_progress", "closed"] },
            ],
          },
        ],
        relationships: [],
        events: [],
      },
      seed: 42,
      outDir,
    });

    const tickets = await readFile(path.join(outDir, "entities", "ticket.csv"), "utf8");
    const statuses = tickets
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[1]);

    expect(statuses.slice(0, 3)).toEqual(["open", "in_progress", "closed"]);
    expect(statuses.slice(3).some((status) => status !== "closed")).toBe(true);
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

  it("sums source entity fields for sum metrics", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-sum-metric-"));
    await generateData({
      spec: {
        ...spec,
        defaults: { ...spec.defaults, days: 1 },
        entities: [
          {
            name: "opportunity",
            count: 2,
            fields: [
              { name: "id", type: "id" },
              { name: "amount", type: "number", min: 100, max: 100 },
            ],
          },
        ],
        relationships: [],
        events: [{ name: "opportunity_created", sourceEntity: "opportunity" }],
        metrics: [
          {
            name: "pipeline_value",
            expression: "sum(opportunity.amount)",
            dependsOn: ["opportunity_created"],
            unit: "usd",
          },
        ],
      },
      seed: 42,
      outDir,
    });

    const metrics = await readFile(path.join(outDir, "metrics_daily.csv"), "utf8");
    expect(metrics).toContain("2026-01-01,pipeline_value,usd,20");
  });

  it("writes SQL inserts in dependency order when sql output is selected", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-sql-"));
    const result = await generateData({
      spec: { ...spec, outputs: { formats: ["sql", "manifest"] } },
      seed: 42,
      outDir,
    });

    expect(result.files).toEqual(["manifest.json", "seed.sql"]);
    await expect(stat(path.join(outDir, "events.jsonl"))).rejects.toThrow();
    await expect(stat(path.join(outDir, "entities", "order.csv"))).rejects.toThrow();

    const sql = await readFile(path.join(outDir, "seed.sql"), "utf8");
    expect(sql).toContain('INSERT INTO "buyer"');
    expect(sql).toContain('INSERT INTO "order"');
    expect(sql).toContain('INSERT INTO "events"');
    expect(sql).toContain('INSERT INTO "metrics_daily"');
    expect(sql.indexOf('INSERT INTO "buyer"')).toBeLessThan(sql.indexOf('INSERT INTO "order"'));
    expect(sql.indexOf('INSERT INTO "order"')).toBeLessThan(sql.indexOf('INSERT INTO "events"'));
    expect(sql).toContain("'buyer_");
  });

  it("orders SQL inserts from ref fields when relationships are omitted", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-sql-ref-"));
    const sqlSpec: SimulatorSpec = {
      ...spec,
      entities: [
        {
          name: "invoice",
          count: 1,
          fields: [
            { name: "id", type: "id" },
            { name: "user_id", type: "ref:user" },
          ],
        },
        {
          name: "user",
          count: 1,
          fields: [
            { name: "id", type: "id" },
            { name: "name", type: "string" },
          ],
        },
      ],
      relationships: undefined,
      events: [{ name: "invoice_created", sourceEntity: "invoice" }],
      metrics: [],
      outputs: { formats: ["sql"] },
    };

    await generateData({ spec: sqlSpec, seed: 42, outDir });

    const sql = await readFile(path.join(outDir, "seed.sql"), "utf8");
    expect(sql.indexOf('INSERT INTO "user"')).toBeLessThan(sql.indexOf('INSERT INTO "invoice"'));
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

  it("keeps the field-service dashboard golden outputs reproducible", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "dds-field-service-golden-"));
    const fieldServiceSpec = JSON.parse(await readFile(fieldServiceSpecPath, "utf8")) as SimulatorSpec;

    const result = await generateData({ spec: fieldServiceSpec, seed: 42, outDir });

    expect(result.files).toEqual(fieldServiceFixtureFiles);

    for (const fixtureFile of fieldServiceFixtureFiles) {
      const expected = await readFile(path.join(fieldServiceFixtureDir, fixtureFile), "utf8");
      const actual = await readFile(path.join(outDir, fixtureFile), "utf8");
      expect(actual, fixtureFile).toEqual(expected);
    }
  });
});
