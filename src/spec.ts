import type { EventSpec, FieldSpec, FieldType, SimulatorSpec } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function normalizeSpec(spec: SimulatorSpec): SimulatorSpec {
  const relationships = spec.relationships ?? [];
  const eventNames = new Set(spec.events.map((event) => event.name));
  return {
    ...spec,
    metrics: spec.metrics?.map((metric) => ({
      ...metric,
      dependsOn: metric.dependsOn?.filter((dependency) => eventNames.has(dependency)),
    })),
    entities: spec.entities.map((entity) => {
      const hasExplicitId = entity.fields.some((field) => field.name.toLowerCase() === "id");
      const primaryIdField = hasExplicitId
        ? undefined
        : entity.fields.find((field) => String(field.type) === "uuid" && /id$/i.test(field.name))?.name;
      const fields = entity.fields.length > 0 && !hasExplicitId && !primaryIdField
        ? [{ name: "id", type: "id" as const, required: true, description: "Synthetic simulator identifier." }, ...entity.fields]
        : entity.fields;

      return {
        ...entity,
        fields: fields.map((field) => normalizeField(field, relationships, entity.name, primaryIdField)),
      };
    }),
    events: spec.events.map((event) => ({
      ...event,
      dependsOn: event.dependsOn?.filter((dependency) => eventNames.has(dependency)),
      fields: event.fields?.map((field) => normalizeField(field, relationships, event.sourceEntity)),
    })),
  };
}

function normalizeField(
  rawField: FieldSpec,
  relationships: NonNullable<SimulatorSpec["relationships"]>,
  sourceEntity: string,
  primaryIdField?: string,
): FieldSpec {
  const field = cleanField(rawField);
  const lowerFieldType = normalizedTypeName(field.type);

  if (
    (lowerFieldType === "id" || lowerFieldType === "string" || lowerFieldType === "uuid") &&
    (field.name.toLowerCase() === "id" || field.name === primaryIdField)
  ) {
    return { ...field, type: "id" };
  }
  if (["string", "integer", "number", "boolean", "enum"].includes(lowerFieldType)) {
    return { ...field, type: lowerFieldType as FieldType };
  }
  if (lowerFieldType === "timestamp" || lowerFieldType === "datetime" || lowerFieldType === "date") {
    return { ...field, type: "timestamp" };
  }
  if (lowerFieldType === "array_foreign_key" || lowerFieldType === "array_reference") {
    return { ...field, type: "string" };
  }
  if (lowerFieldType === "foreign_key" || lowerFieldType === "reference" || lowerFieldType === "ref") {
    const relationship = relationships.find(
      (candidate) => candidate.from === sourceEntity && candidate.field === field.name,
    );
    return { ...field, type: relationship ? `ref:${relationship.to}` : "string" };
  }
  if (lowerFieldType === "uuid" && /id$/i.test(field.name)) {
    const relationship = relationships.find(
      (candidate) => candidate.from === sourceEntity && candidate.field === field.name,
    );
    return { ...field, type: relationship ? `ref:${relationship.to}` : "string" };
  }
  if (lowerFieldType.startsWith("array_") || lowerFieldType.startsWith("array<") || lowerFieldType.endsWith("_array")) {
    return { ...field, type: "string" };
  }
  if (isStringLikeType(lowerFieldType)) {
    return { ...field, type: "string" };
  }
  return field;
}

function isStringLikeType(lowerFieldType: string): boolean {
  return [
    "email",
    "url",
    "text",
    "json",
    "version",
    "semver",
    "semver_or_current",
    "currency",
    "date_string",
    "url_path",
    "uuid",
    "person_name",
    "company_name",
    "task_title",
    "paragraph",
  ].includes(lowerFieldType);
}

function cleanField(field: FieldSpec): FieldSpec {
  const cleaned: FieldSpec & { min?: number | null; max?: number | null; values?: string[] | null } = { ...field };
  if (cleaned.min === null) delete cleaned.min;
  if (cleaned.max === null) delete cleaned.max;
  if (cleaned.values === null) delete cleaned.values;
  return cleaned;
}

function normalizedTypeName(value: unknown): string {
  return String(value)
    .toLowerCase()
    .replace(/\s*\|\s*null$/, "")
    .replace(/_optional$/, "")
    .replace(/_nullable$/, "")
    .replace(/ optional$/, "")
    .replace(/ nullable$/, "");
}

export function validateSpec(value: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, errors: ["Spec must be a JSON object."], warnings };
  }

  const spec = value as Partial<SimulatorSpec>;
  if (spec.schemaVersion !== "simulator.v1") {
    errors.push("schemaVersion must be simulator.v1.");
  }
  if (!isNonEmptyString(spec.domain)) {
    errors.push("domain is required.");
  }
  if (!Array.isArray(spec.entities) || spec.entities.length === 0) {
    errors.push("entities must contain at least one entity.");
  }
  if (!Array.isArray(spec.events) || spec.events.length === 0) {
    errors.push("events must contain at least one event.");
  }
  if (!spec.outputs || !Array.isArray(spec.outputs.formats)) {
    errors.push("outputs.formats is required.");
  }
  if (spec.defaults?.days !== undefined && (!Number.isInteger(spec.defaults.days) || spec.defaults.days < 1)) {
    errors.push("defaults.days must be an integer >= 1.");
  }
  if (spec.defaults?.startDate !== undefined && !isValidDateString(spec.defaults.startDate)) {
    errors.push("defaults.startDate must be a parseable date string.");
  }

  const entityNames = new Set<string>();
  for (const entity of spec.entities ?? []) {
    if (!isNonEmptyString(entity.name)) {
      errors.push("Every entity needs a name.");
      continue;
    }
    if (entityNames.has(entity.name)) {
      errors.push(`Duplicate entity: ${entity.name}.`);
    }
    entityNames.add(entity.name);
    if (!Number.isInteger(entity.count) || entity.count < 1) {
      errors.push(`Entity ${entity.name} needs count >= 1.`);
    }
    if (!Array.isArray(entity.fields) || entity.fields.length === 0) {
      errors.push(`Entity ${entity.name} needs fields.`);
      continue;
    }
    const fieldNames = new Set<string>();
    let hasId = false;
    for (const field of entity.fields) {
      if (!isNonEmptyString(field.name)) {
        errors.push(`Entity ${entity.name} has a field without a name.`);
        continue;
      }
      if (fieldNames.has(field.name)) {
        errors.push(`Entity ${entity.name} has duplicate field ${field.name}.`);
      }
      fieldNames.add(field.name);
      if (field.type === "id") hasId = true;
      if (!isValidFieldType(field.type)) {
        errors.push(`Entity ${entity.name}.${field.name} has unsupported type ${String(field.type)}.`);
      }
      if (field.type === "enum" && (!Array.isArray(field.values) || field.values.length === 0)) {
        errors.push(`Entity ${entity.name}.${field.name} enum needs values.`);
      }
      if (field.min !== undefined && typeof field.min !== "number") {
        errors.push(`Entity ${entity.name}.${field.name} min must be a number.`);
      }
      if (field.max !== undefined && typeof field.max !== "number") {
        errors.push(`Entity ${entity.name}.${field.name} max must be a number.`);
      }
      if (typeof field.min === "number" && typeof field.max === "number" && field.min > field.max) {
        errors.push(`Entity ${entity.name}.${field.name} min must be <= max.`);
      }
    }
    if (!hasId) {
      errors.push(`Entity ${entity.name} needs one id field.`);
    }
  }

  for (const entity of spec.entities ?? []) {
    for (const field of entity.fields ?? []) {
      if (typeof field.type === "string" && field.type.startsWith("ref:")) {
        const target = field.type.slice("ref:".length);
        if (!entityNames.has(target)) {
          errors.push(`Entity ${entity.name}.${field.name} references missing entity ${target}.`);
        }
      }
    }
  }

  for (const relationship of spec.relationships ?? []) {
    if (!entityNames.has(relationship.from)) errors.push(`Relationship from missing entity ${relationship.from}.`);
    if (!entityNames.has(relationship.to)) errors.push(`Relationship to missing entity ${relationship.to}.`);
    if (!isNonEmptyString(relationship.field)) errors.push("Relationship field is required.");
  }

  const eventNames = new Set<string>();
  for (const event of spec.events ?? []) {
    if (!isNonEmptyString(event.name)) {
      errors.push("Every event needs a name.");
      continue;
    }
    if (eventNames.has(event.name)) errors.push(`Duplicate event: ${event.name}.`);
    eventNames.add(event.name);
    if (!entityNames.has(event.sourceEntity)) {
      errors.push(`Event ${event.name} sourceEntity ${event.sourceEntity} does not exist.`);
    }
    if (event.countPerEntity !== undefined && (!Number.isInteger(event.countPerEntity) || event.countPerEntity < 1)) {
      errors.push(`Event ${event.name} countPerEntity must be >= 1.`);
    }
  }
  errors.push(...validateEventDag(spec.events ?? []));

  for (const metric of spec.metrics ?? []) {
    if (!isNonEmptyString(metric.name)) errors.push("Every metric needs a name.");
    if (!isNonEmptyString(metric.expression)) errors.push(`Metric ${metric.name} needs an expression.`);
    for (const dependency of metric.dependsOn ?? []) {
      if (!eventNames.has(dependency)) {
        errors.push(`Metric ${metric.name} depends on missing event ${dependency}.`);
      }
    }
  }

  errors.push(...validateScenarios(spec as Partial<SimulatorSpec>, entityNames, eventNames));

  for (const format of spec.outputs?.formats ?? []) {
    if (!["csv", "jsonl", "manifest", "sql"].includes(format)) {
      errors.push(`Unsupported output format ${String(format)}.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function validateScenarios(
  spec: Partial<SimulatorSpec>,
  entityNames: Set<string>,
  eventNames: Set<string>,
): string[] {
  const errors: string[] = [];
  const scenarioNames = new Set<string>();
  const metricNames = new Set((spec.metrics ?? []).map((metric) => metric.name).filter(isNonEmptyString));

  for (const scenario of spec.scenarios ?? []) {
    if (!isNonEmptyString(scenario.name)) {
      errors.push("Every scenario needs a name.");
      continue;
    }
    if (scenarioNames.has(scenario.name)) errors.push(`Duplicate scenario: ${scenario.name}.`);
    scenarioNames.add(scenario.name);

    const startsOnDay = scenario.startsOnDay;
    const endsOnDay = scenario.endsOnDay;
    if (startsOnDay !== undefined && (!Number.isInteger(startsOnDay) || startsOnDay < 1)) {
      errors.push(`Scenario ${scenario.name} startsOnDay must be an integer >= 1.`);
    }
    if (endsOnDay !== undefined && (!Number.isInteger(endsOnDay) || endsOnDay < 1)) {
      errors.push(`Scenario ${scenario.name} endsOnDay must be an integer >= 1.`);
    }
    if (
      typeof startsOnDay === "number" &&
      typeof endsOnDay === "number" &&
      Number.isInteger(startsOnDay) &&
      Number.isInteger(endsOnDay) &&
      startsOnDay > endsOnDay
    ) {
      errors.push(`Scenario ${scenario.name} startsOnDay must be <= endsOnDay.`);
    }
    if (
      typeof endsOnDay === "number" &&
      Number.isInteger(endsOnDay) &&
      spec.defaults?.days !== undefined &&
      endsOnDay > spec.defaults.days
    ) {
      errors.push(`Scenario ${scenario.name} endsOnDay must be <= defaults.days (${spec.defaults.days}).`);
    }

    for (const effect of scenario.effects ?? []) {
      if (!isNonEmptyString(effect.target)) {
        errors.push(`Scenario ${scenario.name} has an effect without a target.`);
      } else {
        errors.push(...validateScenarioEffectTarget(scenario.name, effect.target, spec, entityNames, eventNames));
      }
      if (effect.metric !== undefined && !metricNames.has(effect.metric)) {
        errors.push(`Scenario ${scenario.name} effect references missing metric ${effect.metric}.`);
      }
      if (effect.multiplier !== undefined && (typeof effect.multiplier !== "number" || effect.multiplier <= 0)) {
        errors.push(`Scenario ${scenario.name} effect multiplier must be a positive number.`);
      }
    }
  }

  return errors;
}

function validateScenarioEffectTarget(
  scenarioName: string,
  target: string,
  spec: Partial<SimulatorSpec>,
  entityNames: Set<string>,
  eventNames: Set<string>,
): string[] {
  if (target.startsWith("event:")) {
    const eventName = target.slice("event:".length);
    return eventNames.has(eventName) ? [] : [`Scenario ${scenarioName} effect references missing event ${eventName}.`];
  }

  const entityMatch = /^entity:([^.]+)\.([^=]+)=(.+)$/.exec(target);
  if (!entityMatch) {
    return [`Scenario ${scenarioName} effect target ${target} must use event:<name> or entity:<entity>.<field>=<value>.`];
  }

  const [, entityName, fieldName, expectedValue] = entityMatch;
  if (!entityNames.has(entityName)) {
    return [`Scenario ${scenarioName} effect references missing entity ${entityName}.`];
  }

  const entity = spec.entities?.find((candidate) => candidate.name === entityName);
  const field = entity?.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    return [`Scenario ${scenarioName} effect references missing field ${entityName}.${fieldName}.`];
  }
  if (field.type === "enum" && field.values && !field.values.includes(expectedValue)) {
    return [`Scenario ${scenarioName} effect references unsupported enum value ${entityName}.${fieldName}=${expectedValue}.`];
  }
  return [];
}

function isValidDateString(value: string): boolean {
  const candidate = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  return !Number.isNaN(new Date(candidate).getTime());
}

function validateEventDag(events: EventSpec[]): string[] {
  const errors: string[] = [];
  const eventNames = new Set(events.map((event) => event.name));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      errors.push(`Event dependency cycle includes ${name}.`);
      return;
    }
    visiting.add(name);
    const event = events.find((candidate) => candidate.name === name);
    for (const dependency of event?.dependsOn ?? []) {
      if (!eventNames.has(dependency)) {
        errors.push(`Event ${name} depends on missing event ${dependency}.`);
      } else {
        visit(dependency);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const event of events) visit(event.name);
  return errors;
}

function isValidFieldType(value: unknown): boolean {
  return (
    value === "id" ||
    value === "string" ||
    value === "integer" ||
    value === "number" ||
    value === "boolean" ||
    value === "timestamp" ||
    value === "enum" ||
    (typeof value === "string" && value.startsWith("ref:") && value.length > 4)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
