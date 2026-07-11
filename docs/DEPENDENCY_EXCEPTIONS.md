# Dependency exceptions

## Firebase CLI transitive moderate advisories

- Recorded: 2026-07-11
- Review by: 2026-08-10, then weekly until resolved
- Scope: development-only `firebase-tools` transitive packages (`@opentelemetry/core` and `uuid` through Google tooling)
- Production audit: zero known vulnerabilities with `npm audit --omit=dev`
- Decision: do not use `npm audit fix --force`; its proposed downgrade is breaking and would weaken the reviewed emulator/deployment toolchain.
- Control: CI fails on any high or critical full-tree advisory, Dependabot checks weekly against `staging`, and the exception is removed when a compatible Firebase CLI release or tested non-breaking override is available.
