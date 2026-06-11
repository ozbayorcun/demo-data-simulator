import type { EventSpec, SimulatorSpec } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function normalizeSpec(spec: SimulatorSpec): SimulatorSpec {
  const relationships = spec.relationships ?? [];
  return {
    ...spec,
    entities: spec.entities.map((entity) => ({
      ...entity,
      fields: entity.fields.map((field) => {
        const fieldType = String(field.type);
        if (fieldType === "string" && field.name.toLowerCase() === "id") {
          return { ...field, type: "id" };
        }
        if (fieldType === "datetime" || fieldType === "date") {
          return { ...field, type: "timestamp" };
        }
        if (fieldType === "foreign_key" || fieldType === "reference" || fieldType === "ref") {
          const relationship = relationships.find(
            (candidate) => candidate.from === entity.name && candidate.field === field.name,
          );
          return { ...field, type: relationship ? `ref:${relationship.to}` : "string" };
        }
        return field;
      }),
    })),
    events: spec.events.map((event) => ({
      ...event,
      fields: event.fields?.map((field) => {
        const fieldType = String(field.type);
        if (fieldType === "datetime" || fieldType === "date") {
          return { ...field, type: "timestamp" };
        }
        if (fieldType === "foreign_key" || fieldType === "reference" || fieldType === "ref") {
          const relationship = relationships.find(
            (candidate) => candidate.from === event.sourceEntity && candidate.field === field.name,
          );
          return { ...field, type: relationship ? `ref:${relationship.to}` : "string" };
        }
        return field;
      }),
    })),
  };
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

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
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
      if (typeof field.type === "string" && field.type.startsWith("ref:")) {
        const target = field.type.slice("ref:".length);
        if (!entityNames.has(target)) {
          warnings.push(`Entity ${entity.name}.${field.name} references ${target}; target is validated after all entities are read.`);
        }
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

  for (const format of spec.outputs?.formats ?? []) {
    if (!["csv", "jsonl", "manifest"].includes(format)) {
      errors.push(`Unsupported output format ${String(format)}.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
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
