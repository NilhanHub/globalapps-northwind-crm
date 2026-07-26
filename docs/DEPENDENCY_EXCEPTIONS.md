# Dependency exceptions

Temporary dependency exceptions are executable policy, not blanket suppressions. The canonical
machine-readable policy is [`config/dependency-audit-exceptions.json`](../config/dependency-audit-exceptions.json),
and `npm run audit:dependencies` validates it against the installed lockfile, `npm ls --all`, the
production-only npm audit and the full npm audit.

## Active exception: Firestore `google-gax` transitive cleanup-tool advisory

- Recorded: 2026-07-26
- Review by: 2026-08-10, then weekly until resolved
- Direct dependency: production `@google-cloud/firestore@8.7.0` in `apps/api`
- Advisory: `GHSA-mh99-v99m-4gvg`
- Observed chain: `@google-cloud/firestore` → `google-gax@5.0.8` → `rimraf@5.0.10` →
  `glob@10.5.0` → `minimatch@9.0.9` → `brace-expansion@2.1.2`

`google-gax@5.0.8` declares `rimraf`, but the shipped `google-gax` JavaScript package does not import
or execute it. `rimraf` is a file-removal helper, and the vulnerable brace-expansion path is not part
of CRM request handling or Firestore document reads/writes.

Rejected alternatives:

- `@google-cloud/firestore@7.11.6` was tested in a disposable project and reintroduced direct
  Firestore plus UUID-related moderate production advisories.
- Cross-major `rimraf@6` overrides made `npm ls` report an invalid dependency tree.
- `google-gax@6.0.1-experimental` is outside Firestore's supported dependency range and is not a
  reviewed stable remediation.
- `npm audit fix --force` remains prohibited.

Removal condition: remove this exception immediately when Google publishes a compatible stable
Firestore/google-gax release that no longer pulls the `rimraf@5` chain, or when the repository adapter
is replaced and the complete release suite passes without the exception.

## Retired installed exception: Firebase CLI development advisories

The CRM no longer installs `firebase-tools` in the root npm tree. Firestore emulator tests prefer the
Google Cloud SDK emulator. On machines where the Cloud SDK Firestore emulator component is not
installed and cannot be added without elevation, the runner uses exact ephemeral
`firebase-tools@15.24.0` through `npx` as a fallback. That fallback is not committed to
`package.json` or `package-lock.json`, and production installs do not include it.

The earlier installed Firebase CLI UUID and OpenTelemetry exceptions were retired on 2026-07-26 and
must not be reintroduced unless a future change deliberately restores Firebase CLI to this repository
and repeats the full reachability review.

## Controls and removal conditions

- `npm run audit:dependencies` fails on unapproved advisories, package-chain drift, version/path
  drift, expiry, malformed policy or an invalid npm tree.
- Production advisories require an explicit production-scope exception, exact nodes, explicit
  high-severity approval and a runtime-reachability rationale.
- Dependabot checks weekly against `staging`.
- Remove an exception immediately when the corresponding advisory disappears; a stale exception is
  itself a gate failure.
- Accept a replacement only when it is an upstream-compatible release or a semver-valid override that
  passes `npm ls`, the emulator suite and the complete release verification.

## TypeScript 7 compatibility hold

- Recorded: 2026-07-15
- Review cadence: weekly through Dependabot and the dependency-watch workflow
- Current compiler: `typescript@6.0.3`
- Blocking peer: `typescript-eslint@8.64.0` supports TypeScript versions below 6.1
- Decision: ignore only TypeScript `>=7.0.0 <8.0.0`; continue accepting compatible TypeScript 6.x updates

The TypeScript 7 pull request fails during `npm ci` because the reviewed lint stack does not declare a
compatible peer range. Do not use `legacy-peer-deps`, cross-major overrides or forced audit fixes to
hide this invalid tree. Remove the exact Dependabot hold when TypeScript-ESLint publishes supported
TypeScript 7 compatibility and the clean install, lint, typecheck, emulator and release suites pass.

The scheduled Monday 06:00 UTC dependency watch does not install the registry's latest Firebase CLI as
a repository dependency. It validates the reviewed npm tree and the executable exception policy, then
reports the current controlled exception status. The 10 August 2026 deadline may be extended only by a
reviewed pull request with refreshed reachability analysis, for no more than 30 days.
