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
2. Select Node 20 or newer.
3. Build command: `npm ci && npm run build`.
4. Start command: `npm start`.
5. Connect `crm.globalapps.world`, wait for Hostinger TLS provisioning, and verify HTTPS before attempting login.
6. Configure the environment keys from `.env.example`, including `NODE_ENV=production`, `CRM_REPOSITORY=firestore`, `CRM_CLOUD_OWNER_EMAIL=nilhan.dev@gmail.com`, Firebase settings, shared-login settings and `CRM_CORS_ORIGINS=https://crm.globalapps.world`.
7. Leave `PORT` to Hostinger's assigned value. The API binds to `0.0.0.0` in production.

Create the runtime key only after verifying the active Google identity. Save it temporarily outside the repository, encode it for the Hostinger secret, then securely remove the temporary file. The runtime service account must have only `roles/datastore.user`. Record the key ID and creation date for rotation.

## Release and rollback

1. Run the complete local release checks.
2. Run `npm run data:migrate:firestore` and inspect the dry-run counts and hashes.
3. Freeze CRM writes, retain the original JSON stores, then run `npm run data:migrate:firestore:apply`.
4. Re-run the dry run; every source record must be reported unchanged.
5. Deploy, verify `/api/health`, login, bootstrap and a reversible test record.
6. If deployment fails before users resume work, redeploy the previous build. After users resume, Firestore remains authoritative; never roll data back to the old JSON files.

Rotate the runtime key and shared password after suspected exposure. Revoke the old key only after the replacement deployment passes health and login checks.
