export const inferenceEnvelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "status", "brief", "confidence", "evidence", "assumptions", "questions", "spec", "error"],
  properties: {
    schemaVersion: { type: "string", const: "inference.v1" },
    status: { type: "string", enum: ["ok", "needs_decision", "error"] },
    brief: { type: ["string", "null"] },
    confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
    evidence: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claim", "files"],
        properties: {
          claim: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
    assumptions: { type: ["array", "null"], items: { type: "string" } },
    questions: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "default"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          default: { type: ["string", "null"] },
        },
      },
    },
    spec: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["schemaVersion", "domain", "description", "defaults", "entities", "relationships", "events", "scenarios", "metrics", "outputs"],
          properties: {
            schemaVersion: { type: "string", const: "simulator.v1" },
            domain: { type: "string" },
            description: { type: ["string", "null"] },
            defaults: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["days", "startDate", "timezone", "locale"],
              properties: {
                days: { type: ["integer", "null"], minimum: 1 },
                startDate: { type: ["string", "null"] },
                timezone: { type: ["string", "null"], enum: ["UTC", null] },
                locale: { type: ["string", "null"] },
              },
            },
            entities: {
              type: "array",
              minItems: 1,
              items: entitySchema(),
            },
            relationships: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                required: ["from", "to", "type", "field"],
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  type: { type: "string", enum: ["one_to_one", "many_to_one", "one_to_many"] },
                  field: { type: "string" },
                },
              },
            },
            events: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "sourceEntity", "timestampField", "countPerEntity", "sequence", "fields", "dependsOn"],
                properties: {
                  name: { type: "string" },
                  sourceEntity: { type: "string" },
                  timestampField: { type: ["string", "null"] },
                  countPerEntity: { type: ["integer", "null"], minimum: 1 },
                  sequence: { type: ["integer", "null"] },
                  fields: { type: ["array", "null"], items: fieldSchema() },
                  dependsOn: { type: ["array", "null"], items: { type: "string" } },
                },
              },
            },
            scenarios: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "description", "startsOnDay", "endsOnDay", "effects"],
                properties: {
                  name: { type: "string" },
                  description: { type: ["string", "null"] },
                  startsOnDay: { type: ["integer", "null"] },
                  endsOnDay: { type: ["integer", "null"] },
                  effects: {
                    type: ["array", "null"],
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["target", "metric", "multiplier", "description"],
                      properties: {
                        target: { type: "string" },
                        metric: { type: ["string", "null"] },
                        multiplier: { type: ["number", "null"] },
                        description: { type: ["string", "null"] },
                      },
                    },
                  },
                },
              },
            },
            metrics: {
              type: ["array", "null"],
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "expression", "dependsOn", "unit", "description"],
                properties: {
                  name: { type: "string" },
                  expression: { type: "string" },
                  dependsOn: { type: ["array", "null"], items: { type: "string" } },
                  unit: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                },
              },
            },
            outputs: {
              type: "object",
              additionalProperties: false,
              required: ["formats"],
              properties: {
                formats: {
                  type: "array",
                  items: { type: "string", enum: ["csv", "jsonl", "manifest"] },
                },
              },
            },
          },
        },
      ],
    },
    error: { type: ["string", "null"] },
  },
} as const;

function entitySchema(): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "count", "fields", "description"],
    properties: {
      name: { type: "string" },
      count: { type: "integer", minimum: 1 },
      fields: { type: "array", minItems: 1, items: fieldSchema() },
      description: { type: ["string", "null"] },
    },
  };
}

function fieldSchema(): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "type", "required", "values", "min", "max", "description"],
    properties: {
      name: { type: "string" },
      type: { type: "string" },
      required: { type: ["boolean", "null"] },
      values: { type: ["array", "null"], items: { type: "string" } },
      min: { type: ["number", "null"] },
      max: { type: ["number", "null"] },
      description: { type: ["string", "null"] },
    },
  };
}

