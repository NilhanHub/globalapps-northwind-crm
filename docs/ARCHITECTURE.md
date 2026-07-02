# Architecture

Northwind is a workspace monorepo. HTTP, authentication, storage and UI are adapters around `packages/domain`.

```text
React web -> typed API client -> Fastify routes -> request context -> domain rules -> repository interface -> JSON adapter
```

`RequestContext { actor, authType, workspaceId, requestId }` crosses the API boundary. Domain code never reads cookies or environment variables. JSON is the active local adapter; a future database adapter can implement the same workspace-scoped operations without changing product workflows. `AuthProvider` similarly isolates shared login from a future OIDC or managed identity provider.

The legacy root server and static frontend remain as a compatibility reference until parity evidence is accepted. New development belongs in workspaces.

## Records and concurrency

Records normalize to workspace `default` and version `1`. Clients send `If-Match`; stale updates return `409 VERSION_CONFLICT`. Stage and outcome changes use audited route actions rather than raw patches.

## Deployment boundary

The API serves the production web build and binds to loopback by default. Nginx or another TLS reverse proxy is the public boundary. Data, secrets, sessions and logs must live outside the repository in deployment.
