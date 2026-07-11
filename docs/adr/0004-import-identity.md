# ADR 0004: Research import identity

Status: accepted.

Research imports identify companies by normalized name, people by normalized LinkedIn identity or normalized name and company scope, and routes by target-mutual identity. Every source carries a hash and provenance reference. Preview is read-only; commit is resumable and idempotent. Historical contact notes create history without silently advancing route stage.
