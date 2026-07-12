# Northwind repository instructions

## Start here

The workspace application under `apps/` and `packages/` is authoritative. Root JSON stores, `server.js` and the legacy `public` frontend are compatibility surfaces; preserve them unless a migration is explicitly approved. Read the [documentation map](docs/README.md) and [AI agent handbook](docs/AI_AGENT_HANDBOOK.md) before changing a system boundary.

Begin read-only with `git status --short`, the current branch and commit, `package.json`, relevant schemas/tests and `npm run doctor`. Keep local and production state distinct. Before any production mutation, verify the exact `nilhan.dev@gmail.com` identity, Google project, clean exact staging SHA, passing checks and rollback path; stop on any mismatch.

- Keep domain rules independent of Fastify, React, authentication and JSON persistence.
- Scope repositories and request contexts by `workspaceId`; normalize missing historical values to `default`.
- Add a failing test before behavior changes. Use `npm run docs:check` for documentation, `npm run verify` for code and `npm run verify:release` plus browser proof for UI, data, authentication or release boundaries.
- Never print or commit plaintext passwords, password hashes, agent tokens, sessions, data copies or evidence output.
- Browser writes require CSRF. Agent writes require the environment-supplied bearer token. Audit actors always come from request context.
- Use audited route actions for stage/outcome changes, operation IDs for cascade restore, and `If-Match` for optimistic updates.
- Keep evidence under ignored `Evidence/`; verify final archives by extraction.
- Deploy to isolated staging first, then use the checked manual promotion workflow for that exact SHA. Do not push directly to `main`; native branch protection remains an accepted GitHub-plan limitation.

Use [Troubleshooting](docs/TROUBLESHOOTING.md) for symptoms, [Lessons learned](docs/LESSONS_LEARNED.md) for resolved defects, [ADRs](docs/adr/README.md) for enduring decisions and [Known issues](docs/KNOWN_ISSUES.md) only for limitations that remain. See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Data recovery](docs/DATA_RECOVERY.md) and [Security](SECURITY.md) for normative boundaries.

- The Bifrost Bridge (`aladdin-one-ring` MCP) routes to downstream MCPs via the `aladdin_one_ring` tool (`mode="execute"`, `server="<route>"`, `tool="<tool>"`, `arguments={...}`). The tool description and `server`/`mode` enums auto-list the currently-healthy routes at session start, so valid `server` values are visible without reading docs. See `docs/BIFROST_MCP.md` for the full working/broken route list. Prefer the direct `context7` and `playwright` MCPs over Bifrost for those two; use Bifrost only for MCPs opencode has no direct connection to.
