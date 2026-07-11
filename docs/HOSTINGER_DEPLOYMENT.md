# Hostinger deployment runbook

Production is one same-origin Node application at `https://crm.globalapps.world`: Fastify serves the compiled React assets and `/api`. Firestore is the only live data store.

## Identity and prerequisites

- Perform every human Google Cloud, Firebase, billing, DNS and Hostinger action as `nilhan.dev@gmail.com`.
- Machine service accounts are allowed only inside the dedicated CRM project.
- Enable Blaze billing and apply `infra/google-cloud` before migration.
- Never place credentials in Git, build logs, screenshots or evidence archives.

Before any cloud mutation, confirm:

```powershell
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud config get-value project
```

The results must be `nilhan.dev@gmail.com` and the selected CRM project ID. Stop if either differs.

## Hostinger application

1. In hPanel, create a Node.js Web App from the private GitHub repository.
2. Select Node 22.
3. Use the Fastify preset and npm package manager. Set `CRM_BUILD_ON_INSTALL=1` only in Hostinger so the conditional root `postinstall` builds once. Local and CI installs skip this build.
4. Set the entry file to `app.js`. It dynamically loads the compiled API at `apps/api/dist/index.js` while preserving the legacy root `server.js`.
5. Connect `crm.globalapps.world`, wait for Hostinger TLS provisioning, and verify HTTPS before attempting login.
6. Configure the environment keys from `.env.example`, including `NODE_ENV=production`, `CRM_REPOSITORY=firestore`, `CRM_CLOUD_OWNER_EMAIL=nilhan.dev@gmail.com`, Firebase settings, shared-login settings and `CRM_CORS_ORIGINS=https://crm.globalapps.world`.
7. Set `NPM_CONFIG_INCLUDE=dev` so Hostinger installs TypeScript, tsup and Vite. Verify the compiled API and web artifacts, then prune with `npm prune --omit=dev`; do not prune before the artifact check.
8. Set `PORT=3000`. The managed reverse proxy targets that application port; the API binds to `0.0.0.0` in production.
9. Set `CRM_PASSWORD_SCRYPT_BASE64` to the base64 encoding of the generated scrypt hash. Hostinger must use this value in preference to the raw dollar-delimited hash.

Create the runtime key only after verifying the active Google identity. Save it temporarily outside the repository, encode it for the Hostinger secret, then securely remove the temporary file. The runtime service account must have only `roles/datastore.user`. Record the key ID and creation date for rotation.

## Release and rollback

1. Run `npm run verify:release` on Node 22.
2. Run `npm run data:integrity`, create a current Firestore export and verify that export. The JSON migration command is not a production verification command.
3. Deploy the exact commit to `crm-staging.globalapps.world` and complete login, API, responsive, accessibility and reversible-write checks against staging seed data.
4. Promote that unchanged commit to production. Record `CRM_COMMIT_SHA`, `CRM_BUILD_TIME` and `CRM_APP_VERSION` in the Hostinger environment.
5. Verify `/api/live`, `/api/ready`, `/api/health`, login, bootstrap and a clearly labelled reversible test record.
6. Run `npm run ops:footprint` against reviewed Hostinger deployment paths. Retain three deployable releases, cap logs at 14 days and delete only documented caches.
7. If deployment fails before users resume work, redeploy the previous build. Firestore remains authoritative; never roll data back to the old JSON files.

## Staging boundary

`crm-staging.globalapps.world` is a separate Hostinger Node application and uses a separate Firebase project. It must never receive the production project ID or runtime credential. Only `nilhan.dev@gmail.com` is a human project member. Seed staging with deterministic fictitious companies and people; never copy production people, email files, sessions or activity text into staging.

The approved staging project ID is `globalapps-northwind-staging`. With the staging Firestore environment selected, run `npm run data:seed:staging`; the command refuses every other project ID and writes only deterministic records labelled Demo, Sample, Fixture or Example. Google billing-link quota may prevent attaching the production billing account to staging. The free Firebase tier is acceptable for staging until a feature requires billing; do not use another billing identity as a workaround.

Rotate the runtime key and shared password after suspected exposure. Revoke the old key only after the replacement deployment passes health and login checks.
