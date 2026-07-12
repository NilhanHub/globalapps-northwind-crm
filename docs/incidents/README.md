# Incident reports

Incident reports preserve material failures whose sequence, impact and guardrails are useful after the immediate fix. They are historical context, not live runbooks. Current behavior remains defined by code, tests and normative documentation.

Create a report only for a material outage, failed release, recovery event or recurring cross-system defect. Use the next `INC-###` ID and never reuse an ID.

```markdown
# INC-###: Concise incident title

Date: YYYY-MM-DD
Status: Resolved | Monitoring | Open

## Impact

## Detection

## Timeline

## Root cause

## Resolution

## Guardrails

## Verification

## References
```

Reports must be sanitized. Never include credentials, password hashes, tokens, cookies, private keys, service-account material, key identifiers, production records or transient live counts. Prefer tracked commits, tests, scripts and runbooks over ignored evidence.

## Initial reports

- [INC-001: Hostinger release verification failures](INC-001-hostinger-release-verification.md)
- [INC-002: Backup and recovery hardening](INC-002-backup-recovery-hardening.md)
- [INC-003: Paginated company search](INC-003-paginated-company-search.md)
