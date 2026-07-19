# INC-004: Malformed company data blocked workspace bootstrap

Date: 2026-07-19
Status: Monitoring

## Impact

Authenticated users could see the Northwind shell and navigation, but Companies, People and the other workspace views could not load their shared data.

## Detection

The browser displayed the generic workspace-unavailable state while public health checks still reported the Firestore repository ready. The production integrity command reproduced a field-level schema rejection without exposing record content.

## Timeline

- Public liveness, readiness and health checks remained successful.
- The approved Google identity and project were verified read-only.
- The production integrity command isolated a legacy null in a string-valued company field.
- A dry-run canonical migration identified the bounded repair set and one related stale query key.
- Compatibility, importer and migration regression tests were added before production repair.

## Root cause

An external lead importer bypassed the canonical Northwind write contract. It stored a null contact date and used a different apostrophe-normalization rule. The authenticated bootstrap loads and validates all bounded workspace stores together, so one invalid company rejected the complete response.

## Resolution

Accept and normalize the reviewed legacy null at the shared schema boundary, emit only canonical values from the importer, and repair existing records through a versioned, audited Firestore migration after recovery and release gates pass.

## Guardrails

- Importer tests assert the Northwind company shape and exact query-key behavior.
- Domain tests preserve backward-compatible parsing for the reviewed legacy null only.
- The migration is dry-run by default, refuses data drift inside its transaction, increments record versions, writes an audit activity and advances workspace revision.
- Troubleshooting distinguishes repository readiness from record-schema validity.

## Verification

Run the full release suite, production integrity and export validation, then verify authenticated Companies and People in the browser with no relevant console or network errors.

## References

- [`packages/domain/src/domain.test.ts`](../../packages/domain/src/domain.test.ts)
- [`apps/api/src/services/company-canonical-migration.test.ts`](../../apps/api/src/services/company-canonical-migration.test.ts)
- [`scripts/migrate-company-canonical-fields.ts`](../../scripts/migrate-company-canonical-fields.ts)
- [NW-LL-019](../LESSONS_LEARNED.md#nw-ll-019)
