# INC-002: Backup and recovery hardening

Date: 2026-07-11 to 2026-07-12
Status: Resolved

## Impact

The encrypted Hostinger backup design could not yet be treated as independently recoverable. No production data was lost, but publication and restore claims were withheld until snapshot consistency, token custody, runtime behavior and temporary-database restoration were proved.

## Detection

Threat-oriented tests and a staging restore drill exposed cross-system failure modes: concurrent workspace changes, stale locks, whole-run timeouts, cron runtime discovery, unsafe output paths, unauthenticated envelope metadata and ambiguous restore targets.

## Timeline

- Key and trigger generators were restricted to explicit absolute paths outside the repository and evidence tree.
- Backup publication gained an exclusive recoverable lock, whole-run deadline and workspace revision check with one retry.
- Archive format 2 authenticated envelope metadata as AES-GCM additional data and deliberately rejected the older fixture format.
- Hostinger cron was changed to the explicit Node 22 runtime and a fixed environment-specific wrapper.
- Restore tooling was restricted to a confirmed named non-default Firestore database and made resumable and conflict-refusing.
- A real temporary-database drill verified IDs, hashes and relationships and then removed temporary sensitive material.

## Root cause

Reliable recovery spans Firestore consistency, filesystem publication, cryptography, hosting runtime constraints, secret custody and database target selection. The initial components were individually useful but did not yet fail closed as one recovery system.

## Resolution

Treat snapshot, encryption, publication, retention and restore as separate validated phases. Publish only after complete validation, retain existing copies on failure and require a verified temporary-database restore before any recovery decision.

## Guardrails

- A changed workspace is retried once and then rejected rather than backed up inconsistently.
- Failed runs never prune valid copies.
- Trigger tokens and private keys are never logged or placed in the repository.
- Restore refuses the source, default and production databases and unexpected target records.
- Staging and production use separate private paths and tokens.

## Verification

Run `npm run backup:hostinger:status`, `npm run backup:verify` and `npm run backup:restore:validate`. A write drill requires the explicit temporary-database command and confirmation in `docs/DATA_RECOVERY.md`.

## References

- Commits `ac17e62`, `ce42e14` and `f320f30`
- [`apps/api/src/services/hostinger-backup.test.ts`](../../apps/api/src/services/hostinger-backup.test.ts)
- [`apps/api/src/services/firestore-backup-restore.test.ts`](../../apps/api/src/services/firestore-backup-restore.test.ts)
- [Data recovery](../DATA_RECOVERY.md)
- [ADR 0007](../adr/0007-encrypted-hostinger-recovery.md)
