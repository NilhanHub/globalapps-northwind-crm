import 'dotenv/config';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAuthService, resolvePasswordHash } from './auth/auth-service.js';
import { migrateDataStores } from './migration.js';
import { createJsonRepository } from './repositories/json-repository.js';
import { createFileSessionRepository } from './repositories/session-repository.js';
import { createFirestoreRepository } from './repositories/firestore-repository.js';
import { createFirestoreSessionRepository } from './repositories/firestore-session-repository.js';
import { createFirebaseFirestore } from './firebase.js';
import { resolveRepositoryConfig } from './runtime-config.js';
import { createApp } from './server.js';

const root = resolve(process.cwd());
const dataDir = resolve(process.env.CRM_DATA_DIR || resolve(root, 'data'));
const repositoryConfig = resolveRepositoryConfig(process.env);
const requiredStores = ['companies', 'people', 'routes', 'activities'];
if (repositoryConfig.mode === 'json' && !requiredStores.every((name) => existsSync(resolve(dataDir, `${name}.json`))))
  migrateDataStores(root, dataDir);

const username = process.env.CRM_USERNAME?.trim() ?? '';
const passwordHash = resolvePasswordHash(process.env);
if (!username || !passwordHash)
  throw new Error(
    'CRM_USERNAME and CRM_PASSWORD_SCRYPT are required. Run npm run auth:hash-password to create a password hash.',
  );
const agentToken = process.env.CRM_AGENT_TOKEN?.trim() ?? '';
const scopedAgentTokens = (() => {
  const encoded = process.env.CRM_AGENT_TOKENS_BASE64?.trim();
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Array<{
      keyId?: unknown;
      token?: unknown;
      permissions?: unknown;
    }>;
    if (!Array.isArray(parsed)) throw new Error('invalid');
    return parsed.map((entry) => {
      const keyId = String(entry.keyId ?? '');
      const token = String(entry.token ?? '');
      const permissions = Array.isArray(entry.permissions)
        ? entry.permissions.filter((permission): permission is 'read' | 'write' =>
            ['read', 'write'].includes(String(permission)),
          )
        : [];
      if (!/^[a-zA-Z0-9._-]{1,40}$/.test(keyId) || token.length < 24 || !permissions.length) throw new Error('invalid');
      return { keyId, tokenHash: createHash('sha256').update(token).digest('hex'), permissions };
    });
  } catch {
    throw new Error('CRM_AGENT_TOKENS_BASE64 must encode a valid scoped agent-token array');
  }
})();
const allowedOrigins = (process.env.CRM_CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const firestore =
  repositoryConfig.mode === 'firestore'
    ? createFirebaseFirestore({
        projectId: repositoryConfig.projectId,
        ...(repositoryConfig.serviceAccountBase64
          ? { serviceAccountBase64: repositoryConfig.serviceAccountBase64 }
          : {}),
      })
    : null;
const repository = firestore ? createFirestoreRepository(firestore) : createJsonRepository(dataDir);
const authService = createAuthService({
  username,
  passwordHash,
  sessionRepository: firestore
    ? createFirestoreSessionRepository(firestore)
    : createFileSessionRepository(resolve(dataDir, '.crm-sessions.json')),
});
const app = await createApp({
  repository,
  authService,
  secureCookies: process.env.NODE_ENV === 'production',
  publicDir: resolve(root, 'apps', 'web', 'dist'),
  ...(agentToken ? { agentTokenHash: createHash('sha256').update(agentToken).digest('hex') } : {}),
  ...(scopedAgentTokens.length ? { agentTokens: scopedAgentTokens } : {}),
  ...(allowedOrigins.length ? { allowedOrigins } : {}),
  logRequests: true,
  release: {
    version: process.env.CRM_APP_VERSION || '2.0.0',
    commitSha: process.env.CRM_COMMIT_SHA || 'unknown',
    buildTime: process.env.CRM_BUILD_TIME || 'unknown',
    repositoryType: repositoryConfig.mode,
  },
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
await app.listen({ port, host });
console.log(
  JSON.stringify({ time: new Date().toISOString(), level: 'info', msg: 'Northwind API listening', host, port }),
);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
