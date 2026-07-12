# AI agent handbook

This handbook is the operational starting point for an AI agent or human maintainer working on Northwind CRM. Read [the documentation map](README.md) first, then follow the most specific linked source. This document supplies workflow guardrails; it does not replace the architecture, API, security, deployment or recovery documents.

## Repository orientation

The workspace application is authoritative:

```text
apps/web -> packages/api-client -> apps/api -> packages/domain -> repository adapter
```

- `apps/web` contains the React, Vite and TypeScript product.
- `apps/api` contains Fastify routes, authentication, request context and static delivery.
- `packages/domain` contains storage-, HTTP- and UI-independent rules.
- `packages/api-client` contains typed client contracts; `packages/ui` contains shared UI primitives and tokens.
- `infra/google-cloud` contains reviewed Google Cloud infrastructure.
- Root `server.js`, root JSON stores and the legacy `public` frontend are compatibility surfaces. Preserve them unless a migration is explicitly approved; do not add new product behavior there by default.
- Firestore is the sole live production data store. JSON is for isolated development, migration, import and export workflows.

Begin with read-only orientation:

```powershell
git status --short
git branch --show-current
git log -1 --oneline
node --version
npm --version
npm run doctor
```

Then inspect `package.json`, the relevant schemas and tests, [Architecture](ARCHITECTURE.md), [API contracts](API.md), [Security policy](../SECURITY.md), and the task-specific runbook. Preserve unrelated working-tree changes.

## Source-of-truth discipline

Use the precedence defined in [the documentation map](README.md). In particular:

- Verify behavior in current code, shared schemas and tests instead of trusting a dated narrative.
- Treat [Cloud release status](CLOUD_STATUS.md) as a snapshot, not live proof.
- Use [Known issues](KNOWN_ISSUES.md) only for limitations that remain; use [Lessons learned](LESSONS_LEARNED.md) for resolved defects.
- Use current Firestore integrity and export commands for production verification. Do not compare a live workspace with historical root JSON seed data.
- Treat ignored local reports and screenshots as optional corroboration. A durable claim must point to a tracked test, script, workflow, commit or normative document.

## Identity, secrets and production boundaries

- `nilhan.dev@gmail.com` is the only approved human Google Cloud, Firebase, GitHub and Hostinger administrator. Before a cloud mutation, verify the active identity and selected project using the read-only checks in the [Hostinger deployment runbook](HOSTINGER_DEPLOYMENT.md). Stop on any mismatch, especially when multiple browser accounts are signed in.
- Never print, paste into documentation, commit or capture plaintext passwords, password hashes, bearer tokens, session or CSRF tokens, service-account material, private recovery keys, cookies or production data copies.
- Browser writes require session authentication and CSRF. Agent writes require the environment-supplied scoped bearer token. Audit actors and `workspaceId` come from authenticated request context, never a caller-supplied actor field.
- Inspect live external systems read-only first. A user request must explicitly authorize production data, cloud, hosting, DNS or repository mutations; authorization for a code change does not silently authorize a live mutation.
- Never expose Firebase Admin configuration to the browser, dual-write production data to JSON, copy production records into staging or use another human cloud identity as a workaround.

## Safe task workflows

### Code and architecture

1. Branch from the current `staging` head using the `codex/` prefix and confirm the working tree before editing.
2. Locate the existing domain rule and test seam. Add a failing regression test before changing behavior.
3. Keep business rules independent of Fastify, React, authentication providers and repository adapters.
4. Preserve `workspaceId` scope, optimistic versions, operation IDs for cascade restore and audited route actions for stage or outcome changes.
5. Update the relevant normative document, lesson, incident, ADR or known issue when the change alters maintained knowledge.

### UI and accessibility

1. Reproduce the issue locally or in isolated staging; automated experiments must never write to production.
2. Keep server-backed search, pagination and metrics authoritative. Do not derive workspace-wide claims from one loaded page.
3. Verify keyboard operation, focus restoration, reduced motion, accessible names and status announcements.
4. Check meaningful interactions, console health, failed requests and unintended overflow at the supported desktop, tablet and mobile widths.
5. Preserve the initial JavaScript budget and use existing lazy-loading boundaries.

### Data and imports

1. Start with `npm run data:integrity` in the explicitly selected repository environment.
2. Preview imports before applying them. Preserve deterministic identity, provenance, resumability and idempotent re-import behavior.
3. Use transactions and `If-Match` versions; do not bypass a `409 VERSION_CONFLICT` by silently overwriting the newer record.
4. Before a migration or production release, create a current Firestore export with `npm run data:export:firestore` and validate it with `npm run data:verify-export`.
5. Never delete historical root stores automatically or treat them as current production truth.

### Cloud and deployment

1. Follow only [the canonical Hostinger runbook](HOSTINGER_DEPLOYMENT.md). Confirm the approved Google identity, project, repository, branch and clean exact commit before any mutation.
2. Deploy the candidate to the isolated staging application first. Staging uses deterministic fictitious data and a separate Firebase project.
3. Require the staging CI `secrets`, `verify` and `staging-live` jobs to pass for that exact SHA.
4. Promote with the manual `Promote staging to production` workflow. It revalidates the `staging` head and atomically fast-forwards `main`; do not push directly to `main`.
5. Confirm production `/api/health` reports ready, Firestore and the promoted exact SHA. Treat a mismatch, missing asset, failed readiness response or unavailable rollback as a failed release.

Native private-branch protection is unavailable on the current GitHub plan and is an accepted limitation. The checked exact-SHA promotion workflow remains mandatory; do not attempt to work around the plan with weaker release procedures.

### Backup and recovery

1. Follow [Data migration and recovery](DATA_RECOVERY.md) and the backup section of the [Hostinger runbook](HOSTINGER_DEPLOYMENT.md).
2. A backup is successful only after schema, counts, relationships, canonical hashes, encrypted envelope and final checksum validation complete.
3. Never log a trigger token or place the RSA private recovery key on Hostinger. Supply the private key temporarily from the user's password manager only for decryption or restore validation.
4. Restore into an explicitly named temporary Firestore database first. Compare IDs, hashes and relationships and run read-only application checks before considering a production recovery.
5. A failed backup or restore must preserve existing valid archives and production data.

## Stop conditions before production mutation

Stop and report the precise blocker when any of these is true:

- The active human identity is not exactly `nilhan.dev@gmail.com`, the project/environment is ambiguous, or another signed-in account may receive the action.
- The working tree is unexpectedly dirty, branch history diverges, the requested SHA is not the current verified staging head, or the release cannot be rolled back.
- Required checks, current integrity/export validation, staging verification, readiness or backup freshness have failed or are unknown.
- A command would expose a secret, private key, credential, session, production record or unsanitized evidence.
- A production write would bypass CSRF, scoped agent authentication, optimistic concurrency, repository transactions or audit history.
- Recovery would target production before a validated temporary-database restore.

Do not relax these boundaries to make a release appear complete.

## Verification tiers

Use the smallest tier that fully covers the change, then escalate when a boundary is touched:

- Documentation-only: `npm run docs:check` and `npm run format:check`.
- Code or behavior: `npm run verify`, plus the relevant focused test while developing.
- UI: code checks plus `npm run build`, Playwright, responsive/accessibility inspection, console health and one meaningful interaction.
- Repository, Firestore, authentication, release, backup or recovery boundary: `npm run verify:release`, current integrity/export verification and the applicable staging runbook checks.

Run the existing secret scan before handoff. Do not use `npm audit fix --force`; follow [Dependency exceptions](DEPENDENCY_EXCEPTIONS.md) for reviewed temporary risk.

## Handoff and maintained knowledge

Before handing work back:

- Report the outcome first, then tests, live-versus-local status, changed files and any precise blocker.
- Confirm the working tree and branch deliberately. Never discard unrelated user changes.
- Link claims to tracked tests, scripts, workflows or commits. Keep generated verification artifacts ignored and sanitized.
- Record a resolved recurring defect in [Lessons learned](LESSONS_LEARNED.md), a material failure in an [incident report](incidents/README.md), an enduring decision in an [ADR](adr/README.md), and a still-current limitation in [Known issues](KNOWN_ISSUES.md).
- Use [Troubleshooting](TROUBLESHOOTING.md) to preserve symptom-led recovery guidance without duplicating normative rules.

If the correct classification is unclear, consult [the documentation map](README.md) rather than creating another source of truth.
