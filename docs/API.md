# API

All endpoints except health and login require a session or scoped agent bearer token. Browser mutations also require `X-CSRF-Token`. Errors use `{ "error": { "code", "message", "fieldErrors", "requestId" } }`.

Core reads: `GET /api/health`, `/api/auth/session`, `/api/bootstrap`, `/api/companies`, `/api/people`, `/api/routes`, and `/api/activities`. Collection reads accept `includeArchived=true` where applicable.

Operational reads: `GET /api/live`, `/api/ready`, `/api/workspace/revision` and authenticated `/api/diagnostics`. Health responses expose only release version, commit, build time, repository type and readiness.

Authenticated `GET /api/openapi.json` is generated from the shared contract registry in `packages/api-client`.

Core writes:

- `POST /api/auth/login`, `/api/auth/logout`
- `POST /api/companies`, `/api/people`, `/api/routes`, `/api/activities`
- `PATCH /api/companies/:id`, `/api/people/:id`, `/api/routes/:id` with `If-Match`
- `POST /api/{companies|people|routes}/:id/{archive|restore}`
- `POST /api/people/merge`
- `POST /api/routes/bulk/actions`
- `POST /api/routes/:id/actions`
- `POST /api/routes/:id/actions/:activityId/undo`
- `POST /api/imports/research/preview`
- `POST /api/imports/research`
- `GET /api/imports/:id`
- `POST /api/imports/:id/resume`

Won and Dead require a reason. Undo applies only to the latest reversible mutation within five minutes, survives refresh and appends history instead of deleting it. `reset` is an audited individual or bulk route action that preserves research and history. Active duplicate target-mutual routes return `409`.

Research preview accepts up to 40 `.eml` or `.csv` source payloads, reports creates, aliases, conflicts and omissions, and writes nothing. Commit records an `ImportJob`; a repeated import produces no duplicate CRM records or unnecessary CRM updates.
