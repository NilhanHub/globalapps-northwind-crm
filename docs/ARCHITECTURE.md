# Architecture

Northwind is a workspace monorepo. HTTP, authentication, storage and UI are adapters around `packages/domain`.

```text
React web -> typed API client -> Fastify routes -> request context -> domain rules -> repository interface -> Firestore
```

`RequestContext { actor, authType, workspaceId, requestId }` crosses the API boundary. Domain code never reads cookies or environment variables. Firestore is the production adapter and JSON is retained for isolated development and migration. `AuthProvider` similarly isolates shared login from a future OIDC or managed identity provider.

Fastify registration is divided into focused import, maintenance, owner, pagination and reminder modules. Storage migrations and encrypted-backup operations live in services that depend only on repository contracts and domain schemas, so they can be verified against JSON and the Firestore emulator without starting HTTP.

Production data lives beneath `workspaces/default/{companies,people,routes,activities,sessions,importJobs,owners,settings}` with a lightweight workspace revision document used for change detection. Only the Fastify server holds Google credentials; Firestore browser rules deny all direct access. Repository transactions reject stale versions before committing multi-record changes and increment the workspace revision atomically.

The legacy root server and static frontend remain as a compatibility reference until parity evidence is accepted. New development belongs in workspaces.

## Records and concurrency

Records normalize to workspace `default` and version `1`. Clients send `If-Match`; stale updates return `409 VERSION_CONFLICT`. Stage and outcome changes use audited route actions rather than raw patches.

Company and person identity keys are normalized in the domain layer. Company renames update cached company names on related people and routes in one repository transaction. Research imports use source hashes, deterministic IDs and persisted import jobs so interrupted jobs can resume and identical research can be previewed or applied without duplicate writes.

## Authentication and automation

Browser writes require a session-derived CSRF token. Agent access uses rotatable bearer tokens with key IDs and separate read/write permissions; raw tokens are hashed at startup and never persisted in records. Audit actors and workspace scope always come from authenticated request context, not browser payloads.

Owner profiles are workflow configuration and deliberately remain independent of authentication. Reminder categories are derived on the server in `Europe/London`; snooze state lives on the route because the shared login means the entire workspace sees the same reminder state.

Interactive lists use repository cursor queries with a deterministic field plus document ID ordering. Full `list()` remains available only for bootstrap compatibility, exports, migrations and bounded integrity operations. Metrics are derived server-side so loading one page cannot distort workspace totals.

## Deployment boundary

The API serves the production web build and binds to Hostinger's assigned interface. Hostinger TLS is the public boundary at `crm.globalapps.world`. Firestore is the only production data store. Secrets live in Hostinger environment configuration, while sessions and primary backup metadata live in Google Cloud. A nightly Hostinger cron invokes a separately authenticated maintenance endpoint that creates a public-key-encrypted recovery archive outside the deployment and public directories.
