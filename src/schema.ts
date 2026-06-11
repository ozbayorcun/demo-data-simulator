export const inferenceEnvelopeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "status"],
  properties: {
    schemaVersion: { const: "inference.v1" },
    status: { enum: ["ok", "needs_decision", "error"] },
    brief: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      type: "array",
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
    assumptions: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          default: { type: "string" },
        },
      },
    },
    spec: {
      type: "object",
      additionalProperties: true,
      required: ["schemaVersion", "domain", "entities", "events", "outputs"],
      properties: {
        schemaVersion: { const: "simulator.v1" },
        domain: { type: "string" },
        description: { type: "string" },
        defaults: {
          type: "object",
          additionalProperties: true,
          properties: {
            days: { type: "integer", minimum: 1 },
            startDate: { type: "string" },
            timezone: { const: "UTC" },
            locale: { type: "string" },
          },
        },
        entities: { type: "array", minItems: 1 },
        relationships: { type: "array" },
        events: { type: "array", minItems: 1 },
        scenarios: { type: "array" },
        metrics: { type: "array" },
        outputs: { type: "object" },
      },
    },
    error: { type: "string" },
  },
} as const;

