import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeCsv(filePath: string, rows: Array<Record<string, unknown>>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const headers = stableHeaders(rows);
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  await writeFile(filePath, `${headers.join(",")}\n${body.join("\n")}${body.length ? "\n" : ""}`, "utf8");
}

export async function writeJsonl(filePath: string, rows: Array<Record<string, unknown>>): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(sortObject(row))).join("\n")}\n`, "utf8");
}

export function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function stableHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) headers.add(key);
  }
  return [...headers].sort((left, right) => left.localeCompare(right));
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

