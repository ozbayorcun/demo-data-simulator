import { describe, expect, it } from "vitest";
import { diffProofReports, renderProofDiff } from "./proof-diff.js";
import type { ProofReport } from "./proof.js";

const report: ProofReport = {
  generator: "demo-data-simulator",
  schemaVersion: "proof.v1",
  spec: {
    schemaVersion: "simulator.v1",
    domain: "field-service",
    seed: "demo",
  },
  files: ["entities/work_order.csv", "events.jsonl", "manifest.json"],
  rows: {
    "entities/work_order.csv": 30,
    "events.jsonl": 30,
    "manifest.json": 1,
  },
  coverage: {
    entities: [{ name: "work_order", expectedRows: 30, actualRows: 30 }],
    events: [{ name: "work_order_completed", expectedMinimumRows: 30, actualRows: 30 }],
    metrics: { expected: 1, actualRows: 14 },
    scenarios: [{ name: "overdue-work", present: true }],
    edgeCases: [
      {
        scenario: "overdue-work",
        target: "entity:work_order.status=overdue",
        count: 5,
        detail: "Detected 5 supporting row(s) or event(s).",
      },
    ],
  },
  constraints: [{ name: "manifest-domain", ok: true, detail: "Manifest domain matches field-service." }],
  syntheticBoundary: "Synthetic data.",
  ok: true,
};

describe("diffProofReports", () => {
  it("passes identical reports", () => {
    const diff = diffProofReports(report, structuredClone(report));

    expect(diff.ok).toBe(true);
    expect(diff.entries).toEqual([]);
    expect(renderProofDiff(diff)).toBe("Proof reports match.");
  });

  it("reports deterministic row and status drift", () => {
    const candidate = structuredClone(report);
    candidate.ok = false;
    candidate.rows["events.jsonl"] = 29;

    const diff = diffProofReports(report, candidate);

    expect(diff.ok).toBe(false);
    expect(diff.entries.map((entry) => entry.path)).toEqual(["ok", "rows"]);
    expect(renderProofDiff(diff)).toContain("Proof reports differ:");
  });

  it("reports scenario edge-case coverage drift by scenario and target", () => {
    const candidate = structuredClone(report);
    candidate.coverage.edgeCases[0].count = 0;

    const diff = diffProofReports(report, candidate);

    expect(diff.ok).toBe(false);
    expect(diff.entries).toContainEqual(
      expect.objectContaining({
        path: "coverage.edgeCases.overdue-work:entity:work_order.status=overdue",
      }),
    );
  });
});
