# Release Runbook

This package publishes to npm from `.github/workflows/publish.yml` on `v*` tags
or manual `workflow_dispatch` runs. The workflow is intended to use npm trusted
publishing with provenance, not a long-lived npm automation token.

## Trusted Publishing Requirements

The package-level trusted publisher in npm must be configured before the next
automated release. This is an npm package/account setting and requires Orcun's
explicit approval before changing.

Configure `demo-data-simulator` on npm with:

- Publisher: GitHub Actions
- Organization or user: `ozbayorcun`
- Repository: `demo-data-simulator`
- Workflow filename: `publish.yml`
- Environment name: leave blank unless the GitHub workflow is later changed to
  use a deployment environment
- Allowed actions: `npm publish`

The workflow filename must be only `publish.yml`, not
`.github/workflows/publish.yml`. The workflow must keep
`permissions.id-token: write`, run on a GitHub-hosted runner, and publish from
the public repository in `package.json`:
`git+https://github.com/ozbayorcun/demo-data-simulator.git`.

The workflow installs `npm@^11.15.0` before publishing so the release job has a
trusted-publishing capable npm CLI. Do not add `NODE_AUTH_TOKEN` to the publish
step for this package unless trusted publishing is intentionally replaced with a
token-based release process.

## v0.2.0 Failure Diagnosis

The `v0.2.0` tag workflow reached npm and signed a provenance statement, then
failed on the package upload with:

```text
E404 Not Found - PUT https://registry.npmjs.org/demo-data-simulator
The requested resource 'demo-data-simulator@0.2.0' could not be found or you do not have permission to access it.
```

The provenance message proves GitHub Actions could mint an OIDC token for
Sigstore provenance. It does not prove the npm package accepted that workflow as
a trusted publisher. The final `PUT` failed because npm did not authorize the
publish principal for `demo-data-simulator`; the expected fix is the npm package
trusted-publisher configuration above. The package was then published manually,
so `0.2.0` is live and this runbook only affects future releases.

## Release Checklist

1. Confirm the npm trusted publisher settings above are present and approved.
2. Confirm the package version in `package.json` has not already been published:
   `npm view demo-data-simulator version`.
3. Run local gates:
   `npm run check`, `npm run smoke:scenario-proof`, and `npm pack --dry-run`.
4. Create and push the `vX.Y.Z` tag from the reviewed release commit.
5. Watch the `Publish to npm` workflow.
6. After the workflow succeeds, verify from a clean directory:
   `npx demo-data-simulator --help`.

Do not publish a new npm version or change npm package/account settings without
Orcun approval.

References:

- npm trusted publishing:
  https://docs.npmjs.com/trusted-publishers/
- npm provenance:
  https://docs.npmjs.com/generating-provenance-statements/
