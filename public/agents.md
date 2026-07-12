# Northwind desktop-agent API access

> Compatibility guide: this file is for bearer-authenticated desktop API clients. It is not repository-maintenance or deployment guidance. Maintainers must start with the root `AGENTS.md` and `docs/README.md`; the current endpoint contract is `docs/API.md`.

Northwind requires authentication. Desktop agents must receive a scoped token through `CRM_AGENT_TOKEN`; never place it in a payload, URL, source file or log.

```text
Authorization: Bearer <token>
X-Agent-Name: Atlas
Content-Type: application/json
```

The server derives the audit actor as `agent:<sanitized name>`. Do not send or trust `actor` or `createdBy` fields. Browser CSRF tokens do not apply to bearer-authenticated agents.

Read before writing: use `GET /api/bootstrap` or the collection endpoints and avoid duplicate active target-mutual routes. Records expose `version`; send the current value in `If-Match` for patches. A stale write returns `409`.

Supported compatibility collections are companies, people, routes and activities. Archive and restore use `POST /api/{companies|people|routes}/:id/{archive|restore}`. Archive requires a reason and retains history. Stage/outcome changes use `POST /api/routes/:id/actions`, not raw route patches. Won and Dead require a reason. Bulk scheduling uses `POST /api/routes/bulk/actions`. Owners, reminders, imports, pagination and search are documented only in the canonical `docs/API.md` to avoid duplicating a changing contract here.

Errors are shaped as `{ "error": { "code", "message", "fieldErrors", "requestId" } }`. Treat `400` as invalid input, `401` as missing/invalid token, `403` as forbidden origin/operation, `404` as missing record, and `409` as a version/dependency/duplicate conflict.

Permanent deletion is intentionally unavailable to desktop agents.
