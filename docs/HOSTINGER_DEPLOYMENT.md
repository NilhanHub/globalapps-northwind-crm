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
6. Configure the environment keys from `.env.example`, including `NODE_ENV=production`, `CRM_REPOSITORY=firestore`, `CRM_FIRESTORE_DATABASE_ID=(default)`, `CRM_CLOUD_OWNER_EMAIL=nilhan.dev@gmail.com`, Firebase settings, shared-login settings and `CRM_CORS_ORIGINS=https://crm.globalapps.world`.
7. Set `NPM_CONFIG_INCLUDE=dev` so Hostinger installs TypeScript, tsup and Vite. Verify the compiled API and web artifacts, then prune with `npm prune --omit=dev`; do not prune before the artifact check.
8. Set `PORT=3000`. The managed reverse proxy targets that application port; the API binds to `0.0.0.0` in production.
9. Set `CRM_PASSWORD_SCRYPT_BASE64` to the base64 encoding of the generated scrypt hash. Hostinger must use this value in preference to the raw dollar-delimited hash.

Create the runtime key only after verifying the active Google identity. Save it temporarily outside the repository, encode it for the Hostinger secret, then securely remove the temporary file. The runtime service account must have only `roles/datastore.user`. Record the key ID and creation date for rotation.

## Release and rollback

1. Run `npm run verify:release` on Node 22.
2. Run `npm run data:integrity`, create a current Firestore export and verify that export. The JSON migration command is not a production verification command.
3. Before the first operational-maturity release, run `npm run data:migrate:query-keys` and `npm run data:migrate:owners`, then rerun integrity. Both migrations are idempotent.
4. Deploy the exact commit to `crm-staging.globalapps.world` and complete login, API, responsive, accessibility and reversible-write checks against staging seed data.
5. Promote that unchanged commit to production. The build derives `release-metadata.json` from the clean Git checkout and embeds the same identity inside the compiled API bundle. Production refuses to start without valid clean embedded metadata, and `/api/health` never substitutes manually entered commit or build-time variables for it. `CRM_APP_VERSION` may still provide the release label.
6. Verify `/api/live`, `/api/ready`, `/api/health`, login, bootstrap and a clearly labelled reversible test record.
7. Run `npm run ops:footprint` against reviewed Hostinger deployment paths. Retain three deployable releases, cap logs at 14 days and delete only documented caches.
8. If deployment fails before users resume work, redeploy the previous build. Firestore remains authoritative; never roll data back to the old JSON files.

`staging` is permanent and is the base branch for dependency updates and release candidates. On every staging push, CI waits for Hostinger and proves that staging serves the exact commit with Firestore readiness, two healthy encrypted backups, no-store HTML/API responses and reachable fingerprinted assets. Use the manual **Promote staging to production** workflow with that exact approved SHA. It accepts only the successful staging push run, rechecks both branch heads immediately before a fast-forward-only push, and then waits for production to serve the same healthy release.

GitHub's current private-repository plan does not expose server-side branch protection for this repository. Until that plan changes, the promotion workflow is the enforced release procedure and administrators must not push directly to `main`. Re-enable native branch protection as soon as GitHub makes it available.

## Staging boundary

`crm-staging.globalapps.world` is a separate Hostinger Node application and uses a separate Firebase project. It must never receive the production project ID or runtime credential. Only `nilhan.dev@gmail.com` is a human project member. Seed staging with deterministic fictitious companies and people; never copy production people, email files, sessions or activity text into staging.

The approved staging project ID is `globalapps-northwind-staging`. With the staging Firestore environment selected, run `npm run data:seed:staging`; the command refuses every other project ID and writes only deterministic records labelled Demo, Sample, Fixture or Example. Google billing-link quota may prevent attaching the production billing account to staging. The free Firebase tier is acceptable for staging until a feature requires billing; do not use another billing identity as a workaround.

## Private Hostinger backup cron

Use hPanel's **Access all files of your web hosting** view to create separate staging and production directories above all public and Node deployment directories. Set each directory to owner-only `0700`; never point both applications at the same directory. Configure `CRM_HOSTINGER_BACKUP_DIR`, `CRM_BACKUP_PUBLIC_KEY_BASE64` and `CRM_BACKUP_TRIGGER_HASH` in the corresponding application environment.

Generate the RSA-4096 recovery pair with `npm run backup:generate-keys -- <absolute-directory-outside-the-repository>`. Generate a 256-bit trigger token with `npm run backup:generate-trigger -- <absolute-private-token-file-outside-the-repository>`. Both commands reject missing, relative, repository and `Evidence` paths; neither has a fallback output location. The trigger command writes the token with `0600`, refuses to overwrite an existing file and prints only its SHA-256 hash. Put that hash in `CRM_BACKUP_TRIGGER_HASH`. Store the plaintext trigger file outside every website and deployment; it must never appear in Git, environment settings or cron output.

The repository contains `scripts/hostinger-backup-cron.sh`, a POSIX wrapper with fixed staging and production mappings. It accepts only `staging` or `production`, derives the Node application and token paths from Hostinger's `$HOME`, and never contains or prints the trigger token. The verified application roots are `$HOME/domains/crm-staging.globalapps.world/nodejs` and `$HOME/domains/crm.globalapps.world/nodejs`; do not edit the wrapper to accept a path from cron input.

The environment-specific private trees are `$HOME/northwind-crm-private/staging` and `$HOME/northwind-crm-private/production`, each with owner-only `archives`, `secrets` and `cron` directories at mode `0700`. Copy the reviewed wrapper to each environment's `cron/hostinger-backup-cron.sh`. Place that environment's token at `secrets/backup-trigger.token` with mode `0600`. The wrapper rejects a missing token file and a token-file symlink.

In hPanel create separate **Custom** cron entries scheduled as `15 2 * * *` (02:15 UTC). Use these token-free commands:

```sh
/bin/sh "$HOME/northwind-crm-private/staging/cron/hostinger-backup-cron.sh" staging
/bin/sh "$HOME/northwind-crm-private/production/cron/hostinger-backup-cron.sh" production
```

Each command selects its own fixed HTTPS URL, application root and private token file. The runner is plain Node.js and continues working after `npm prune --omit=dev`. It requires HTTPS outside loopback, reads a strong token only from an absolute file path, stops the HTTP request after 11 minutes and never prints the token.

The endpoint allows two attempts per hour and uses an exclusive run lock. A malformed crash lock becomes recoverable after 20 minutes. The whole backup has a ten-minute publication deadline. The service compares the workspace revision before and after reading all seven stores, retries once if live data changed and refuses to publish a skewed snapshot after a second change. A successful archive is written to a temporary name, checksum-verified, atomically renamed and only then pruned to the newest two successful copies. Failed attempts do not remove valid archives.

Run `npm run backup:hostinger:status` after cron changes. Authenticated backup diagnostics and `/api/health` report `missing`, `healthy`, `stale`, `invalid` or `not_configured`; nightly backups become stale after 30 hours. Backup state is advisory and does not take the CRM offline. Diagnostics must show exactly two successful copies after the third successful run. The RSA-4096 private key belongs only in the user's password manager; never upload it to Hostinger.

Rotate the runtime key and shared password after suspected exposure. Revoke the old key only after the replacement deployment passes health and login checks.
