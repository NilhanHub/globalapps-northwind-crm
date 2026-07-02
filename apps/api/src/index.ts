import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAuthService } from './auth/auth-service.js';
import { migrateDataStores } from './migration.js';
import { createJsonRepository } from './repositories/json-repository.js';
import { createFileSessionRepository } from './repositories/session-repository.js';
import { createApp } from './server.js';

const root = resolve(process.cwd());
const dataDir = resolve(process.env.CRM_DATA_DIR || resolve(root, 'data'));
const requiredStores = ['companies', 'people', 'routes', 'activities'];
if (!requiredStores.every((name) => existsSync(resolve(dataDir, `${name}.json`)))) migrateDataStores(root, dataDir);

const username = process.env.CRM_USERNAME?.trim() ?? '';
const passwordHash = process.env.CRM_PASSWORD_SCRYPT?.trim() ?? '';
if (!username || !passwordHash)
  throw new Error(
    'CRM_USERNAME and CRM_PASSWORD_SCRYPT are required. Run npm run auth:hash-password to create a password hash.',
  );
const agentToken = process.env.CRM_AGENT_TOKEN?.trim() ?? '';
const allowedOrigins = (process.env.CRM_CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const repository = createJsonRepository(dataDir);
const authService = createAuthService({
  username,
  passwordHash,
  sessionRepository: createFileSessionRepository(resolve(dataDir, '.crm-sessions.json')),
});
const app = await createApp({
  repository,
  authService,
  secureCookies: process.env.NODE_ENV === 'production',
  publicDir: resolve(root, 'apps', 'web', 'dist'),
  ...(agentToken ? { agentTokenHash: createHash('sha256').update(agentToken).digest('hex') } : {}),
  ...(allowedOrigins.length ? { allowedOrigins } : {}),
  logRequests: true,
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
await app.listen({ port, host });
console.log(
  JSON.stringify({ time: new Date().toISOString(), level: 'info', msg: 'Northwind API listening', host, port }),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
