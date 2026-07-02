# Northwind CRM

Northwind is a relationship-intelligence CRM for turning trusted mutual contacts into warm introductions. It is a typed React application with an authenticated Node API and conflict-safe JSON persistence.

## Architecture

- `apps/web` — React, Vite and TypeScript product UI.
- `apps/api` — Fastify HTTP, authentication, security controls and static delivery.
- `packages/domain` — storage-independent entities, schemas and business rules.
- `packages/api-client` — typed fetch client and structured errors.
- `packages/ui` — design tokens and accessible shared components.
- `data` — ignored local JSON copies created by the migration command.
- `server.js` and `public` — preserved compatibility implementation; the workspace app is authoritative.

Every record is scoped by `workspaceId`. Missing values normalize to `default`, so the active local dataset requires no destructive migration. Domain services do not depend on the current shared-login provider or JSON repository adapter.

## Local setup

Requires Node.js 20 or newer.

```powershell
npm ci
$env:CRM_PASSWORD_PLAINTEXT = 'choose-a-long-password'
$env:CRM_PASSWORD_SCRYPT = npm run auth:hash-password --silent
Remove-Item Env:CRM_PASSWORD_PLAINTEXT
$env:CRM_USERNAME = 'northwind'
npm run data:migrate
npm run build
npm start
```

Open `http://127.0.0.1:8787`. Production startup deliberately fails when `CRM_USERNAME` or `CRM_PASSWORD_SCRYPT` is absent.

## Commands

```text
npm run dev          API and Vite development servers
npm run build        production builds for every workspace
npm run typecheck    strict TypeScript checks
npm run lint         ESLint quality checks
npm run format:check Prettier verification
npm test             unit, integration and compatibility suites
npm run test:e2e     Playwright smoke journeys
npm run data:migrate idempotently copy and validate root stores into data/
```

## Security model

This release uses one shared account. It is an access gate, not user isolation. Sessions store only hashed tokens, browser mutations require per-session CSRF tokens, and production cookies are `HttpOnly`, `SameSite=Strict` and `Secure`. Desktop agents use `Authorization: Bearer <CRM_AGENT_TOKEN>` and may provide a sanitized `X-Agent-Name`.

Do not commit `.env`, agent tokens, session files or generated data. See [SECURITY.md](SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA_RECOVERY.md](docs/DATA_RECOVERY.md).

## Data safety

Migration never deletes the four root stores. JSON mutations are serialized, schema-validated and atomically journaled; records carry optimistic versions and stale writes return `409`. Archive is distinct from Won/Dead and is reversible by operation ID.

This repository is private and unlicensed. See [UNLICENSED](UNLICENSED).
