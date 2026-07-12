# ADR 0002: Firestore production repository

## Status

Accepted.

## Context

Local JSON storage cannot provide resilient cloud availability or safe concurrent production writes. Browser access must still pass through the CRM's authentication, validation, audit and optimistic-concurrency boundaries.

## Decision

Use Firestore as the sole production source of truth behind workspace-scoped repository interfaces. Fastify owns authentication, CSRF, validation, audit actors, versions and transactions. Keep JSON only as an isolated development, migration and import/export adapter; deny direct browser Firestore access.

## Consequences

Production depends on Firestore availability and operator-managed recovery, while domain services remain independent of the storage adapter. Routine verification must inspect current Firestore rather than compare it with historical root JSON seeds.

## Verification

Run `npm run data:integrity`, `npm run data:export:firestore` and `npm run data:verify-export` in the approved environment. Use the Firestore emulator tests before repository changes.

## References

- [Architecture](../ARCHITECTURE.md)
- [Data migration and recovery](../DATA_RECOVERY.md)
- [Known issues](../KNOWN_ISSUES.md)
