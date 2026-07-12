# API

All endpoints except health and login require a session or scoped agent bearer token. Browser mutations also require `X-CSRF-Token`. Errors use `{ "error": { "code", "message", "fieldErrors", "requestId" } }`.

Core reads: `GET /api/health`, `/api/auth/session`, `/api/bootstrap`, `/api/companies`, `/api/people`, `/api/routes`, and `/api/activities`. Collection reads accept `includeArchived=true` where applicable.

Paginated reads use opaque query-bound cursors and return `{ items, nextCursor, hasMore }`: `GET /api/companies/page`, `/api/people/page`, `/api/routes/page` and `/api/activities/page`. The default page size is 50 and the maximum is 100. `GET /api/search` performs normalized prefix search and `GET /api/routes/metrics` derives workspace-wide metrics independently of the loaded page.

Operational reads: `GET /api/live`, `/api/ready`, `/api/workspace/revision` and authenticated `/api/diagnostics`. Health responses expose release version, commit, build time, repository type, sanitized Firestore database ID, application readiness and a sanitized backup state/count/age summary. Production commit and build time come only from the generated clean-checkout release artifact; production fails closed if that artifact is absent or invalid. Backup warnings remain advisory so a recovery-system failure cannot take the CRM itself offline.

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
- `GET|POST /api/owners`
- `PATCH /api/owners/:id` with `If-Match`
- `POST /api/owners/:id/deactivate`
- `GET /api/reminders`
- `GET /api/diagnostics/backups`
- `POST /api/maintenance/backups/run` with a generated 256-bit dedicated backup trigger token

Won and Dead require a reason. Undo applies only to the latest reversible mutation within five minutes, survives refresh and appends history instead of deleting it. `reset` is an audited individual or bulk route action that preserves research and history. Active duplicate target-mutual routes return `409`.

Route actions also accept `snooze_reminder` and `clear_reminder_snooze`. Snoozes last from one hour to 30 days, are shared by the workspace and never alter route workflow state. Owner deactivation atomically reassigns active routes to the selected active replacement and appends audit activity.

Research preview accepts up to 40 `.eml` or `.csv` source payloads, reports creates, aliases, conflicts and omissions, and writes nothing. Commit records an `ImportJob`; a repeated import produces no duplicate CRM records or unnecessary CRM updates.
