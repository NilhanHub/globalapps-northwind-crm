# Security policy

Report vulnerabilities privately to the repository owner. Do not include production credentials, customer data or exploit payloads in public issues.

Supported security controls include salted `scrypt` credentials, hashed session tokens, strict cookies, CSRF protection, same-origin defaults, request body limits, login/API throttling, security headers, request IDs, optimistic conflicts and sanitized errors.

The shared account is not user isolation. Do not deploy it where per-user authorization, regulated audit identity or tenant separation is required. Production requires HTTPS, loopback API binding, secrets outside Git and tested backups.

Rotate the shared password and agent token after suspected exposure, terminate saved sessions, preserve logs, and restore data only from verified backups.
