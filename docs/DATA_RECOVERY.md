# Data migration and recovery

`npm run data:migrate` and `npm run data:migrate:firestore` are one-time migration tools for the original JSON stores. They are not production backup or release-verification commands. Both operations are idempotent, never delete the root stores, and the Firestore apply command creates only missing records while refusing to replace a differing record.

Use the current-data commands for routine operations:

- `npm run data:integrity` audits live references, normalized identities, duplicates, versions, archive state and workspace scope without writing.
- `npm run data:export:firestore` creates a timestamped export with per-store JSON, IDs, canonical SHA-256 hashes, schema metadata and an integrity report.
- `npm run data:verify-export -- <export-directory>` revalidates the export before it is considered recoverable.

Quarterly recovery drills restore a verified export or managed backup into a separate temporary Firestore database. Production must never be the first restore target.

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
