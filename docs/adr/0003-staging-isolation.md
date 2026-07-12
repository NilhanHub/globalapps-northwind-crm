# ADR 0003: Staging isolation

## Status

Accepted.

## Context

Release, browser and destructive workflow checks must not mutate production records or reuse production credentials. A tested build must also be identifiable as the exact build later promoted.

## Decision

Use a separate Firebase project and Hostinger application for staging, populated only with deterministic fictitious data. Validate the exact staging commit and promote that unchanged SHA through the guarded workflow; prohibit production credentials and datasets in staging.

## Consequences

Staging requires its own operational configuration and billing awareness. Production promotion is intentionally slower but cannot legitimately substitute a differently built commit.

## Verification

Run the staging seed guard, release verification and CI checks documented in the canonical Hostinger runbook. Stop if the active Google identity, project or served SHA differs from the approved values.

## References

- [Hostinger deployment runbook](../HOSTINGER_DEPLOYMENT.md)
- [Cloud status](../CLOUD_STATUS.md)
- [Known issues](../KNOWN_ISSUES.md)
