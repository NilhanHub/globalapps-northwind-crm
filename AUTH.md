# Authentication Plan

## Model
Single shared credentials for all users — no per-user isolation, no multi-tenancy.

| Field    | Value      |
|----------|------------|
| Username | `1bt-user` |
| Password | `1bt-pass` |

## Rules
- Every visitor sees the exact same application state. No multi-tenancy.
- The auth gate exists only to prevent anonymous access, not to isolate data.
- When implemented, the login flow should be a simple session cookie or token check.

## Implementation Status
Not yet implemented. See `server.js` TENANT_MODE constants — these are inert and will be replaced with a single shared auth gate when login is added.
