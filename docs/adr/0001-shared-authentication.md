# ADR 0001: Shared authentication boundary

Status: accepted for the small-team release.

Northwind uses one shared credential as an access gate. Domain services receive an authenticated request context and never depend on the shared-login implementation. This is deliberately temporary: it cannot identify which friend performed an action, so individual accounts and permissions can replace the auth provider without changing domain rules.
