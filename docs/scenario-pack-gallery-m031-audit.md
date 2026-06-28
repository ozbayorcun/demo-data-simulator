# M031 Scenario Pack Gallery Audit

Date: 2026-06-28
Milestone issue: #32
Milestone branch: `atom/m031-scenario-pack-gallery`
Status: ready for final PR to `main`

## Verdict

M031 turns built-in packs from a single field-service example into a small
public gallery that is easier to discover, prove, and extend.

The milestone adds sales and recruiting workflows, documents all built-in pack
IDs in the public README, and expands the smoke proof so every built-in pack is
initialized, validated, generated, and checked through proof output.

## Landed Issue Slices

| Issue | Result |
| --- | --- |
| #33 M031.1 Add sales pipeline scenario pack | Added `sales-pipeline` with accounts, sales reps, opportunities, lifecycle events, pipeline metrics, and edge-case scenarios. |
| #34 M031.2 Add recruiting pipeline scenario pack | Added `recruiting-pipeline` with candidates, jobs, recruiters, applications, interview and offer events, hiring metrics, and edge-case scenarios. |
| #35 M031.3 Document and smoke-test scenario gallery | Documented the built-in gallery and expanded scenario proof smoke coverage across all built-in packs. |

## Proof

Run from the repo root:

```bash
npm run check
npm run smoke:scenario-proof
git diff --check
```

The scenario proof smoke covers:

- `field-service` with seed `field-service-demo`
- `sales-pipeline` with seed `sales-demo`
- `recruiting-pipeline` with seed `recruiting-demo`

Each pack is initialized into a clean temporary project, validated, generated,
and checked with both Markdown and JSON proof output.

## Explicitly Not Done

- No npm publish.
- No package version bump.
- No trusted-publisher or npm account-setting change.
- No agent inference reliability changes; that is the next selected milestone.
