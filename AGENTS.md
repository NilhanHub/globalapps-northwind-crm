# Northwind repository instructions

The workspace application under `apps/` and `packages/` is authoritative. Preserve the root JSON stores and legacy server compatibility unless a migration is explicitly approved.

- Keep domain rules independent of Fastify, React, authentication and JSON persistence.
- Scope repositories and request contexts by `workspaceId`; normalize missing historical values to `default`.
- Add a failing test before behavior changes. Run format, lint, typecheck, unit/integration/legacy tests, build and Playwright before completion.
- Never print or commit plaintext passwords, password hashes, agent tokens, sessions, data copies or evidence output.
- Browser writes require CSRF. Agent writes require the environment-supplied bearer token. Audit actors always come from request context.
- Use audited route actions for stage/outcome changes, operation IDs for cascade restore, and `If-Match` for optimistic updates.
- Keep evidence under ignored `Evidence/`; verify final archives by extraction.

See `README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA_RECOVERY.md` and `SECURITY.md` before changing boundaries.
