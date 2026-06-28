# Pre-Publish Proof Bundle

This note collects the local evidence for deciding whether `demo-data-simulator`
is ready for an initial npm publish. It is approval support only: no npm publish,
trusted-publisher setup, account setting change, release creation, or public
availability claim was made while producing this bundle.

Verified locally on 2026-06-20 EDT / 2026-06-21 UTC from the pre-publish branch.

## Current Release Candidate

- Package name: `demo-data-simulator`
- Version: `0.1.0`
- Node engine: `>=20`
- Public package intent: `publishConfig.access` is `public`
- Provenance intent: `publishConfig.provenance` is `true`
- Binaries: `demo-data-simulator` and `dds`, both pointing at `dist/cli.js`
- Included package surfaces: compiled `dist/`, README, examples, field-service
  dashboard proof, packed dashboard smoke script, and agent skill files

The README already includes the intended post-publish `npx` and global install
commands. Treat those commands as release-candidate instructions until the npm
package page is live.

## Local Proofs

### Repository Check

Command:

```bash
npm run check
```

Result:

```text
Test Files  5 passed (5)
Tests       32 passed (32)
```

This runs the TypeScript build and Vitest suite. The suite includes the
field-service fixture regression test, which regenerates the deterministic
dashboard data with seed 42 and compares it against the committed dashboard
files.

### Field-Service Dashboard Smoke

Command:

```bash
npm run smoke:field-service-dashboard
```

Result:

```text
Field-service dashboard smoke passed.
- Loaded events.jsonl (90), metrics_daily.csv (56), and manifest.json.
- Dashboard assets reference no external URLs.
```

The smoke script serves the dashboard from `127.0.0.1` on an ephemeral port and
loads the committed `events.jsonl`, `metrics_daily.csv`, and `manifest.json`
through HTTP. It verifies the dashboard uses local fixture paths and no external
URLs.

The committed manifest records:

```json
{
  "seed": "42",
  "domain": "field-service",
  "rows": {
    "entities/customer.csv": 8,
    "entities/technician.csv": 5,
    "entities/work_order.csv": 30,
    "events.jsonl": 90,
    "metrics_daily.csv": 56
  }
}
```

### Local Tarball Install Smoke

Command:

```bash
npm run smoke:pack
```

Result summary:

```text
npm pack produced demo-data-simulator-0.1.0.tgz
Tarball Contents: 51 files
Package size: 36.5 kB
Unpacked size: 157.1 kB
added 1 package, and audited 2 packages
found 0 vulnerabilities
Spec is valid.
Generated 5 files in clean-project/demo-data
Pack smoke passed from clean project using demo-data-simulator-0.1.0.tgz.
```

The smoke test creates a clean temporary project, installs the local tarball with
`npm install --ignore-scripts`, then verifies:

- `dds --help`
- `dds validate --spec simulator.spec.json`
- `dds generate --spec simulator.spec.json --seed 42 --out demo-data`
- generated manifest seed `42`
- generated event stream includes the expected sample event

The packed file list includes the dashboard smoke script at
`scripts/smoke-field-service-dashboard.mjs`, so the documented dashboard smoke
command is present in the package.

## Publish Workflow Readiness

The repo has a publish workflow at `.github/workflows/publish.yml` that can run
on `workflow_dispatch` or `v*` tags. It currently:

- checks out the repo
- sets up Node.js 24 with npm registry configuration
- runs `npm ci`
- runs `npm run check`
- runs `npm pack --dry-run`
- runs `npm publish`

The workflow has `id-token: write`, matching the provenance intent in
`publishConfig`. This does not prove npm trusted publishing is configured for
the package; npm-side package/account setup remains an operator decision.

For the current automated release process, including the exact trusted publisher
settings required after the `v0.2.0` tag workflow failure, see
`docs/release-runbook.md`.

## Remaining Publish Gates

- Orcun must explicitly approve initial npm package creation/publish.
- npm authentication, package-name availability, trusted publishing, and account
  settings must be handled by an operator; Atom should not change those.
- After publish, verify the live package from a clean directory:

```bash
npx demo-data-simulator --help
npx demo-data-simulator init --project .
npx demo-data-simulator validate --spec simulator.spec.json
npx demo-data-simulator generate --spec simulator.spec.json --seed 42 --out demo-data
```

The `init` step creates the sample `simulator.spec.json` that the clean-directory
`validate` and `generate` commands read.

- After publish, complete the packaged agent-skill verification tracked in issue
  #2.
- Do not claim public npm availability until the npm package page is live and
  `npx demo-data-simulator --help` works from a clean environment.
