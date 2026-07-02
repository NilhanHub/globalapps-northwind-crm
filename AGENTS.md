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

- The Bifrost Bridge (`aladdin-one-ring` MCP) routes to downstream MCPs via the `aladdin_one_ring` tool (`mode="execute"`, `server="<route>"`, `tool="<tool>"`, `arguments={...}`). The tool description and `server`/`mode` enums auto-list the currently-healthy routes at session start, so valid `server` values are visible without reading docs. See `docs/BIFROST_MCP.md` for the full working/broken route list. Prefer the direct `context7` and `playwright` MCPs over Bifrost for those two; use Bifrost only for MCPs opencode has no direct connection to.
