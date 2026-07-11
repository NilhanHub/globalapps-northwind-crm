# Known issues and deliberate limitations

These are accepted limitations of the current small-team release:

- Everyone uses the same username and password, so the CRM cannot reliably identify which friend made a change.
- A successful save reaches Firestore immediately, but another open browser may need to refresh before displaying it.
- If two people edit the same record together, the stale second save is rejected and must be retried after refreshing.
- Reminders are in-app only; email, calendar and push delivery are not currently provided.
- Reminder snoozes affect everyone because the workspace uses one shared login.
- Large lists are paginated, but datasets containing many thousands of records may eventually need broader indexed search and additional query tuning.
- Serious disaster recovery remains a deliberate operator-led restore process.
- Automatic cloud backups are provided, but their schedules and freshness must still be monitored.
- Two encrypted backups are also retained on Hostinger, which protects against Google loss but not complete loss of the Hostinger account.
- Losing the RSA recovery private key from the password manager makes Hostinger backup archives unrecoverable.
- Some browsers can restore session cookies when reopening previously open tabs; the server still enforces the 16-hour inactivity limit.
- Shared authentication is temporary and is not a substitute for individual user accounts, permissions or per-person audit identity.
- Hostinger requires a long-lived Google service-account credential. It must remain only in Hostinger secrets and be rotated after suspected exposure.
- Native server-side protection for the private `main` and `staging` branches is unavailable on the current GitHub plan; releases must use the checked promotion workflow until the plan supports branch rules.
