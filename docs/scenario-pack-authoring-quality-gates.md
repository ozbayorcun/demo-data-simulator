# Scenario Pack Authoring Quality Gates

Use this workflow when editing or reviewing built-in scenario packs. It stays
local, deterministic, and does not publish anything.

## Inspect Packs

List the reviewed built-in packs:

```bash
dds pack list
```

Export a pack spec for review or editing:

```bash
dds pack export --pack field-service --out tmp/field-service.simulator.spec.json
```

The exported file is a normal `simulator.v1` spec. It can be edited, validated,
generated, and proofed without using repo inference.

## Lint Before Generating

Run the local spec gate before generating rows:

```bash
dds lint --spec tmp/field-service.simulator.spec.json
```

The lint gate checks the base simulator schema plus scenario authoring details:

- scenario names are present and unique
- scenario day windows are valid against `defaults.days`
- scenario effect targets use `event:<name>` or `entity:<entity>.<field>=<value>`
- effect targets reference existing events, entities, fields, and enum values
- metric references and multipliers are valid

## Generate And Proof

Use a named seed so reviewers can rerun the same output:

```bash
dds generate --spec tmp/field-service.simulator.spec.json --seed field-service-demo --out tmp/field-service-data
dds proof \
  --spec tmp/field-service.simulator.spec.json \
  --data tmp/field-service-data \
  --out tmp/field-service-data/proof.md \
  --json-out tmp/field-service-data/proof.json
```

The proof report verifies generated files, row coverage, relationship integrity,
event source integrity, scenario coverage, and synthetic-data boundaries.

## Diff Proof Reports

Compare two proof JSON files after a pack edit:

```bash
dds proof diff \
  --baseline tmp/before/proof.json \
  --candidate tmp/after/proof.json
```

The command exits successfully when reports match. Differences exit non-zero and
print changed proof sections. For review-only comparisons where drift is
expected, use:

```bash
dds proof diff \
  --baseline tmp/before/proof.json \
  --candidate tmp/after/proof.json \
  --allow-differences
```

## Full Local Smoke

Run the pack proof smoke before merging scenario pack changes:

```bash
npm run smoke:scenario-proof
```

That command builds the CLI, initializes every built-in pack into temporary
directories, validates each exported spec, generates deterministic data with
pack-specific seeds, and verifies Markdown and JSON proof reports.
