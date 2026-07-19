# Data migration and recovery

`npm run data:migrate` and `npm run data:migrate:firestore` are one-time migration tools for the original JSON stores. They are not production backup or release-verification commands. Both operations are idempotent, never delete the root stores, and the Firestore apply command creates only missing records while refusing to replace a differing record.

Use the current-data commands for routine operations:

- `npm run data:integrity` audits live references, normalized identities, duplicates, versions, archive state and workspace scope without writing.
- `npm run data:export:firestore` creates a timestamped export with per-store JSON, IDs, canonical SHA-256 hashes, schema metadata and an integrity report.
- `npm run data:verify-export -- <export-directory>` revalidates the export before it is considered recoverable.
- `npm run data:migrate:company-canonical` is a read-only preview for legacy null contact dates and stale company query keys. Its `:apply` variant performs one versioned Firestore transaction, writes an audit activity and advances the workspace revision; run it only after verifying identity, project, a current managed backup or PITR point, and the exact reviewed commit.

Quarterly recovery drills restore a verified export or managed backup into a separate temporary Firestore database. Production must never be the first restore target.

Mutations are serialized. Multi-store changes write temporary files and a recovery journal before renames. On startup the JSON adapter recovers an incomplete journal. Before replacement, timestamped store backups are rotated under the data directory.

Production protection consists of 14 daily managed backups, 14 weekly managed backups, seven-day Firestore point-in-time recovery, nightly native exports retained for 90 days in a private Singapore GCS bucket and the newest two successful encrypted archives on Hostinger.

Hostinger archives contain canonical companies, people, routes, activities, import jobs, owner profiles and workspace settings plus IDs, counts, hashes and the integrity report. Sessions, cookies, trigger tokens and plaintext secrets are excluded. Archive-envelope version 2 uses a fresh AES-256-GCM key; the AES key is wrapped with the recovery RSA-4096 public key using OAEP-SHA256. Format, version, creation time, workspace, algorithm, wrapped key and plaintext hash are authenticated as AES-GCM additional data and cross-checked against the decrypted bundle. Pre-launch version-1 fixtures are deliberately rejected because their metadata was not authenticated.

For a Hostinger archive drill, supply the private key from the password manager only for the duration of `npm run backup:decrypt`, `npm run backup:restore:validate` or `npm run backup:restore:firestore`. The first two commands are read-only. The Firestore restore command requires `--apply`, an explicit named non-default database, the source and production database IDs, and the exact confirmation phrase. It creates missing documents only, treats exact records as resumable no-ops, refuses conflicting or unexpected target documents, and verifies IDs, counts, hashes and relationships after writing.

Create the temporary database in the same Google project and region as the source using the [official named-database procedure](https://cloud.google.com/firestore/docs/manage-databases); do not use the live `(default)` database. With `CRM_BACKUP_PRIVATE_KEY_FILE` and the target project's runtime credential supplied temporarily, run:

```text
npm run backup:restore:firestore -- --apply --archive=<archive.nwbackup> --target-project=<project-id> --target-database=<restore-drill-id> --source-database=(default) --production-database=(default) --workspace=default --confirm="RESTORE <project-id>/<restore-drill-id>/default"
```

Set `CRM_FIRESTORE_DATABASE_ID=<restore-drill-id>` when starting the isolated API for read-only browser verification. Save sanitized evidence before deleting the temporary database, then remove the private-key file and unset its environment variable. Production is never the first restore target.

Cloud recovery procedure:

1. Put the CRM into a write freeze and record the incident time.
2. Verify the active human identity is exactly `nilhan.dev@gmail.com`.
3. Select a managed backup, PITR timestamp or completed GCS export that predates the incident.
4. Restore into a new temporary Firestore database. Never overwrite production as the first step.
5. Compare collection counts, IDs, relationships and representative versioned records.
6. Run API and browser smoke tests against the temporary database.
7. Document and approve the final cutover, then retain the damaged database until validation is complete.

Archive/restore is the normal human recovery path. Permanent deletion is intentionally outside the new browser workflow while dependencies exist.
