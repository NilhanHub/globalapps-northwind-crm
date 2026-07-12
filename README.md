# Northwind CRM

Northwind is a relationship-intelligence CRM for turning trusted mutual contacts into warm introductions. It is a typed React application with an authenticated Node API, Firestore production persistence and conflict-safe JSON development persistence.

Maintainers and AI agents should start with the [canonical documentation map](docs/README.md) and [AI agent handbook](docs/AI_AGENT_HANDBOOK.md). They distinguish normative guidance, operational runbooks, current limitations, dated status and historical lessons.

## Architecture

- `apps/web` — React, Vite and TypeScript product UI.
- `apps/api` — Fastify HTTP, authentication, security controls and static delivery.
- `packages/domain` — storage-independent entities, schemas and business rules.
- `packages/api-client` — typed fetch client and structured errors.
- `packages/ui` — design tokens and accessible shared components.
- `infra/google-cloud` — Singapore Firestore, backup, IAM, scheduler and budget infrastructure.
- `data` — ignored local JSON copies used for development and cloud migration.
- `server.js` and `public` — preserved compatibility implementation; the workspace app is authoritative.

Every record is scoped by `workspaceId`. Missing values normalize to `default`, so the existing dataset requires no destructive migration. Domain services do not depend on the current shared-login provider or persistence adapter. Production uses Firestore as its single source of truth; browsers never access Firestore directly.

## Local setup

Requires Node.js 22. The exact major version is recorded in `.node-version` and enforced by `package.json`.

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

Open `http://127.0.0.1:8787`. Production startup deliberately fails when `CRM_USERNAME` or both password-hash settings are absent. Local environments normally use `CRM_PASSWORD_SCRYPT`; Hostinger uses its base64 encoding in `CRM_PASSWORD_SCRYPT_BASE64`.

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
npm run data:migrate:firestore dry-run the JSON-to-Firestore migration
npm run data:migrate:firestore:apply apply and verify the cloud migration
npm run doctor       sanitized runtime, environment and port readiness report
npm run verify       format, lint, typecheck and automated tests
npm run verify:release verify plus emulator, build and Playwright journeys
npm run data:integrity read-only repository relationship and duplicate audit
npm run data:export:firestore timestamped Firestore export with IDs and hashes
npm run data:verify-export validate an export's schema, hashes and relationships
npm run data:migrate:owners idempotently seed owner profiles and map existing routes
npm run data:migrate:query-keys idempotently fill normalized Firestore paging/search keys
npm run ops:footprint report deploy files, bytes, caches and threshold usage
npm run docs:check validate documentation links, structure and canonical sources
npm run backup:hostinger:run create and retain a validated encrypted backup
npm run backup:hostinger:status report backup count, age and filenames
npm run backup:generate-trigger create a private 256-bit trigger at an explicit absolute path outside the repository and print only its hash
npm run backup:generate-keys create the one-time RSA-4096 recovery key pair at an explicit absolute directory outside the repository
npm run backup:verify validate an encrypted backup envelope and checksum
npm run backup:decrypt decrypt a backup with a temporarily supplied private key
npm run backup:restore:validate validate IDs, hashes and relationships after decryption
npm run backup:restore:firestore restore safely into an explicit named temporary Firestore database
```

## Security model

This release uses one shared account. It is an access gate, not user isolation. Sessions store only hashed tokens in Firestore, use browser-session cookies, slide to 16 hours after activity, and require per-session CSRF tokens. Production cookies are `HttpOnly`, `SameSite=Strict` and `Secure`. Desktop agents use `Authorization: Bearer <CRM_AGENT_TOKEN>` and may provide a sanitized `X-Agent-Name`.

Do not commit `.env`, service-account material, agent tokens, session files or generated data. See [SECURITY.md](SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_RECOVERY.md](docs/DATA_RECOVERY.md), [docs/HOSTINGER_DEPLOYMENT.md](docs/HOSTINGER_DEPLOYMENT.md), [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) and [docs/DEPENDENCY_EXCEPTIONS.md](docs/DEPENDENCY_EXCEPTIONS.md).

Current cloud provisioning and cutover status is recorded in [docs/CLOUD_STATUS.md](docs/CLOUD_STATUS.md).

## Data safety

Migration never deletes the root stores. Firestore writes are transactional, records carry optimistic versions and stale writes return `409`. Daily and weekly managed backups are complemented by nightly private GCS exports and two encrypted Hostinger recovery archives. JSON remains the schema-validated local adapter. Archive is distinct from Won/Dead and is reversible by operation ID.

Route owners are configurable workspace labels, not login identities. Shared in-app reminders use `Europe/London`; their snoozes are workspace-wide and audited. Large company, people, route and activity lists use opaque server cursors while the compatibility collection endpoints remain available for bounded maintenance work.

Normal releases never compare production to the obsolete root JSON seed. Use `data:integrity`, `data:export:firestore` and `data:verify-export` against current Firestore state. Research intake is dry-run first, provenance-aware, resumable and idempotent through `/imports`. Hostinger archive format 2 authenticates its metadata as well as its encrypted content; staging and production use isolated private directories and trigger tokens.

This repository is private and unlicensed. See [UNLICENSED](UNLICENSED).
