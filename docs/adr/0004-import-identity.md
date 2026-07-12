# ADR 0004: Research import identity

## Status

Accepted.

## Context

Repeated or interrupted research imports can create duplicate companies, people and routes unless identities and provenance remain stable across runs. Historical contact notes must not silently imply workflow progress.

## Decision

Identify companies by normalized name, people by normalized LinkedIn identity or normalized name plus company scope, and routes by target-mutual identity. Persist source hashes and provenance, make preview read-only, and make commit resumable and idempotent. Import historical notes as history without advancing route stage.

## Consequences

Conflicting identities require explicit resolution, while identical imports become safe no-ops. Import services must preserve source references and deterministic identities across repository adapters.

## Verification

Run `npm run verify` and the research-import tests in `apps/api/src/services/research-import.test.ts`. An identical second import must create no duplicate or unnecessary record.

## References

- [Architecture](../ARCHITECTURE.md)
- [API](../API.md)
- [Data migration and recovery](../DATA_RECOVERY.md)
