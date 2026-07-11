# ADR 0002: Firestore production repository

Status: accepted.

Firestore is the sole production source of truth. Browsers never connect directly; Fastify owns authentication, CSRF, validation, optimistic versions, audit actors and transactions. JSON remains an isolated development and import/export adapter. Repository interfaces remain workspace-scoped so another database can be introduced without moving business rules into HTTP or storage code.
