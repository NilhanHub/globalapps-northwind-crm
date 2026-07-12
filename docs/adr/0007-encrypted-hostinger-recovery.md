# ADR 0007: Encrypted Hostinger recovery boundary

## Status

Accepted.

## Context

Google-managed backups and exports remain under the Google ownership boundary. An additional Hostinger copy improves provider-loss recovery, but Hostinger must never possess the private recovery key or unencrypted CRM data, and production must never be the first restore target.

## Decision

Retain the newest two successful Hostinger archives encrypted with a fresh AES-256-GCM key wrapped by an RSA-4096 public key. Store only the public key and separate trigger material on Hostinger; keep the private key only in the user's password manager. Authenticate archive metadata, publish atomically after a consistent validated snapshot and restore first into an explicit named temporary Firestore database.

## Consequences

Loss of Google alone does not remove every recovery copy, but loss of both Hostinger copies or the password-manager-held private key remains unrecoverable. Recovery stays operator-led and requires monitoring and periodic drills.

## Verification

Run backup status and archive verification, then perform the documented quarterly restore drill into a temporary database. Compare schema, IDs, hashes and relationships before removing the temporary database and key file.

## References

- [INC-002](../incidents/INC-002-backup-recovery-hardening.md)
- [Data migration and recovery](../DATA_RECOVERY.md)
- [Hostinger private backup cron](../HOSTINGER_DEPLOYMENT.md#private-hostinger-backup-cron)
- [`apps/api/src/services/hostinger-backup.test.ts`](../../apps/api/src/services/hostinger-backup.test.ts)
