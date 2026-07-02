# Hostinger VPS deployment

This guide is provider-specific operational guidance; no deployment is performed by the repository.

1. Install Node.js 22 and Nginx on a supported Ubuntu LTS host.
2. Place application code under `/opt/northwind-crm`, data under `/var/lib/northwind-crm`, secrets in a root-readable environment file outside the repository, and logs under `/var/log/northwind-crm`.
3. Run `npm ci`, `npm run build`, `npm test`, and `npm run data:migrate` as the service account.
4. Configure `CRM_USERNAME`, a generated `CRM_PASSWORD_SCRYPT`, optional `CRM_AGENT_TOKEN`, `CRM_DATA_DIR=/var/lib/northwind-crm`, `NODE_ENV=production`, `HOST=127.0.0.1`, and `PORT=8787`.
5. Start `node apps/api/dist/index.js` with systemd or PM2. Do not expose port 8787 through the firewall.
6. Proxy HTTPS traffic through Nginx to `http://127.0.0.1:8787`; forward `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`. Redirect HTTP to HTTPS. Do not enable login before a valid certificate is active.
7. Monitor `GET /api/health`, rotate structured logs, and back up `/var/lib/northwind-crm` on a tested schedule.

Before each release, copy the current data directory and application build to timestamped rollback locations. Deploy the new build, run the health and authenticated smoke checks, then retain the previous application build and data snapshot until verification is complete. Rollback means stopping the service, restoring both matching application and data snapshots, and restarting behind Nginx.

Never put credentials in this document, the PM2 ecosystem file, shell history, or Git. See `docs/DATA_RECOVERY.md` for recovery details.
