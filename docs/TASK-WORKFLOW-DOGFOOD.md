# Task Workflow Dogfood

Status: completed against a private macOS-first task workflow repo on 2026-06-10.

This dogfood run used a real app with:

- Clerk-backed identity
- web subscription and license checks
- desktop runtime readiness
- capture sessions
- extracted candidate tasks
- human review outcomes
- stored tasks
- task insights telemetry

The goal was not to publish private project details. The goal was to prove that `demo-data-simulator` can infer a useful simulator from a mixed desktop/web workflow repo and then generate deterministic linked data.

## What Worked

The fresh inference run produced a valid `simulator.v1` spec after normalization.

The generated spec included entities for:

- users
- subscriptions
- licenses
- desktop tickets
- extract counters
- identity snapshots
- runtime snapshots
- capture sessions
- candidate items
- stored tasks
- task insight events

It also inferred workflow events such as:

- desktop ticket minted
- identity snapshot changed
- runtime readiness checked
- capture created
- capture extraction completed
- candidate reviewed
- stored task resolved
- task insights reported

Generated output with seed `taskmanager-demo`:

- 11 entity CSV files
- 950 event rows in `events.jsonl`
- 369 daily metric rows in `metrics_daily.csv`
- 1 reproducibility manifest

## Issues Found

The first run exposed two useful real-repo gaps.

1. Fast evidence selection over-weighted broad web API route files compared with desktop task contracts.
2. The agent returned common TypeScript-style field dialects such as `string|null`, `datetime|null`, `semver_or_current`, null numeric bounds, and entity names inside event dependencies.

## Fixes Made

The CLI now:

- prioritizes `src/shared/contracts`, `test/contracts`, `src/renderer`, and `src/main` when evidence budget is tight
- normalizes nullable field type suffixes like `string|null` and `datetime | null`
- normalizes semantic scalar names like `semver_or_current` to `string`
- removes null `min`, `max`, and `values` properties before validation
- filters inferred event dependencies to real event names

## Verdict

The project is now past fixture-only validation. It has run against a real mixed desktop/web workflow repo, found product issues, fixed them, and generated a coherent deterministic dataset.

The next dogfood target should focus on a different repo shape, ideally a pure SaaS app or API-only service, to avoid overfitting evidence ranking to desktop workflow projects.
