# Architecture decision records

ADRs record enduring technical choices and their consequences. They are normative for the decision they describe but do not replace current code, tests or operational runbooks.

## Status values

- Proposed: under review and not yet authoritative.
- Accepted: current decision.
- Superseded: replaced by another ADR, which must be linked.
- Deprecated: retained for history but no longer recommended.

## Required structure

Create the next zero-padded file `NNNN-short-title.md` with:

```markdown
# ADR NNNN: Decision title

## Status

## Context

## Decision

## Consequences

## Verification

## References
```

Do not renumber existing ADRs. Update an accepted ADR only to clarify its existing decision; use a new ADR to change or supersede it. Never include secrets, key identifiers, transient production counts or ignored evidence as required proof.

## Index

- [ADR 0001: Shared authentication boundary](0001-shared-authentication.md)
- [ADR 0002: Firestore production repository](0002-firestore-repository.md)
- [ADR 0003: Staging isolation](0003-staging-isolation.md)
- [ADR 0004: Research import identity](0004-import-identity.md)
- [ADR 0005: Future authentication and database adapters](0005-future-adapters.md)
- [ADR 0006: Embedded release identity and guarded promotion](0006-exact-sha-release-promotion.md)
- [ADR 0007: Encrypted Hostinger recovery boundary](0007-encrypted-hostinger-recovery.md)
