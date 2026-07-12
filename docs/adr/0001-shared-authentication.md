# ADR 0001: Shared authentication boundary

## Status

Accepted for the small-team release.

## Context

Northwind needs a secure access gate for a small group, but the current release does not provide individual user accounts, roles or per-person audit identity. Domain behavior must not become coupled to this temporary authentication choice.

## Decision

Use one shared credential through the `AuthProvider` boundary. Derive actor, authentication type, workspace and request ID in `RequestContext`; domain services must never read cookies, credentials or browser-supplied actor fields.

## Consequences

The CRM cannot reliably identify which friend performed an action. A future identity provider can supply individual request contexts without changing domain rules, repositories or route-action semantics.

## Verification

Run `npm run verify` and the authentication tests under `apps/api/src/auth/`. Confirm current limitations remain documented in `docs/KNOWN_ISSUES.md`.

## References

- [Authentication overview](../../AUTH.md)
- [Security policy](../../SECURITY.md)
- [Architecture](../ARCHITECTURE.md)
