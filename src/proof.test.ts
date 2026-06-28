import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateData } from "./generator.js";
import { initProject } from "./init.js";
import { generateProofReport } from "./proof.js";
import { readJson } from "./fs-utils.js";
import type { SimulatorSpec } from "./types.js";

describe("generateProofReport", () => {
  it("writes deterministic JSON and Markdown proof for generated pack data", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-proof-pack-"));
    await initProject(project, { pack: "field-service" });
    const spec = await readJson<SimulatorSpec>(path.join(project, "simulator.spec.json"));
    const dataDir = path.join(project, "demo-data");
    await generateData({ spec, seed: "field-service-demo", outDir: dataDir });

    const markdownOut = path.join(dataDir, "proof.md");
    const jsonOut = path.join(dataDir, "proof.json");
    const report = await generateProofReport({ spec, dataDir, markdownOut, jsonOut });

    expect(report.ok).toBe(true);
    expect(report.coverage.entities.find((entity) => entity.name === "work_order")).toMatchObject({
      expectedRows: 30,
      actualRows: 30,
    });
    expect(report.coverage.events.find((event) => event.name === "work_order_completed")).toMatchObject({
      expectedMinimumRows: 30,
      actualRows: 30,
    });
    expect(report.coverage.edgeCases).toContainEqual(
      expect.objectContaining({
        scenario: "overdue-work",
        target: "entity:work_order.status=overdue",
        count: expect.any(Number),
      }),
    );
    expect(report.coverage.edgeCases.every((edgeCase) => edgeCase.count > 0)).toBe(true);

    await expect(readFile(markdownOut, "utf8")).resolves.toContain("# field-service Proof Report");
    await expect(readFile(markdownOut, "utf8")).resolves.toContain("## Edge Cases");
    await expect(readJson(jsonOut)).resolves.toMatchObject({ schemaVersion: "proof.v1", ok: true });
  });

  it("fails relationship constraints when generated references are broken", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-proof-broken-"));
    await initProject(project, { pack: "field-service" });
    const spec = await readJson<SimulatorSpec>(path.join(project, "simulator.spec.json"));
    const dataDir = path.join(project, "demo-data");
    await generateData({ spec, seed: "field-service-demo", outDir: dataDir });

    const workOrdersPath = path.join(dataDir, "entities", "work_order.csv");
    const workOrders = await readFile(workOrdersPath, "utf8");
    await writeFile(workOrdersPath, workOrders.replace("customer_1", "customer_missing"), "utf8");

    const report = await generateProofReport({ spec, dataDir });

    expect(report.ok).toBe(false);
    expect(report.constraints).toContainEqual(
      expect.objectContaining({
        name: "relationship:work_order.customer_id->customer",
        ok: false,
      }),
    );
  });
});
