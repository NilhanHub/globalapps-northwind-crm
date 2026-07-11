# ADR 0005: Future authentication and database adapters

Status: accepted.

HTTP, authentication, domain services and repositories remain separate boundaries. A future identity provider will supply per-user request contexts; a future PostgreSQL repository may replace Firestore if scale or query requirements justify it. Neither change may alter route, archive, merge, import or audit semantics.
