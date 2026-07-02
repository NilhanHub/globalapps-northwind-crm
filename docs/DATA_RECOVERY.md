# Data migration and recovery

`npm run data:migrate` copies `companies.json`, `people.json`, `routes.json`, and `activities.json` into `data/`. It validates arrays, counts and SHA-256 hashes. It is idempotent and refuses to overwrite a differing destination. Root stores are never deleted automatically.

Mutations are serialized. Multi-store changes write temporary files and a recovery journal before renames. On startup the JSON adapter recovers an incomplete journal. Before replacement, timestamped store backups are rotated under the data directory.

Recovery procedure:

1. Stop the API and copy the entire data directory.
2. Inspect the transaction journal and structured logs; do not edit only one related store.
3. Restore a matching timestamp set for all affected stores.
4. Parse every JSON store and run API persistence tests against a copy.
5. Restart, verify `/api/health`, authenticate, and compare IDs/counts/hashes.

Archive/restore is the normal human recovery path. Permanent deletion is intentionally outside the new browser workflow while dependencies exist.
