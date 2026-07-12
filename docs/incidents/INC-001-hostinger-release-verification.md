# INC-001: Hostinger release verification failures

Date: 2026-07-12
Status: Resolved

## Impact

Two strict staging release attempts failed closed. Production remained on its previous healthy release, but promotion could not proceed until the deployed artifact could prove its exact source commit and clean build classification.

## Detection

The staging live-release gate compared the requested Git SHA with `/api/health` and rejected missing or untrustworthy embedded release information. The next attempt rejected the build as dirty.

## Timeline

- The first attempt showed that Hostinger did not preserve an untracked release-metadata sidecar.
- Release SHA, build time and tree classification were moved into the compiled API bundle and artifact verification.
- The second attempt showed that Hostinger's managed install normalizes `package-lock.json` before building.
- The build classifier was narrowed to permit only that tested path while rejecting every other tracked change.
- Promotion was strengthened to require the exact successful staging run, use an atomic lease-protected push and wait for production to serve the approved SHA.

## Root cause

The original release proof assumed deployment behavior that Hostinger does not guarantee: preservation of an untracked sidecar and a byte-identical lockfile after its managed install. Separate validation and push steps also needed protection against branch movement.

## Resolution

Embed Git-derived release identity in the compiled API, verify it before activation, classify only the known lockfile normalization as permitted drift, and promote `main` and `staging` atomically with explicit leases after exact-run validation.

## Guardrails

- Production fails closed without valid clean embedded metadata.
- CI verifies staging Firestore readiness, backup state, no-store responses and fingerprinted assets for the exact SHA.
- The promotion workflow rechecks both branch heads immediately before its atomic push.
- Any tracked drift outside `package-lock.json` remains fatal.

## Verification

Run `npm run verify:release`, `npm run verify:artifacts` and the read-only live-release verifier. Compare the full served SHA with the approved staging SHA before promotion.

## References

- Commits `5833e0b`, `e23e78e`, `3bbedf5` and `06f026f`
- [`scripts/verify-build-artifacts.mjs`](../../scripts/verify-build-artifacts.mjs)
- [`scripts/release-build-state.mjs`](../../scripts/release-build-state.mjs)
- [Promotion workflow](../../.github/workflows/promote-production.yml)
- [ADR 0006](../adr/0006-exact-sha-release-promotion.md)
