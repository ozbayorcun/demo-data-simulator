import type { SimulatorSpec } from "./types.js";

export interface ScenarioPack {
  id: string;
  description: string;
  spec: SimulatorSpec;
}

const fieldServicePack: ScenarioPack = {
  id: "field-service",
  description: "Work orders move from customer request to technician completion.",
  spec: {
    schemaVersion: "simulator.v1",
    domain: "field-service",
    description: "Work orders move from customer request to technician completion.",
    defaults: {
      days: 14,
      startDate: "2026-01-01",
      timezone: "UTC",
      locale: "en-US",
    },
    entities: [
      {
        name: "customer",
        count: 8,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "segment", type: "enum", values: ["residential", "commercial"] },
        ],
      },
      {
        name: "technician",
        count: 5,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "skill", type: "enum", values: ["hvac", "plumbing", "electrical"] },
        ],
      },
      {
        name: "work_order",
        count: 30,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "customer_id", type: "ref:customer", required: true },
          { name: "technician_id", type: "ref:technician", required: true },
          { name: "priority", type: "enum", values: ["low", "normal", "urgent"] },
          {
            name: "status",
            type: "enum",
            values: ["completed", "overdue", "reassigned", "missed_appointment", "high_priority", "capacity_pressure"],
          },
          { name: "created_at", type: "timestamp" },
        ],
      },
    ],
    relationships: [
      { from: "work_order", to: "customer", type: "many_to_one", field: "customer_id" },
      { from: "work_order", to: "technician", type: "many_to_one", field: "technician_id" },
    ],
    events: [
      {
        name: "work_order_created",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 1,
      },
      {
        name: "work_order_scheduled",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 2,
        dependsOn: ["work_order_created"],
      },
      {
        name: "work_order_completed",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 3,
        dependsOn: ["work_order_scheduled"],
        fields: [{ name: "first_time_fix", type: "boolean" }],
      },
      {
        name: "work_order_delayed",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 4,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_reassigned",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 5,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_missed_appointment",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 6,
        dependsOn: ["work_order_scheduled"],
      },
      {
        name: "work_order_escalated",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 7,
        dependsOn: ["work_order_created"],
      },
      {
        name: "technician_capacity_pressure",
        sourceEntity: "work_order",
        countPerEntity: 1,
        sequence: 8,
        dependsOn: ["work_order_scheduled"],
      },
    ],
    scenarios: [
      {
        name: "normal-week",
        description: "Balanced demand with normal completion flow.",
        startsOnDay: 1,
        endsOnDay: 14,
      },
      {
        name: "overdue-work",
        description: "A work order misses its expected service window.",
        startsOnDay: 2,
        endsOnDay: 5,
        effects: [
          { target: "entity:work_order.status=overdue", description: "Rows marked as overdue work." },
          { target: "event:work_order_delayed", description: "Delay events show overdue workflow movement." },
        ],
      },
      {
        name: "reassignment",
        description: "A scheduled job is reassigned to another technician.",
        startsOnDay: 3,
        endsOnDay: 7,
        effects: [
          { target: "entity:work_order.status=reassigned", description: "Rows marked as reassigned work." },
          { target: "event:work_order_reassigned", description: "Reassignment events show technician handoff." },
        ],
      },
      {
        name: "missed-appointment",
        description: "A customer appointment is missed and needs follow-up.",
        startsOnDay: 4,
        endsOnDay: 8,
        effects: [
          { target: "entity:work_order.status=missed_appointment", description: "Rows marked as missed appointments." },
          { target: "event:work_order_missed_appointment", description: "Missed appointment events show failed visit flow." },
        ],
      },
      {
        name: "high-priority-customer",
        description: "Urgent customer work is escalated.",
        startsOnDay: 1,
        endsOnDay: 10,
        effects: [
          { target: "entity:work_order.status=high_priority", description: "Rows marked as high-priority work." },
          { target: "event:work_order_escalated", description: "Escalation events show priority handling." },
        ],
      },
      {
        name: "technician-capacity-pressure",
        description: "Technician capacity pressure creates operational strain.",
        startsOnDay: 6,
        endsOnDay: 14,
        effects: [
          { target: "entity:work_order.status=capacity_pressure", description: "Rows marked as capacity-pressure work." },
          { target: "event:technician_capacity_pressure", description: "Capacity pressure events show constrained operations." },
        ],
      },
    ],
    metrics: [
      {
        name: "completed_work_orders",
        expression: "count(work_order_completed)",
        dependsOn: ["work_order_completed"],
        unit: "orders",
      },
    ],
    outputs: {
      formats: ["csv", "jsonl", "manifest"],
    },
  },
};

const salesPipelinePack: ScenarioPack = {
  id: "sales-pipeline",
  description: "Opportunities move from lead capture through stage changes, expansion, and close outcomes.",
  spec: {
    schemaVersion: "simulator.v1",
    domain: "sales-pipeline",
    description: "B2B sales pipeline with accounts, opportunities, reps, stage changes, and pipeline metrics.",
    defaults: {
      days: 30,
      startDate: "2026-02-01",
      timezone: "UTC",
      locale: "en-US",
    },
    entities: [
      {
        name: "account",
        count: 12,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "segment", type: "enum", values: ["startup", "mid_market", "enterprise"] },
          { name: "region", type: "enum", values: ["na", "emea", "apac"] },
        ],
      },
      {
        name: "sales_rep",
        count: 4,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "territory", type: "enum", values: ["east", "west", "central", "international"] },
        ],
      },
      {
        name: "opportunity",
        count: 36,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "account_id", type: "ref:account", required: true },
          { name: "sales_rep_id", type: "ref:sales_rep", required: true },
          { name: "deal_type", type: "enum", values: ["new_business", "expansion", "renewal"] },
          { name: "stage", type: "enum", values: ["qualified", "demo", "proposal", "negotiation", "closed_won", "closed_lost", "stalled"] },
          { name: "amount", type: "number", min: 5000, max: 150000 },
          { name: "created_at", type: "timestamp" },
        ],
      },
    ],
    relationships: [
      { from: "opportunity", to: "account", type: "many_to_one", field: "account_id" },
      { from: "opportunity", to: "sales_rep", type: "many_to_one", field: "sales_rep_id" },
    ],
    events: [
      { name: "opportunity_created", sourceEntity: "opportunity", countPerEntity: 1, sequence: 1 },
      {
        name: "opportunity_demo_completed",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 2,
        dependsOn: ["opportunity_created"],
      },
      {
        name: "proposal_sent",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 3,
        dependsOn: ["opportunity_demo_completed"],
      },
      {
        name: "deal_stalled",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 4,
        dependsOn: ["proposal_sent"],
      },
      {
        name: "expansion_identified",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 5,
        dependsOn: ["opportunity_created"],
      },
      {
        name: "opportunity_closed_won",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 6,
        dependsOn: ["proposal_sent"],
      },
      {
        name: "opportunity_closed_lost",
        sourceEntity: "opportunity",
        countPerEntity: 1,
        sequence: 7,
        dependsOn: ["proposal_sent"],
      },
    ],
    scenarios: [
      {
        name: "healthy-new-business",
        description: "Qualified new-business opportunities move through demo, proposal, and close.",
        startsOnDay: 1,
        endsOnDay: 30,
        effects: [
          { target: "entity:opportunity.stage=closed_won", description: "Rows marked as won deals." },
          { target: "event:opportunity_closed_won", description: "Closed-won events complete the successful sales flow." },
        ],
      },
      {
        name: "stalled-enterprise-deal",
        description: "A larger enterprise opportunity slows down after proposal.",
        startsOnDay: 7,
        endsOnDay: 21,
        effects: [
          { target: "entity:opportunity.stage=stalled", description: "Rows marked as stalled pipeline." },
          { target: "event:deal_stalled", description: "Stall events show delayed buyer progress." },
        ],
      },
      {
        name: "expansion-signal",
        description: "Existing account activity creates expansion pipeline.",
        startsOnDay: 10,
        endsOnDay: 25,
        effects: [
          { target: "entity:opportunity.deal_type=expansion", description: "Rows marked as expansion opportunities." },
          { target: "event:expansion_identified", description: "Expansion events show account growth signals." },
        ],
      },
      {
        name: "competitive-loss",
        description: "Some qualified opportunities close lost after proposal.",
        startsOnDay: 14,
        endsOnDay: 30,
        effects: [
          { target: "entity:opportunity.stage=closed_lost", description: "Rows marked as lost opportunities." },
          { target: "event:opportunity_closed_lost", description: "Closed-lost events show unsuccessful sales flow." },
        ],
      },
    ],
    metrics: [
      {
        name: "pipeline_value",
        expression: "sum(opportunity.amount)",
        dependsOn: ["opportunity_created"],
        unit: "usd",
      },
      {
        name: "closed_won_opportunities",
        expression: "count(opportunity_closed_won)",
        dependsOn: ["opportunity_closed_won"],
        unit: "opportunities",
      },
    ],
    outputs: {
      formats: ["csv", "jsonl", "manifest"],
    },
  },
};

const recruitingPipelinePack: ScenarioPack = {
  id: "recruiting-pipeline",
  description: "Candidates move through applications, interviews, offers, and hiring outcomes.",
  spec: {
    schemaVersion: "simulator.v1",
    domain: "recruiting-pipeline",
    description: "Recruiting pipeline with candidates, jobs, recruiters, applications, interviews, and offer metrics.",
    defaults: {
      days: 28,
      startDate: "2026-03-01",
      timezone: "UTC",
      locale: "en-US",
    },
    entities: [
      {
        name: "candidate",
        count: 24,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "source", type: "enum", values: ["referral", "inbound", "sourced", "agency"] },
          { name: "seniority", type: "enum", values: ["junior", "mid", "senior", "staff"] },
        ],
      },
      {
        name: "job",
        count: 5,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "title", type: "string", required: true },
          { name: "department", type: "enum", values: ["engineering", "product", "sales", "operations"] },
        ],
      },
      {
        name: "recruiter",
        count: 3,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "name", type: "string", required: true },
          { name: "team", type: "enum", values: ["technical", "gtm", "corporate"] },
        ],
      },
      {
        name: "application",
        count: 40,
        fields: [
          { name: "id", type: "id", required: true },
          { name: "candidate_id", type: "ref:candidate", required: true },
          { name: "job_id", type: "ref:job", required: true },
          { name: "recruiter_id", type: "ref:recruiter", required: true },
          { name: "stage", type: "enum", values: ["applied", "screen", "onsite", "offer", "hired", "declined", "stalled"] },
          { name: "created_at", type: "timestamp" },
        ],
      },
    ],
    relationships: [
      { from: "application", to: "candidate", type: "many_to_one", field: "candidate_id" },
      { from: "application", to: "job", type: "many_to_one", field: "job_id" },
      { from: "application", to: "recruiter", type: "many_to_one", field: "recruiter_id" },
    ],
    events: [
      { name: "application_created", sourceEntity: "application", countPerEntity: 1, sequence: 1 },
      {
        name: "phone_screen_completed",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 2,
        dependsOn: ["application_created"],
      },
      {
        name: "onsite_scheduled",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 3,
        dependsOn: ["phone_screen_completed"],
      },
      {
        name: "interview_loop_stalled",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 4,
        dependsOn: ["onsite_scheduled"],
      },
      {
        name: "offer_sent",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 5,
        dependsOn: ["onsite_scheduled"],
      },
      {
        name: "offer_accepted",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 6,
        dependsOn: ["offer_sent"],
      },
      {
        name: "offer_declined",
        sourceEntity: "application",
        countPerEntity: 1,
        sequence: 7,
        dependsOn: ["offer_sent"],
      },
    ],
    scenarios: [
      {
        name: "fast-track-candidate",
        description: "A strong candidate moves quickly from screen to accepted offer.",
        startsOnDay: 1,
        endsOnDay: 14,
        effects: [
          { target: "entity:application.stage=hired", description: "Rows marked as hired applications." },
          { target: "event:offer_accepted", description: "Offer acceptance events show successful hiring." },
        ],
      },
      {
        name: "stalled-interview-loop",
        description: "Interview scheduling friction slows a promising application.",
        startsOnDay: 7,
        endsOnDay: 21,
        effects: [
          { target: "entity:application.stage=stalled", description: "Rows marked as stalled applications." },
          { target: "event:interview_loop_stalled", description: "Stall events show hiring process friction." },
        ],
      },
      {
        name: "offer-declined",
        description: "A finalist declines after offer, leaving the role open.",
        startsOnDay: 14,
        endsOnDay: 28,
        effects: [
          { target: "entity:application.stage=declined", description: "Rows marked as declined offers." },
          { target: "event:offer_declined", description: "Decline events show unsuccessful close." },
        ],
      },
    ],
    metrics: [
      {
        name: "applications_created",
        expression: "count(application_created)",
        dependsOn: ["application_created"],
        unit: "applications",
      },
      {
        name: "offers_accepted",
        expression: "count(offer_accepted)",
        dependsOn: ["offer_accepted"],
        unit: "offers",
      },
    ],
    outputs: {
      formats: ["csv", "jsonl", "manifest"],
    },
  },
};

const PACKS = new Map<string, ScenarioPack>([
  [fieldServicePack.id, fieldServicePack],
  [recruitingPipelinePack.id, recruitingPipelinePack],
  [salesPipelinePack.id, salesPipelinePack],
]);

export function listScenarioPackIds(): string[] {
  return [...PACKS.keys()].sort();
}

export function listScenarioPacks(): Array<Pick<ScenarioPack, "id" | "description">> {
  return [...PACKS.values()]
    .map((pack) => ({ id: pack.id, description: pack.description }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getScenarioPack(id: string): ScenarioPack | undefined {
  const pack = PACKS.get(id);
  if (!pack) return undefined;
  return {
    ...pack,
    spec: structuredClone(pack.spec),
  };
}
