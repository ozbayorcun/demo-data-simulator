# demo-data-simulator

Agent-inferred demo data for business workflow apps.

`demo-data-simulator` turns a repo into a versioned simulator spec, then generates deterministic CSV and JSONL demo data locally. The key split is simple: your agent infers the plan from bounded project evidence; this package validates the plan and generates repeatable data.

## Try It In 60 Seconds

```bash
npm install
npm run build
node dist/cli.js validate --spec examples/specs/field-service.simulator.spec.json
node dist/cli.js generate --spec examples/specs/field-service.simulator.spec.json --seed 42 --out demo-data
```

Outputs:

- `demo-data/entities/*.csv`
- `demo-data/events.jsonl`
- `demo-data/metrics_daily.csv`
- `demo-data/manifest.json`

## Agent-Inferred Flow

The MVP ships the normalized command adapter first. Any local agent command can be used if it reads the prompt from stdin and prints the strict inference envelope as JSON.

```bash
node dist/cli.js infer \
  --agent command \
  --project examples/field-service \
  --agent-cmd node \
  --agent-arg ../../examples/agents/field-service-agent.mjs \
  --accept-generated
```

For real agent CLIs, wire their non-interactive mode through `--agent-cmd` and repeat `--agent-arg` for each argument. Built-in Codex and Claude presets are intentionally kept behind the shared adapter contract.

## Commands

```bash
dds doctor --agent auto
dds init --project .
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

The agent is read-only from this tool's point of view. The generated spec is written to `.demo-data-simulator/simulator.spec.generated.json`; `simulator.spec.json` is user-owned.

## Spec

MVP specs are JSON only and use `schemaVersion: "simulator.v1"`. A spec defines entities, fields, relationships, events, scenarios, metrics, and outputs.

See `examples/specs/field-service.simulator.spec.json`.

## Why Not Faker?

Faker makes fields. This makes coherent workflow data: entities link together, events happen over time, and metrics can be derived from the same generated activity.

