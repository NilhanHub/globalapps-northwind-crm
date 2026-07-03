# Cloud release status

Verified on 2026-07-03:

- Project: `globalapps-northwind-crm`
- Sole human Google identity: `nilhan.dev@gmail.com`
- Billing: enabled with a three-threshold monthly budget alert
- Firestore: Native mode, Standard edition, `asia-southeast1`, PITR and delete protection enabled
- Browser rules: direct Firestore reads and writes denied
- Migrated production records: 38 companies, 12 people, 12 routes and 2 activities
- Post-migration idempotency check: 64 unchanged, zero creates
- Managed backups: daily/14-day and weekly/14-week schedules configured
- External exports: private Singapore GCS bucket with 90-day lifecycle
- Post-migration native export: completed without error
- Restore drill: restored into `restore-verification`, matched all records, then removed the temporary database
- Freshness monitoring: private Gen 2 function and authenticated daily Scheduler check passing
- Unexpected human Google IAM members: zero
- Production application: live at `https://crm.globalapps.world`
- Health endpoint: `200 OK` with Firestore repository available
- Hostinger source: private `NilhanHub/globalapps-northwind-crm`, branch `main`
- Hostinger runtime: Node 22, Fastify preset, root entry `app.js`, port 3000
- Shared login, CSRF, secure session cookies and logout: verified in production
- Runtime service-account key ID: `c83746f798b6f4fd405401c174742680670f5957` (rotate on or before the next scheduled credential review)
- `apexhrm.com`: verified unaffected and returning `200 OK`

Firestore is the production source of truth. JSON remains available only for local development, import and emergency export. Hostinger stores the runtime credential as an environment secret; the temporary plaintext key file was removed after configuration.
