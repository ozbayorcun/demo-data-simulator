export type FieldType =
  | "id"
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "timestamp"
  | "enum"
  | `ref:${string}`;

export interface FieldSpec {
  name: string;
  type: FieldType;
  required?: boolean;
  values?: string[];
  min?: number;
  max?: number;
  description?: string;
}

export interface EntitySpec {
  name: string;
  count: number;
  fields: FieldSpec[];
  description?: string;
}

export interface RelationshipSpec {
  from: string;
  to: string;
  type: "one_to_one" | "many_to_one" | "one_to_many";
  field: string;
}

export interface EventSpec {
  name: string;
  sourceEntity: string;
  timestampField?: string;
  countPerEntity?: number;
  sequence?: number;
  fields?: FieldSpec[];
  dependsOn?: string[];
}

export interface ScenarioSpec {
  name: string;
  description?: string;
  startsOnDay?: number;
  endsOnDay?: number;
  effects?: Array<{
    target: string;
    metric?: string;
    multiplier?: number;
    description?: string;
  }>;
}

export interface MetricSpec {
  name: string;
  expression: string;
  dependsOn?: string[];
  unit?: string;
  description?: string;
}

export interface OutputSpec {
  formats: Array<"csv" | "jsonl" | "manifest" | "sql">;
}

export interface SimulatorSpec {
  schemaVersion: "simulator.v1";
  domain: string;
  description?: string;
  defaults?: {
    days?: number;
    startDate?: string;
    timezone?: "UTC";
    locale?: string;
  };
  entities: EntitySpec[];
  relationships?: RelationshipSpec[];
  events: EventSpec[];
  scenarios?: ScenarioSpec[];
  metrics?: MetricSpec[];
  outputs: OutputSpec;
}

export interface EvidenceFile {
  path: string;
  bytes: number;
  redactions: number;
  reason: string;
  content: string;
}

export interface EvidenceManifest {
  projectRoot: string;
  generatedAt: string;
  files: Array<Omit<EvidenceFile, "content">>;
  skipped: Array<{ path: string; reason: string }>;
  totals: {
    files: number;
    bytes: number;
    redactions: number;
  };
}

export interface InferenceEnvelope {
  schemaVersion: "inference.v1";
  status: "ok" | "needs_decision" | "error";
  brief?: string;
  confidence?: number;
  evidence?: Array<{ claim: string; files: string[] }>;
  assumptions?: string[];
  questions?: Array<{ id: string; question: string; default?: string }>;
  spec?: SimulatorSpec;
  error?: string;
}
