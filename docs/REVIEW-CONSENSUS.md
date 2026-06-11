# demo-data-simulator Review Consensus

Date: 2026-06-10

## Review Run

Four reviewers examined the PRD from different angles:

- product strategy and positioning
- CLI UX and workflow
- implementation architecture and feasibility
- open-source/devrel

## Consensus

The strongest product shape is not a questionnaire and not a generic faker clone.

The product should be:

> An agent-inferred demo data generator for business workflow apps.

The CLI should collect a safe evidence bundle from a project, pass that bounded bundle to the user's existing coding agent, receive a structured inference envelope, validate a JSON simulator spec, then generate deterministic data locally.

## Major Changes Accepted

- Narrow target from "any business domain" to "business workflow apps."
- Add positioning up front: different from faker, runtime-proof-kit, and LLM row generation.
- Make `infer` the primary command.
- Add `doctor` for agent readiness.
- Make `init` scaffolding only.
- CLI collects evidence; agent reasons over that evidence.
- Add hard context-safety boundary.
- Add structured inference envelope.
- Make JSON-only spec v1 the MVP.
- Separate generated artifacts from user-owned specs.
- Define `NEEDS_DECISION.md` resume behavior.
- Define deterministic generation requirements.
- Add first-run README/demo requirements.

## Key Risks Addressed

- Secret leakage from repo context
- Prompt injection from project files
- Ambiguous Codex/Claude adapter behavior
- Brittle shell-string custom commands
- Agent output that mixes JSON and prose
- User edits being clobbered by re-inference
- Determinism being underdefined
- Public positioning looking too vague

## Open Questions

- Which adapter ships first: Codex, Claude, or generic argv-array command?
- Should the public package remain `demo-data-simulator`, or become a shorter brand like `simforge`?
- Should `explain` ship in MVP or be deferred until the core trust path is complete?
