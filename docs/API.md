# API

All endpoints except health and login require a session or scoped agent bearer token. Browser mutations also require `X-CSRF-Token`. Errors use `{ "error": { "code", "message", "fieldErrors", "requestId" } }`.

Core reads: `GET /api/health`, `/api/auth/session`, `/api/bootstrap`, `/api/companies`, `/api/people`, `/api/routes`, and `/api/activities`. Collection reads accept `includeArchived=true` where applicable.

Core writes:

- `POST /api/auth/login`, `/api/auth/logout`
- `POST /api/companies`, `/api/people`, `/api/routes`, `/api/activities`
- `PATCH /api/companies/:id`, `/api/people/:id`, `/api/routes/:id` with `If-Match`
- `POST /api/{companies|people|routes}/:id/{archive|restore}`
- `POST /api/people/merge`
- `POST /api/routes/bulk/actions`
- `POST /api/routes/:id/actions`
- `POST /api/routes/:id/actions/:activityId/undo`

Won and Dead require a reason. Undo applies only to the latest reversible mutation within 30 seconds and appends history instead of deleting it. Active duplicate target-mutual routes return `409`.
