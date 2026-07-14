# Dependency exceptions

Temporary dependency exceptions are executable policy, not blanket suppressions. The canonical
machine-readable policy is [`config/dependency-audit-exceptions.json`](../config/dependency-audit-exceptions.json),
and `npm run audit:dependencies` validates it against the installed lockfile and both production-only
and full-tree npm audits.

## Firebase CLI transitive moderate advisories

- Recorded: 2026-07-11
- Review by: 2026-08-10, then weekly until resolved
- Direct dependency: development-only `firebase-tools@15.23.0`
- Production audit: zero known vulnerabilities; production exposure always fails the gate
- Decision: do not downgrade Firebase CLI or use `npm audit fix --force`. Disposable installation
  checks showed that the suggested downgrade retains the affected chain and introduces additional
  findings. Cross-major overrides made `npm ls` report an invalid tree.

### `GHSA-w5hq-g745-h8pq` — UUID buffer bounds

The audit propagates this advisory through `uuid@9.0.1`, `gaxios@6.7.1` and `firebase-tools`.
The advisory affects UUID `v3`, `v5` and `v6` when caller-supplied buffers or offsets are out of
bounds. The reviewed Firebase CLI path calls `uuid.v4()` to construct a multipart boundary. This
reduces practical reachability but does not mean the upstream package is patched.

### `GHSA-8988-4f7v-96qf` — OpenTelemetry baggage allocation

The audit propagates this advisory through `@opentelemetry/core@1.30.1`,
`@google-cloud/pubsub@5.3.1` and `firebase-tools`. The path belongs to Firebase CLI Pub/Sub emulator
support. Northwind's production application does not ship Firebase CLI, and its automated database
tests use the Firestore emulator.

## Controls and removal conditions

- `npm run audit:dependencies` fails on production exposure, unapproved advisories, high or critical
  severity, package-chain drift, version/path drift, expiry, malformed policy or an invalid npm tree.
- Dependabot checks weekly against `staging`.
- Remove an exception immediately when the corresponding advisory disappears; a stale exception is
  itself a gate failure.
- Accept a replacement only when it is an upstream-compatible release or a semver-valid override that
  passes `npm ls`, the emulator suite and the complete release verification.
