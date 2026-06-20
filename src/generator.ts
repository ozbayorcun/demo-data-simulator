import path from "node:path";
import { readdir, readFile, rm } from "node:fs/promises";
import type { EntitySpec, FieldSpec, SimulatorSpec } from "./types.js";
import { Rng } from "./rng.js";
import { writeJson } from "./fs-utils.js";
import { writeCsv, writeJsonl, writeSqlInserts, type SqlInsertSection } from "./writers.js";

export interface GenerateOptions {
  spec: SimulatorSpec;
  seed: string | number;
  outDir: string;
}

export interface GenerateResult {
  files: string[];
  rows: Record<string, number>;
}

export async function generateData(options: GenerateOptions): Promise<GenerateResult> {
  const spec = options.spec;
  const outDir = path.resolve(options.outDir);
  await assertSafeOutputDirectory(outDir);
  await rm(outDir, { recursive: true, force: true });

  const entityRows = new Map<string, Array<Record<string, unknown>>>();
  const writtenFiles: string[] = [];
  const rowCounts: Record<string, number> = {};
  const formats = new Set(spec.outputs.formats);
  const entitiesForOutput = orderedEntitiesForOutput(spec);

  for (const entity of entitiesForOutput) {
    const rows = generateEntityRows(spec, entity, options.seed);
    entityRows.set(entity.name, rows);
    if (formats.has("csv")) {
      const file = path.join(outDir, "entities", `${entity.name}.csv`);
      await writeCsv(file, rows);
      writtenFiles.push(path.relative(outDir, file));
      rowCounts[`entities/${entity.name}.csv`] = rows.length;
    }
  }

  const events = generateEvents(spec, entityRows, options.seed);
  const metrics = formats.has("csv") || formats.has("sql") ? generateMetrics(spec, events) : [];
  if (formats.has("jsonl")) {
    const eventsFile = path.join(outDir, "events.jsonl");
    await writeJsonl(eventsFile, events);
    writtenFiles.push(path.relative(outDir, eventsFile));
    rowCounts["events.jsonl"] = events.length;
  }

  if (formats.has("csv")) {
    const metricsFile = path.join(outDir, "metrics_daily.csv");
    await writeCsv(metricsFile, metrics);
    writtenFiles.push(path.relative(outDir, metricsFile));
    rowCounts["metrics_daily.csv"] = metrics.length;
  }

  if (formats.has("sql")) {
    const sqlSections: SqlInsertSection[] = [
      ...entitiesForOutput.map((entity) => ({
        tableName: entity.name,
        rows: entityRows.get(entity.name) ?? [],
      })),
      { tableName: "events", rows: events },
      { tableName: "metrics_daily", rows: metrics },
    ];
    const sqlFile = path.join(outDir, "seed.sql");
    await writeSqlInserts(sqlFile, sqlSections);
    writtenFiles.push(path.relative(outDir, sqlFile));
    rowCounts["seed.sql"] = sqlSections.reduce((total, section) => total + section.rows.length, 0);
  }

  if (formats.has("manifest")) {
    const manifestFile = path.join(outDir, "manifest.json");
    await writeJson(manifestFile, {
      generator: "demo-data-simulator",
      schemaVersion: spec.schemaVersion,
      seed: String(options.seed),
      domain: spec.domain,
      generatedAt: new Date(0).toISOString(),
      files: writtenFiles.sort(),
      rows: Object.fromEntries(Object.entries(rowCounts).sort(([left], [right]) => left.localeCompare(right))),
    });
    writtenFiles.push(path.relative(outDir, manifestFile));
    rowCounts["manifest.json"] = 1;
  }

  return { files: writtenFiles.sort(), rows: rowCounts };
}

function generateEntityRows(spec: SimulatorSpec, entity: EntitySpec, seed: string | number): Array<Record<string, unknown>> {
  const rng = new Rng(`${seed}:entity:${entity.name}`);
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < entity.count; index += 1) {
    const row: Record<string, unknown> = {};
    for (const field of entity.fields) {
      row[field.name] = generateFieldValue(spec, field, rng, entity.name, index, seed);
    }
    rows.push(row);
  }
  return rows;
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function titleize(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const FIRST_NAMES = ["Avery", "Jordan", "Morgan", "Riley", "Taylor", "Casey", "Quinn", "Maya"];
const LAST_NAMES = ["Patel", "Rivera", "Chen", "Morgan", "Brooks", "Singh", "Carter", "Nguyen"];
const BUSINESS_PREFIXES = ["Northstar", "Brightline", "Summit", "Harbor", "Pioneer", "Evergreen", "Metro", "Bluebird"];
const BUSINESS_NOUNS = ["Services", "Logistics", "Homes", "Partners", "Facilities", "Systems", "Works", "Group"];
const WORK_VERBS = ["Inspect", "Schedule", "Repair", "Review", "Install", "Dispatch", "Approve", "Replace"];
const DOMAIN_OBJECTS = ["request", "asset", "site", "handoff", "route", "ticket", "order", "visit"];
const DESCRIPTION_OPENERS = ["Follow up on", "Coordinate", "Validate", "Prepare", "Resolve", "Document"];
const CITIES = ["Austin", "Boston", "Chicago", "Denver", "Phoenix", "Portland", "Raleigh", "Seattle"];
const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "Central"];
const STREET_NAMES = ["Market", "Cedar", "Lake", "Maple", "Oak", "Pine", "River", "Summit"];
const STREET_TYPES = ["St", "Ave", "Blvd", "Rd", "Ln"];
const SEGMENTS = ["standard", "growth", "enterprise", "strategic", "managed"];
const ROLES = ["coordinator", "operator", "manager", "specialist", "analyst"];

function generateFieldValue(
  spec: SimulatorSpec,
  field: FieldSpec,
  rng: Rng,
  entityName: string,
  index: number,
  seed: string | number,
): unknown {
  if (field.type === "id") return `${entityName}_${index + 1}`;
  if (field.type === "string") return generateStringValue(spec, field, entityName, index, seed);
  if (field.type === "integer") return rng.integer(field.min ?? 1, field.max ?? 100);
  if (field.type === "number") return Number((rng.integer(field.min ?? 1, field.max ?? 1000) / 10).toFixed(1));
  if (field.type === "boolean") return rng.next() >= 0.5;
  if (field.type === "enum") return generateEnumValue(field, rng, index);
  if (field.type === "timestamp") return timestampFor(spec, index, rng);
  if (field.type.startsWith("ref:")) {
    const target = field.type.slice("ref:".length);
    const targetEntity = spec.entities.find((entity) => entity.name === target);
    return `${target}_${rng.integer(1, targetEntity?.count ?? 1)}`;
  }
  return "";
}

function generateStringValue(
  spec: SimulatorSpec,
  field: FieldSpec,
  entityName: string,
  index: number,
  seed: string | number,
): string {
  const fieldName = normalizedName(field.name);
  const entity = normalizedName(entityName);
  const domain = normalizedName(spec.domain);
  const localRng = new Rng(`${seed}:${spec.domain}:${entityName}:${field.name}:${index}`);

  if (fieldName === "name" || fieldName.endsWith("name")) {
    if (/(company|customer|account|vendor|supplier|merchant|brand|client)/.test(entity)) {
      return `${localRng.pick(BUSINESS_PREFIXES)} ${localRng.pick(BUSINESS_NOUNS)}`;
    }
    if (/(technician|agent|user|person|employee|owner|driver|rep|manager)/.test(entity)) {
      return `${localRng.pick(FIRST_NAMES)} ${localRng.pick(LAST_NAMES)}`;
    }
    return `${titleize(entityName)} ${index + 1}`;
  }
  if (/(title|subject|headline|task|issue|ticket|workorder|work_order)/.test(fieldName)) {
    return `${localRng.pick(WORK_VERBS)} ${localRng.pick(DOMAIN_OBJECTS)} ${index + 1}`;
  }
  if (/(description|summary|notes?|details?|comment)/.test(fieldName)) {
    return `${localRng.pick(DESCRIPTION_OPENERS)} ${domain || entity} workflow item ${index + 1}.`;
  }
  if (fieldName.includes("email")) {
    return `${slug(localRng.pick(FIRST_NAMES))}.${slug(localRng.pick(LAST_NAMES))}${index + 1}@example.test`;
  }
  if (/(phone|mobile|tel)/.test(fieldName)) {
    return `+1-555-01${String(index % 100).padStart(2, "0")}`;
  }
  if (/(url|website|link)/.test(fieldName)) {
    return `https://example.test/${slug(entityName)}/${index + 1}`;
  }
  if (fieldName.includes("city")) {
    return localRng.pick(CITIES);
  }
  if (/(state|region|territory|zone)/.test(fieldName)) {
    return localRng.pick(REGIONS);
  }
  if (/(address|street)/.test(fieldName)) {
    return `${100 + index} ${localRng.pick(STREET_NAMES)} ${localRng.pick(STREET_TYPES)}`;
  }
  if (/(category|type|segment)/.test(fieldName)) {
    return localRng.pick(SEGMENTS);
  }
  if (/(role|position)/.test(fieldName)) {
    return localRng.pick(ROLES);
  }
  if (fieldName.includes("code")) {
    return `${entityName.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`;
  }
  return `${field.name}_${index + 1}`;
}

function generateEnumValue(field: FieldSpec, rng: Rng, index: number): string {
  const values = field.values ?? ["unknown"];
  if (values.length === 0) return "unknown";
  if (/(status|state|stage|phase)/.test(normalizedName(field.name))) {
    if (index < values.length) return values[index];
    return rng.pick(values);
  }
  return rng.pick(values);
}

function generateEvents(
  spec: SimulatorSpec,
  entityRows: Map<string, Array<Record<string, unknown>>>,
  seed: string | number,
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const latestTimestampBySource = new Map<string, number>();
  for (const event of [...spec.events].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0) || left.name.localeCompare(right.name))) {
    const sourceRows = entityRows.get(event.sourceEntity) ?? [];
    const perEntity = event.countPerEntity ?? 1;
    sourceRows.forEach((sourceRow, sourceIndex) => {
      for (let eventIndex = 0; eventIndex < perEntity; eventIndex += 1) {
        const rng = new Rng(`${seed}:event:${event.name}:${sourceIndex}:${eventIndex}`);
        const sourceId = sourceRow.id ?? sourceRow[`${event.sourceEntity}_id`] ?? `${event.sourceEntity}_${sourceIndex + 1}`;
        const row: Record<string, unknown> = {
          event_id: `${event.name}_${sourceIndex + 1}_${eventIndex + 1}`,
          event_name: event.name,
          source_entity: event.sourceEntity,
          source_id: sourceId,
          occurred_at: orderedTimestampFor(
            spec,
            sourceIndex + eventIndex,
            rng,
            latestTimestampBySource,
            `${event.sourceEntity}:${sourceId}:${eventIndex}`,
          ),
        };
        for (const field of event.fields ?? []) {
          row[field.name] = generateFieldValue(spec, field, rng, event.name, sourceIndex + eventIndex, seed);
        }
        events.push(row);
      }
    });
  }
  return events.sort((left, right) => String(left.occurred_at).localeCompare(String(right.occurred_at)) || String(left.event_id).localeCompare(String(right.event_id)));
}

function orderedTimestampFor(
  spec: SimulatorSpec,
  index: number,
  rng: Rng,
  latestTimestampBySource: Map<string, number>,
  sourceKey: string,
): string {
  const timestamp = new Date(timestampFor(spec, index, rng)).getTime();
  const latestTimestamp = latestTimestampBySource.get(sourceKey);
  const orderedTimestamp = latestTimestamp === undefined ? timestamp : Math.max(timestamp, latestTimestamp + 60_000);
  latestTimestampBySource.set(sourceKey, orderedTimestamp);
  return new Date(orderedTimestamp).toISOString();
}

function generateMetrics(spec: SimulatorSpec, events: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const byDay = new Map<string, Map<string, number>>();
  for (const event of events) {
    const day = String(event.occurred_at).slice(0, 10);
    const eventName = String(event.event_name);
    const counts = byDay.get(day) ?? new Map<string, number>();
    counts.set(eventName, (counts.get(eventName) ?? 0) + 1);
    byDay.set(day, counts);
  }

  const metricRows: Array<Record<string, unknown>> = [];
  for (const day of [...byDay.keys()].sort()) {
    const counts = byDay.get(day) ?? new Map<string, number>();
    for (const [eventName, count] of [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      metricRows.push({ day, metric: `${eventName}_count`, value: count, unit: "events" });
    }
    for (const metric of spec.metrics ?? []) {
      const dependsOn = metric.dependsOn?.[0];
      const value = dependsOn ? counts.get(dependsOn) ?? 0 : events.length;
      metricRows.push({ day, metric: metric.name, value, unit: metric.unit ?? "count" });
    }
  }
  return metricRows.sort((left, right) => String(left.day).localeCompare(String(right.day)) || String(left.metric).localeCompare(String(right.metric)));
}

function timestampFor(spec: SimulatorSpec, index: number, rng: Rng): string {
  const start = new Date(`${spec.defaults?.startDate ?? "2026-01-01"}T00:00:00.000Z`);
  const days = spec.defaults?.days ?? 14;
  const day = index % days;
  const minute = rng.integer(360, 20 * 60);
  return new Date(start.getTime() + day * 86_400_000 + minute * 60_000).toISOString();
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function orderedEntitiesForOutput(spec: SimulatorSpec): EntitySpec[] {
  const entitiesByName = new Map(spec.entities.map((entity) => [entity.name, entity]));
  const dependencies = new Map<string, Set<string>>();
  for (const entity of spec.entities) dependencies.set(entity.name, new Set());
  for (const relationship of spec.relationships ?? []) {
    if (entitiesByName.has(relationship.from) && entitiesByName.has(relationship.to)) {
      dependencies.get(relationship.from)?.add(relationship.to);
    }
  }
  for (const entity of spec.entities) {
    for (const field of entity.fields) {
      if (!field.type.startsWith("ref:")) continue;
      const target = field.type.slice("ref:".length);
      if (entitiesByName.has(target)) dependencies.get(entity.name)?.add(target);
    }
  }

  const output: EntitySpec[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();

  const visit = (entityName: string): void => {
    if (permanent.has(entityName)) return;
    if (temporary.has(entityName)) return;
    temporary.add(entityName);
    for (const dependency of [...(dependencies.get(entityName) ?? [])].sort()) visit(dependency);
    temporary.delete(entityName);
    permanent.add(entityName);
    const entity = entitiesByName.get(entityName);
    if (entity) output.push(entity);
  };

  for (const entity of [...spec.entities].sort(byName)) visit(entity.name);
  return output;
}

async function assertSafeOutputDirectory(outDir: string): Promise<void> {
  const parsed = path.parse(outDir);
  const base = path.basename(outDir);
  const normalized = path.normalize(outDir);
  const cwd = path.resolve(process.cwd());

  if (normalized === parsed.root) {
    throw new Error("Refusing to generate into filesystem root.");
  }
  if (normalized === cwd) {
    throw new Error("Refusing to generate into the current working directory. Use a child directory like demo-data.");
  }
  if (base === "." || base === ".." || base === "") {
    throw new Error("Output directory must be a named child directory.");
  }
  if (await isUnsafeNonEmptyDirectory(normalized)) {
    throw new Error("Refusing to overwrite a non-empty directory that was not generated by demo-data-simulator.");
  }
}

async function isUnsafeNonEmptyDirectory(outDir: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch (error) {
    return !isMissingPathError(error);
  }
  if (entries.length === 0) return false;

  try {
    const manifest = JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8")) as { generator?: unknown };
    return manifest.generator !== "demo-data-simulator";
  } catch {
    return true;
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}
