import type { ProofReport } from "./proof.js";

export interface ProofDiffEntry {
  path: string;
  baseline: unknown;
  candidate: unknown;
}

export interface ProofDiff {
  ok: boolean;
  entries: ProofDiffEntry[];
}

export function diffProofReports(baseline: ProofReport, candidate: ProofReport): ProofDiff {
  const entries: ProofDiffEntry[] = [];
  compare(entries, "ok", baseline.ok, candidate.ok);
  compare(entries, "spec.domain", baseline.spec.domain, candidate.spec.domain);
  compare(entries, "spec.seed", baseline.spec.seed, candidate.spec.seed);
  compare(entries, "files", baseline.files, candidate.files);
  compare(entries, "rows", baseline.rows, candidate.rows);
  compareNamed(entries, "constraints", baseline.constraints, candidate.constraints, (constraint) => constraint.name);
  compareNamed(entries, "coverage.entities", baseline.coverage.entities, candidate.coverage.entities, (entity) => entity.name);
  compareNamed(entries, "coverage.events", baseline.coverage.events, candidate.coverage.events, (event) => event.name);
  compare(entries, "coverage.metrics", baseline.coverage.metrics, candidate.coverage.metrics);
  compareNamed(entries, "coverage.scenarios", baseline.coverage.scenarios, candidate.coverage.scenarios, (scenario) => scenario.name);
  compareNamed(
    entries,
    "coverage.edgeCases",
    baseline.coverage.edgeCases,
    candidate.coverage.edgeCases,
    (edgeCase) => `${edgeCase.scenario}:${edgeCase.target}`,
  );

  return { ok: entries.length === 0, entries };
}

export function renderProofDiff(diff: ProofDiff): string {
  if (diff.ok) return "Proof reports match.";
  const lines = ["Proof reports differ:"];
  for (const entry of diff.entries) {
    lines.push(`- ${entry.path}: ${stableStringify(entry.baseline)} -> ${stableStringify(entry.candidate)}`);
  }
  return lines.join("\n");
}

function compare(entries: ProofDiffEntry[], path: string, baseline: unknown, candidate: unknown): void {
  if (stableStringify(baseline) !== stableStringify(candidate)) {
    entries.push({ path, baseline, candidate });
  }
}

function compareNamed<T>(
  entries: ProofDiffEntry[],
  path: string,
  baseline: T[],
  candidate: T[],
  keyFor: (value: T) => string,
): void {
  const baselineMap = new Map(baseline.map((value) => [keyFor(value), value]));
  const candidateMap = new Map(candidate.map((value) => [keyFor(value), value]));
  const keys = [...new Set([...baselineMap.keys(), ...candidateMap.keys()])].sort();
  for (const key of keys) {
    compare(entries, `${path}.${key}`, baselineMap.get(key), candidateMap.get(key));
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJson(nested)]),
  );
}
