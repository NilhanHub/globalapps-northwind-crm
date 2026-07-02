# Authentication

Northwind currently provides secured shared access. It does not implement individual users, roles or tenant administration.

- Passwords are stored as salted `scrypt` hashes (`CRM_PASSWORD_SCRYPT`).
- Session and CSRF tokens are random; only their hashes are persisted.
- Session cookies are `HttpOnly`, `SameSite=Strict`, scoped to `/`, and `Secure` in production.
- Browser writes require `X-CSRF-Token`.
- Desktop agents use a separately configured `CRM_AGENT_TOKEN`; it is never accepted from application data.
- Audit actors are derived from the authenticated request context.

Generate a password hash without placing a plaintext password in command history:

```powershell
$env:CRM_PASSWORD_PLAINTEXT = Read-Host 'Password'
npm run auth:hash-password
Remove-Item Env:CRM_PASSWORD_PLAINTEXT
```

`AuthProvider` and `RequestContext` are replaceable boundaries for a future identity provider. Shared login must not be represented as per-user security.
