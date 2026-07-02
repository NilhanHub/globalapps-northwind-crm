# Data migration and recovery

`npm run data:migrate` copies the root stores into `data/`. `npm run data:migrate:firestore` performs a cloud dry run with counts and SHA-256 hashes; the `:apply` command creates only missing records and refuses to replace a differing record. Both operations are idempotent and never delete the root stores.

Mutations are serialized. Multi-store changes write temporary files and a recovery journal before renames. On startup the JSON adapter recovers an incomplete journal. Before replacement, timestamped store backups are rotated under the data directory.

Production protection consists of 14 daily managed backups, 14 weekly managed backups, seven-day Firestore point-in-time recovery and nightly native exports retained for 90 days in a private Singapore GCS bucket.

Cloud recovery procedure:

1. Put the CRM into a write freeze and record the incident time.
2. Verify the active human identity is exactly `nilhan.dev@gmail.com`.
3. Select a managed backup, PITR timestamp or completed GCS export that predates the incident.
4. Restore into a new temporary Firestore database. Never overwrite production as the first step.
5. Compare collection counts, IDs, relationships and representative versioned records.
6. Run API and browser smoke tests against the temporary database.
7. Document and approve the final cutover, then retain the damaged database until validation is complete.

Archive/restore is the normal human recovery path. Permanent deletion is intentionally outside the new browser workflow while dependencies exist.
