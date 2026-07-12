# ADR 0005: Future authentication and database adapters

## Status

Accepted.

## Context

The current shared login and Firestore repository meet the small-team release, but future identity, authorization, scale or query requirements may justify different adapters.

## Decision

Keep HTTP, authentication, domain services and repositories as separate boundaries. A future identity provider supplies per-user request contexts; a future database adapter implements the workspace-scoped repository contract. Neither replacement may alter route, archive, merge, import or audit semantics.

## Consequences

Some adapter translation code is retained today in exchange for a controlled future migration path. New business rules belong in domain services rather than Fastify, React, Firestore or authentication implementations.

## Verification

Run `npm run typecheck`, `npm run test:unit` and repository tests after boundary changes. Review dependency direction against `docs/ARCHITECTURE.md`.

## References

- [Architecture](../ARCHITECTURE.md)
- [Shared authentication ADR](0001-shared-authentication.md)
- [Firestore repository ADR](0002-firestore-repository.md)
