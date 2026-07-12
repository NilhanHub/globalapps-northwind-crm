import 'dotenv/config';
import { createHash, createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { createAuthService, resolvePasswordHash } from './auth/auth-service.js';
import { migrateDataStores } from './migration.js';
import { createJsonRepository } from './repositories/json-repository.js';
import { createFileSessionRepository } from './repositories/session-repository.js';
import { createFirestoreRepository } from './repositories/firestore-repository.js';
import { createFirestoreSessionRepository } from './repositories/firestore-session-repository.js';
import { createFirebaseFirestore } from './firebase.js';
import { resolveRepositoryConfig } from './runtime-config.js';
import { createApp } from './server.js';
import { resolveReleaseMetadata, type GeneratedReleaseMetadata } from './release-metadata.js';

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
const backupDirectory = process.env.CRM_HOSTINGER_BACKUP_DIR?.trim() ?? '';
const backupTriggerTokenHash = process.env.CRM_BACKUP_TRIGGER_HASH?.trim() ?? '';
const backupPublicKeyPem = (() => {
  const encoded = process.env.CRM_BACKUP_PUBLIC_KEY_BASE64?.trim();
  return encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
})();
const backupConfigured = Boolean(backupDirectory && backupTriggerTokenHash && backupPublicKeyPem);
if (
  process.env.NODE_ENV === 'production' &&
  [backupDirectory, backupTriggerTokenHash, backupPublicKeyPem].some(Boolean) &&
  !backupConfigured
)
  throw new Error('Hostinger backup requires directory, public key and trigger-token hash together');
if (backupConfigured) {
  if (!/^[a-f0-9]{64}$/i.test(backupTriggerTokenHash))
    throw new Error('CRM_BACKUP_TRIGGER_HASH must be a SHA-256 hex digest');
  if (!isAbsolute(backupDirectory)) throw new Error('CRM_HOSTINGER_BACKUP_DIR must be an absolute private path');
  const relativeToRepository = relative(root, resolve(backupDirectory));
  if (!relativeToRepository.startsWith('..') && !isAbsolute(relativeToRepository))
    throw new Error('CRM_HOSTINGER_BACKUP_DIR must be outside the repository and deployment directory');
  const backupPublicKey = createPublicKey(backupPublicKeyPem);
  if (backupPublicKey.asymmetricKeyType !== 'rsa' || (backupPublicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 4096)
    throw new Error('CRM_BACKUP_PUBLIC_KEY_BASE64 must contain an RSA-4096 or stronger public key');
}
const generatedRelease = (() => {
  try {
    return JSON.parse(readFileSync(resolve(root, 'release-metadata.json'), 'utf8')) as GeneratedReleaseMetadata;
  } catch {
    return undefined;
  }
})();
const {
  version: releaseVersion,
  commitSha: releaseCommit,
  buildTime: releaseBuildTime,
} = resolveReleaseMetadata(process.env, generatedRelease);
if (process.env.NODE_ENV === 'production' && (releaseCommit === 'unknown' || releaseBuildTime === 'unknown'))
  throw new Error('Production requires CRM_COMMIT_SHA and CRM_BUILD_TIME release metadata');

const firestore =
  repositoryConfig.mode === 'firestore'
    ? createFirebaseFirestore({
        projectId: repositoryConfig.projectId,
        databaseId: repositoryConfig.databaseId,
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
  ...(backupConfigured
    ? {
        backup: {
          directory: backupDirectory,
          publicKeyPem: backupPublicKeyPem,
          triggerTokenHash: backupTriggerTokenHash,
        },
      }
    : {}),
  logRequests: true,
  release: {
    version: releaseVersion,
    commitSha: releaseCommit,
    buildTime: releaseBuildTime,
    repositoryType: repositoryConfig.mode,
    repositoryDatabaseId: repositoryConfig.mode === 'firestore' ? repositoryConfig.databaseId : null,
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
