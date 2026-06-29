import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initProject } from "./init.js";
import { getScenarioPack, listScenarioPacks } from "./packs.js";
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

  it("writes a valid recruiting pipeline scenario pack spec", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-recruiting-pack-"));

    await initProject(project, { pack: "recruiting-pipeline" });
    const spec = JSON.parse(await readFile(path.join(project, "simulator.spec.json"), "utf8")) as SimulatorSpec;

    expect(spec.domain).toBe("recruiting-pipeline");
    expect(spec.entities.map((entity) => entity.name)).toEqual(["candidate", "job", "recruiter", "application"]);
    expect(spec.scenarios?.map((scenario) => scenario.name)).toContain("fast-track-candidate");
    expect(validateSpec(spec).ok).toBe(true);
  });

  it("rejects unknown scenario packs with the available pack ids", async () => {
    const project = await mkdtemp(path.join(os.tmpdir(), "dds-init-unknown-pack-"));

    await expect(initProject(project, { pack: "retail-ops" })).rejects.toThrow(
      'Unknown scenario pack "retail-ops". Available packs: field-service, recruiting-pipeline, sales-pipeline',
    );
  });

  it("lists scenario packs in deterministic authoring order", () => {
    expect(listScenarioPacks()).toEqual([
      {
        id: "field-service",
        description: "Work orders move from customer request to technician completion.",
      },
      {
        id: "recruiting-pipeline",
        description: "Candidates move through applications, interviews, offers, and hiring outcomes.",
      },
      {
        id: "sales-pipeline",
        description: "Opportunities move from lead capture through stage changes, expansion, and close outcomes.",
      },
    ]);
  });

  it("returns cloned scenario pack specs for authoring edits", () => {
    const first = getScenarioPack("sales-pipeline");
    const second = getScenarioPack("sales-pipeline");

    expect(first?.spec.domain).toBe("sales-pipeline");
    first?.spec.entities.push({ name: "scratch", count: 1, fields: [{ name: "id", type: "id" }] });
    expect(second?.spec.entities.map((entity) => entity.name)).toEqual(["account", "sales_rep", "opportunity"]);
  });
});
