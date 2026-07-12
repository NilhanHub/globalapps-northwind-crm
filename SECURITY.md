# Security policy

Report vulnerabilities privately to the repository owner. Do not include production credentials, customer data or exploit payloads in public issues.

Supported security controls include salted `scrypt` credentials, Firestore-stored hashed session tokens, 16-hour sliding inactivity expiry, browser-session cookies, CSRF protection, same-origin defaults, request body limits, login/API throttling, enforced CSP/security headers, request IDs, optimistic conflicts and sanitized errors.

The shared account is not user isolation. Do not deploy it where per-user authorization, regulated audit identity or tenant separation is required. Production requires HTTPS, secrets outside Git, tested backups and an API reachable only through the hosting platform's managed reverse proxy (or loopback behind a self-managed reverse proxy).

`nilhan.dev@gmail.com` is the only approved human cloud identity. Runtime and backup service accounts must be least-privileged. Never expose Firebase Admin credentials to the browser or commit them. Rotate the shared password, agent token and Hostinger runtime key after suspected exposure, terminate saved sessions, preserve logs, and restore data only from verified backups.
