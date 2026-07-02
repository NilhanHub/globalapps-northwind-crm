# Known issues and deliberate limitations

These are accepted limitations of the current small-team release:

- Everyone uses the same username and password, so the CRM cannot reliably identify which friend made a change.
- Owner names are fixed by design and cannot be configured in the application.
- A successful save reaches Firestore immediately, but another open browser may need to refresh before displaying it.
- If two people edit the same record together, the stale second save is rejected and must be retried after refreshing.
- Automatic reminders and overdue notifications are not currently provided.
- Very large datasets will eventually require pagination, indexed search and additional performance work.
- Serious disaster recovery remains a deliberate operator-led restore process.
- Automatic cloud backups are provided, but their schedules and freshness must still be monitored.
- Backups remain under the same Google ownership boundary and do not protect against loss of the entire Google account.
- Some browsers can restore session cookies when reopening previously open tabs; the server still enforces the 16-hour inactivity limit.
- Shared authentication is temporary and is not a substitute for individual user accounts, permissions or per-person audit identity.
- Hostinger requires a long-lived Google service-account credential. It must remain only in Hostinger secrets and be rotated after suspected exposure.
