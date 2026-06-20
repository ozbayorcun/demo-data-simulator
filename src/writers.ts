import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SqlInsertSection {
  tableName: string;
  rows: Array<Record<string, unknown>>;
}

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

export async function writeSqlInserts(filePath: string, sections: SqlInsertSection[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const body = sections
    .map((section) => sqlSection(section))
    .filter((section) => section.length > 0)
    .join("\n\n");
  await writeFile(filePath, `${body}${body.length ? "\n" : ""}`, "utf8");
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

function sqlSection(section: SqlInsertSection): string {
  if (section.rows.length === 0) return `-- No rows for ${sqlIdentifier(section.tableName)}.`;
  const headers = stableHeaders(section.rows);
  const columns = headers.map(sqlIdentifier).join(", ");
  return section.rows
    .map((row) => {
      const values = headers.map((header) => sqlValue(row[header])).join(", ");
      return `INSERT INTO ${sqlIdentifier(section.tableName)} (${columns}) VALUES (${values});`;
    })
    .join("\n");
}

function sqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function sqlValue(value: unknown): string {
  if (value === undefined || value === null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}
