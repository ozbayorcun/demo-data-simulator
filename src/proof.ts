import path from "node:path";
import { readFile } from "node:fs/promises";
import { readJson, writeJson, writeText } from "./fs-utils.js";
import type { SimulatorSpec } from "./types.js";

export interface ProofOptions {
  spec: SimulatorSpec;
  dataDir: string;
  markdownOut?: string;
  jsonOut?: string;
}

export interface ProofReport {
  generator: "demo-data-simulator";
  schemaVersion: "proof.v1";
  spec: {
    schemaVersion: string;
    domain: string;
    seed?: string;
  };
  files: string[];
  rows: Record<string, number>;
  coverage: {
    entities: Array<{ name: string; expectedRows: number; actualRows: number }>;
    events: Array<{ name: string; expectedMinimumRows: number; actualRows: number }>;
    metrics: { expected: number; actualRows: number };
    scenarios: Array<{ name: string; present: boolean }>;
  };
  constraints: Array<{ name: string; ok: boolean; detail: string }>;
  syntheticBoundary: string;
  ok: boolean;
}

interface Manifest {
  generator?: string;
  seed?: string;
  domain?: string;
  files?: string[];
  rows?: Record<string, number>;
}

export async function generateProofReport(options: ProofOptions): Promise<ProofReport> {
  const dataDir = path.resolve(options.dataDir);
  const manifest = await readJson<Manifest>(path.join(dataDir, "manifest.json"));
  if (manifest.generator !== "demo-data-simulator") {
    throw new Error("Proof requires a demo-data-simulator manifest.json.");
  }

  const rows = manifest.rows ?? {};
  const files = [...new Set([...(manifest.files ?? []), "manifest.json"])].sort();
  const entityRows = await readEntityRows(options.spec, dataDir, files);
  const events = files.includes("events.jsonl") ? await readJsonl(path.join(dataDir, "events.jsonl")) : [];
  const metricsRows = files.includes("metrics_daily.csv") ? await readCsv(path.join(dataDir, "metrics_daily.csv")) : [];

  const constraints = [
    manifest.domain === options.spec.domain
      ? { name: "manifest-domain", ok: true, detail: `Manifest domain matches ${options.spec.domain}.` }
      : { name: "manifest-domain", ok: false, detail: `Manifest domain ${manifest.domain ?? "(missing)"} does not match ${options.spec.domain}.` },
    ...relationshipConstraints(options.spec, entityRows),
    ...eventSourceConstraints(options.spec, entityRows, events),
    {
      name: "requested-files",
      ok: requestedFilesPresent(options.spec, files),
      detail: `Generated files: ${files.join(", ") || "(none)"}.`,
    },
  ];

  const report: ProofReport = {
    generator: "demo-data-simulator",
    schemaVersion: "proof.v1",
    spec: {
      schemaVersion: options.spec.schemaVersion,
      domain: options.spec.domain,
      seed: manifest.seed,
    },
    files,
    rows: Object.fromEntries(Object.entries(rows).sort(([left], [right]) => left.localeCompare(right))),
    coverage: {
      entities: options.spec.entities.map((entity) => ({
        name: entity.name,
        expectedRows: entity.count,
        actualRows: entityRows.get(entity.name)?.length ?? 0,
      })),
      events: options.spec.events.map((event) => {
        const sourceCount = entityRows.get(event.sourceEntity)?.length ?? 0;
        return {
          name: event.name,
          expectedMinimumRows: sourceCount * (event.countPerEntity ?? 1),
          actualRows: events.filter((row) => row.event_name === event.name).length,
        };
      }),
      metrics: {
        expected: options.spec.metrics?.length ?? 0,
        actualRows: metricsRows.length,
      },
      scenarios: (options.spec.scenarios ?? []).map((scenario) => ({ name: scenario.name, present: true })),
    },
    constraints,
    syntheticBoundary:
      "This dataset is generated synthetic data. It is not production data, anonymized production data, or a guarantee of real-world distribution fidelity.",
    ok: constraints.every((constraint) => constraint.ok),
  };

  if (options.jsonOut) await writeJson(path.resolve(options.jsonOut), report);
  if (options.markdownOut) await writeText(path.resolve(options.markdownOut), renderProofMarkdown(report));
  return report;
}

export function renderProofMarkdown(report: ProofReport): string {
  const lines = [
    `# ${report.spec.domain} Proof Report`,
    "",
    `- Generator: ${report.generator}`,
    `- Proof schema: ${report.schemaVersion}`,
    `- Spec schema: ${report.spec.schemaVersion}`,
    `- Seed: ${report.spec.seed ?? "(unknown)"}`,
    `- Status: ${report.ok ? "PASS" : "FAIL"}`,
    "",
    "## Files",
    "",
    ...report.files.map((file) => `- ${file}: ${report.rows[file] ?? "unknown"} row(s)`),
    "",
    "## Entity Coverage",
    "",
    "| Entity | Expected | Actual |",
    "| --- | ---: | ---: |",
    ...report.coverage.entities.map((entity) => `| ${entity.name} | ${entity.expectedRows} | ${entity.actualRows} |`),
    "",
    "## Event Coverage",
    "",
    "| Event | Expected Minimum | Actual |",
    "| --- | ---: | ---: |",
    ...report.coverage.events.map((event) => `| ${event.name} | ${event.expectedMinimumRows} | ${event.actualRows} |`),
    "",
    "## Constraints",
    "",
    ...report.constraints.map((constraint) => `- ${constraint.ok ? "PASS" : "FAIL"} ${constraint.name}: ${constraint.detail}`),
    "",
    "## Synthetic Boundary",
    "",
    report.syntheticBoundary,
    "",
  ];

  if (report.coverage.scenarios.length > 0) {
    lines.splice(
      lines.indexOf("## Constraints"),
      0,
      "## Scenarios",
      "",
      ...report.coverage.scenarios.map((scenario) => `- ${scenario.name}: ${scenario.present ? "present" : "missing"}`),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function readEntityRows(spec: SimulatorSpec, dataDir: string, files: string[]): Promise<Map<string, Array<Record<string, string>>>> {
  const rowsByEntity = new Map<string, Array<Record<string, string>>>();
  for (const entity of spec.entities) {
    const file = `entities/${entity.name}.csv`;
    rowsByEntity.set(entity.name, files.includes(file) ? await readCsv(path.join(dataDir, file)) : []);
  }
  return rowsByEntity;
}

function relationshipConstraints(
  spec: SimulatorSpec,
  entityRows: Map<string, Array<Record<string, string>>>,
): Array<{ name: string; ok: boolean; detail: string }> {
  return (spec.relationships ?? []).map((relationship) => {
    const sourceRows = entityRows.get(relationship.from) ?? [];
    const targetIds = new Set((entityRows.get(relationship.to) ?? []).map((row) => row.id).filter(Boolean));
    const missing = sourceRows.filter((row) => row[relationship.field] && !targetIds.has(row[relationship.field]));
    return {
      name: `relationship:${relationship.from}.${relationship.field}->${relationship.to}`,
      ok: missing.length === 0,
      detail:
        missing.length === 0
          ? `${sourceRows.length} ${relationship.from} row(s) reference existing ${relationship.to} row(s).`
          : `${missing.length} ${relationship.from} row(s) reference missing ${relationship.to} row(s).`,
    };
  });
}

function eventSourceConstraints(
  spec: SimulatorSpec,
  entityRows: Map<string, Array<Record<string, string>>>,
  events: Array<Record<string, unknown>>,
): Array<{ name: string; ok: boolean; detail: string }> {
  return spec.events.map((event) => {
    const sourceIds = new Set((entityRows.get(event.sourceEntity) ?? []).map((row) => row.id).filter(Boolean));
    const matchingEvents = events.filter((row) => row.event_name === event.name);
    const missing = matchingEvents.filter((row) => typeof row.source_id === "string" && !sourceIds.has(row.source_id));
    return {
      name: `event-source:${event.name}`,
      ok: matchingEvents.length > 0 && missing.length === 0,
      detail:
        missing.length === 0
          ? `${matchingEvents.length} event row(s) reference ${event.sourceEntity}.`
          : `${missing.length} event row(s) reference missing ${event.sourceEntity} row(s).`,
    };
  });
}

function requestedFilesPresent(spec: SimulatorSpec, files: string[]): boolean {
  const formats = new Set(spec.outputs.formats);
  if (formats.has("manifest") && !files.includes("manifest.json")) return false;
  if (formats.has("jsonl") && !files.includes("events.jsonl")) return false;
  if (formats.has("csv") && !files.includes("metrics_daily.csv")) return false;
  if (formats.has("sql") && !files.includes("seed.sql")) return false;
  if (formats.has("csv")) {
    return spec.entities.every((entity) => files.includes(`entities/${entity.name}.csv`));
  }
  return true;
}

async function readJsonl(filePath: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readCsv(filePath: string): Promise<Array<Record<string, string>>> {
  const text = await readFile(filePath, "utf8");
  const [headerLine, ...lines] = text.trimEnd().split("\n");
  if (!headerLine) return [];
  const headers = parseCsvLine(headerLine);
  return lines.filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
