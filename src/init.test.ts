import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "./init.js";
import { validateSpec } from "./spec.js";
import type { SimulatorSpec } from "./types.js";

describe("initProject", () => {
  it("keeps the default template init behavior", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-default-"));

    const written = await initProject(project);
    const spec = JSON.parse(await readFile(path.join(project, "simulator.spec.json"), "utf8")) as SimulatorSpec;

    expect(written.map((file) => path.basename(file)).sort()).toEqual([
      "demo-data-simulator.config.json",
      "simulator.spec.json",
    ]);
    expect(spec.domain).toBe("sample-workflow");
    expect(validateSpec(spec).ok).toBe(true);
  });

  it("writes a valid built-in scenario pack spec", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-pack-"));

    await initProject(project, { pack: "field-service" });
    const spec = JSON.parse(await readFile(path.join(project, "simulator.spec.json"), "utf8")) as SimulatorSpec;

    expect(spec.domain).toBe("field-service");
    expect(spec.entities.map((entity) => entity.name)).toEqual(["customer", "technician", "work_order"]);
    expect(validateSpec(spec).ok).toBe(true);
  });

  it("writes a valid sales pipeline scenario pack spec", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-sales-pack-"));

    await initProject(project, { pack: "sales-pipeline" });
    const spec = JSON.parse(await readFile(path.join(project, "simulator.spec.json"), "utf8")) as SimulatorSpec;

    expect(spec.domain).toBe("sales-pipeline");
    expect(spec.entities.map((entity) => entity.name)).toEqual(["account", "sales_rep", "opportunity"]);
    expect(spec.scenarios?.map((scenario) => scenario.name)).toContain("stalled-enterprise-deal");
    expect(validateSpec(spec).ok).toBe(true);
  });

  it("rejects unknown scenario packs with the available pack ids", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-unknown-pack-"));

    await expect(initProject(project, { pack: "retail-ops" })).rejects.toThrow(
      'Unknown scenario pack "retail-ops". Available packs: field-service, sales-pipeline',
    );
  });
});
