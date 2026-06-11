# demo-data-simulator

[![CI](https://github.com/ozbayorcun/demo-data-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/ozbayorcun/demo-data-simulator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

Agent-inferred demo data for business workflow apps.

`demo-data-simulator` lets Codex, Claude Code, or another local agent infer how your app works, then turns that inference into deterministic CSV and JSONL data.

The split is deliberate:

- the CLI collects bounded, redacted project evidence
- your agent infers the entities, relationships, events, scenarios, and metrics
- local deterministic code validates the spec and generates repeatable data

Use it when you need believable demo, seed, fixture, or dashboard data for a workflow/SaaS app without hand-writing every table and event stream.

Requires Node.js 20+.

## Try It In 60 Seconds

No install needed:

```bash
npx demo-data-simulator init --project .
npx demo-data-simulator validate --spec simulator.spec.json
npx demo-data-simulator generate --spec simulator.spec.json --seed 42 --out demo-data
```

Or install it globally:

```bash
npm install -g demo-data-simulator
dds init --project .
dds validate --spec simulator.spec.json
dds generate --spec simulator.spec.json --seed 42 --out demo-data
```

Outputs:

- `demo-data/entities/*.csv`
- `demo-data/events.jsonl`
- `demo-data/metrics_daily.csv`
- `demo-data/manifest.json`

## Infer From A Repo

Run the CLI inside a product repo and let your existing coding agent infer the simulator plan.

The CLI supports Codex, Claude Code, manual mode, and a normalized command adapter.

```bash
npx demo-data-simulator infer --agent codex --project . --profile fast --accept-generated
npx demo-data-simulator validate --spec simulator.spec.json
npx demo-data-simulator generate --spec simulator.spec.json --seed 42 --out demo-data
```

Codex uses `codex exec` with a JSON Schema response contract.

Claude Code uses print mode with `--output-format json` and `--json-schema`; `dds doctor --agent claude` currently verifies the binary is present, not that auth and structured-output mode are fully ready.

```bash
npx demo-data-simulator infer --agent claude --project . --accept-generated
```

Manual mode is available when you want to write or edit the spec yourself:

```bash
npx demo-data-simulator infer --agent none --project .
```

That writes `NEEDS_DECISION.md` with the next manual step.

Any other local agent command can be used if it reads the prompt from stdin and prints the strict inference envelope as JSON:

```bash
npx demo-data-simulator infer \
  --agent command \
  --project . \
  --agent-cmd your-agent \
  --agent-arg --json \
  --accept-generated
```

For custom agent CLIs, wire their non-interactive mode through `--agent-cmd` and repeat `--agent-arg` for each argument.

## What It Generates

The generated output is intentionally boring and useful:

- linked entity tables in `entities/*.csv`
- event history in `events.jsonl`
- daily metrics in `metrics_daily.csv`
- a reproducibility manifest in `manifest.json`

The generated rows are deterministic for the same spec and seed.

## Why Not Faker?

Faker makes fields. This makes workflow data.

For example, faker can create a customer name. `demo-data-simulator` is meant to create customers, work orders, technicians, assignment events, completion events, exceptions, and metrics that agree with each other.

That matters when you are building:

- SaaS product demos
- local seed data
- analytics dashboards
- AI-agent evaluation fixtures
- sales or prototype environments

## Why Not Just Prompt An Agent?

Agents are good at inference. They are less reliable as the whole runtime.

This package keeps the agent on the part it is good at: reading bounded evidence and drafting the simulator spec. The CLI handles the parts that should be boring and repeatable:

- evidence collection and source prioritization
- secret redaction
- a strict JSON inference contract
- spec validation
- deterministic seeded generation
- CSV/JSONL writers
- CI-friendly commands

That means the same inferred spec can be reviewed, committed, regenerated, and tested without asking an LLM to recreate rows every time.

Reproducibility check:

```bash
dds generate --spec simulator.spec.json --seed 42 --out demo-data-a
dds generate --spec simulator.spec.json --seed 42 --out demo-data-b
diff -ru demo-data-a demo-data-b
```

## CLI Core, Skill Layer

This can pair well with agent skill packs. A skill can teach Codex or Claude when to call `dds`, how to review the generated spec, and how to improve it for a repo.

The CLI remains the durable engine. It gives every agent the same evidence boundary, schema, validator, generator, and output format.

## Commands

```bash
  dds doctor --agent auto
  dds init --project .
  dds infer --agent codex --project .
  dds infer --agent codex --project . --profile fast
  dds infer --agent claude --project .
  dds infer --agent command --agent-cmd <bin> --agent-arg <arg> --project .
  dds validate --spec simulator.spec.json
  dds generate --spec simulator.spec.json --seed 42 --out demo-data
  dds explain --spec simulator.spec.json
```

## Safety Model

The CLI collects a bounded evidence bundle before invoking an agent:

- skips dependency/build directories, binary files, dot-env files, credentials, tokens, and key files
- only reads allowlisted text/source extensions
- applies simple secret redaction before building the prompt
- writes `.demo-data-simulator/evidence-manifest.json`
- treats repo contents as untrusted evidence, not instructions
- ranks candidate files before spending the evidence budget, prioritizing source, schema, model, API, workflow, test, and fixture files over low-signal config/docs

Evidence profiles:

- `--profile fast`: smaller first-run bundle for larger repos
- `--profile balanced`: default
- `--profile wide`: larger bundle for deeper inference

The built-in Codex preset is run with a read-only sandbox. Custom `--agent-cmd` commands are user-controlled, so review those commands the same way you would review any local script. The generated spec is written to `.demo-data-simulator/simulator.spec.generated.json`; `simulator.spec.json` is user-owned.

## Spec

MVP specs are JSON only and use `schemaVersion: "simulator.v1"`. A spec defines entities, fields, relationships, events, scenarios, metrics, and outputs.

See `examples/specs/field-service.simulator.spec.json`.

## When Not To Use It

This is not the best tool for:

- one-off random names or addresses
- production anonymization
- load testing with millions of rows
- domains with no workflow, state changes, or relationships

For those, a faker library, anonymization pipeline, or load-test generator is probably a better fit.
