# ADR 0006: Embedded release identity and guarded promotion

## Status

Accepted.

## Context

Hostinger deploys tracked repository content, omits untracked sidecars and normalizes the npm lockfile during its managed install. The current GitHub plan does not provide native private-branch protection, while production must still receive exactly the staging-tested commit without a validation/push race.

## Decision

Derive release identity from Git at build time and embed SHA, build time and tree classification into the compiled API. Permit only the tested `package-lock.json` normalization. Require the exact successful staging push run, revalidate both branch heads and promote `main` and `staging` in one atomic lease-protected push; then wait for production to serve that SHA.

## Consequences

Staging correctly fails closed when Hostinger behavior or repository state differs from the reviewed contract. Releases depend on the guarded workflow until native branch protection is available. Administrators must not push directly to `main`.

## Verification

Run `npm run verify:release` and `npm run verify:artifacts`, then use the read-only live-release verifier against staging. The promotion workflow must reference a successful staging run and production health must report the same full SHA.

## References

- [INC-001](../incidents/INC-001-hostinger-release-verification.md)
- [Hostinger deployment runbook](../HOSTINGER_DEPLOYMENT.md#release-and-rollback)
- [Promotion workflow](../../.github/workflows/promote-production.yml)
- [`scripts/release-build-state.mjs`](../../scripts/release-build-state.mjs)
