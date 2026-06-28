# Scenario Packs + Proof Reports Plan

## Goal

Make `demo-data-simulator` useful immediately after install by adding named, replayable scenario packs and proof reports that explain what was generated, which constraints were satisfied, and where the data is intentionally synthetic.

This is the next product upgrade after the first npm publish. It should keep the current local-first safety model: no remote service, no hidden upload, deterministic output, and no public release claims until a version is actually published.

## First Scenario Pack

Start with `field-service`.

Why this pack first:

- The repo already has a field-service spec, static dashboard, generated fixture data, and smoke coverage.
- The domain naturally shows linked entities, state transitions, SLA/exception edge cases, and operational metrics.
- It can prove the feature without introducing a second demo surface or a new visualization stack.

Initial pack shape:

- Pack id: `field-service`
- Primary entities: `customer`, `technician`, `work_order`
- Primary events: created, scheduled, assigned, en route, completed, delayed or escalated
- Required edge cases: overdue work, reassignment, missed appointment, high-priority customer, technician capacity pressure
- Outputs: CSV entities, JSONL events, daily metrics, manifest, proof report
- Default seeds: examples should use stable named seeds such as `field-service-demo`

## Product Behavior

Scenario packs should be callable without asking an agent to infer a repo:

```bash
dds init --pack field-service --project .
dds generate --spec simulator.spec.json --seed field-service-demo --out demo-data
dds proof --spec simulator.spec.json --seed field-service-demo --data demo-data --out demo-data/proof.md
```

The exact command surface can evolve during implementation, but the final UX should preserve three principles:

- A pack creates or selects a reviewed spec.
- The seed makes the generated dataset replayable.
- The proof report describes the generated data in human-readable and machine-readable form.

## Proof Report Requirements

Every proof report should include:

- Spec identity: domain, schema version, pack id when present, seed, output directory, generated files.
- Coverage: entity counts, event counts, metric rows, relationship coverage, event sequence coverage.
- Realism checks: required status values, meaningful lifecycle transitions, non-empty metrics, plausible date span, deterministic seed note.
- Edge cases: which named edge cases are present and how many rows/events demonstrate each one.
- Constraints: relationship references valid, event source entities present, generated files match requested formats.
- Synthetic boundary: clear statement that data is generated and not production/anonymized data.

Machine-readable proof should be JSON so CI and agents can inspect it. Human-readable proof should be Markdown so users can attach it to PRs, demos, or docs.

## Implementation Slices

1. Scenario pack registry and CLI selection

Add a small built-in pack registry and let `dds init --pack field-service` write the reviewed field-service spec. Keep pack specs as versioned source files rather than generated strings.

2. Proof report data model and writer

Add proof report generation over a spec and generated output directory. Start with JSON and Markdown writers, deterministic ordering, and focused tests.

3. Field-service pack edge cases

Upgrade the field-service scenario to include explicit edge-case markers and event coverage that the proof report can detect.

4. Docs and smoke proof

Update README examples, add a local smoke script for `init --pack field-service` plus proof generation, and include it in CI.

## Guardrails

- Do not publish a new npm version from this milestone without explicit approval.
- Do not add external service dependencies.
- Do not infer or store private repo details in the built-in packs.
- Do not commit generated demo output except intentionally maintained examples.
