# Cloud release status

Verified on 2026-07-02:

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

Hostinger deployment remains pending until the repository owner completes hPanel login. No runtime private key has been generated or stored locally. Firestore is populated, but it is not yet presented as the public CRM until `crm.globalapps.world` is deployed and smoke-tested.
