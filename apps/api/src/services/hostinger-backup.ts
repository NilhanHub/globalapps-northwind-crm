import {
  constants,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { createCipheriv, createDecipheriv, createHash, publicEncrypt, privateDecrypt, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { auditWorkspaceData, canonicalize } from '@northwind/domain';
import { storeSchemas, type CrmRepository, type StoreName } from '../repositories/repository.js';

const BACKUP_STORES: StoreName[] = ['companies', 'people', 'routes', 'activities', 'importJobs', 'owners', 'settings'];
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const BACKUP_EXECUTION_LIMIT_MS = 10 * 60_000;
const BACKUP_LOCK_STALE_MS = 20 * 60_000;

export const BACKUP_TRIGGER_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{43,128}$/;
export const isStrongBackupTriggerToken = (value: string) => BACKUP_TRIGGER_TOKEN_PATTERN.test(value);

export type BackupEnvelope = {
  format: 'northwind-encrypted-backup';
  version: 2;
  createdAt: string;
  workspaceId: string;
  algorithm: 'RSA-OAEP-SHA256+A256GCM';
  iv: string;
  authTag: string;
  encryptedKey: string;
  plaintextSha256: string;
  ciphertextSha256: string;
  ciphertext: string;
};

function authenticatedEnvelopeMetadata(
  envelope: Pick<
    BackupEnvelope,
    'format' | 'version' | 'createdAt' | 'workspaceId' | 'algorithm' | 'encryptedKey' | 'plaintextSha256'
  >,
) {
  return Buffer.from(
    JSON.stringify({
      format: envelope.format,
      version: envelope.version,
      createdAt: envelope.createdAt,
      workspaceId: envelope.workspaceId,
      algorithm: envelope.algorithm,
      encryptedKey: envelope.encryptedKey,
      plaintextSha256: envelope.plaintextSha256,
    }),
    'utf8',
  );
}

type BackupBundle = {
  schemaVersion: 2;
  createdAt: string;
  workspaceId: string;
  stores: Record<StoreName, Array<Record<string, unknown>>>;
  manifest: Record<string, { count: number; ids: string[]; canonicalSha256: string }>;
  integrity: ReturnType<typeof auditWorkspaceData>;
};

export function verifyBackupEnvelope(value: unknown): BackupEnvelope {
  const envelope = value as Partial<BackupEnvelope>;
  const iv = typeof envelope.iv === 'string' ? Buffer.from(envelope.iv, 'base64') : Buffer.alloc(0);
  const authTag = typeof envelope.authTag === 'string' ? Buffer.from(envelope.authTag, 'base64') : Buffer.alloc(0);
  const encryptedKey =
    typeof envelope.encryptedKey === 'string' ? Buffer.from(envelope.encryptedKey, 'base64') : Buffer.alloc(0);
  const ciphertext =
    typeof envelope.ciphertext === 'string' ? Buffer.from(envelope.ciphertext, 'base64') : Buffer.alloc(0);
  if (
    envelope.format !== 'northwind-encrypted-backup' ||
    envelope.version !== 2 ||
    envelope.algorithm !== 'RSA-OAEP-SHA256+A256GCM' ||
    typeof envelope.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(envelope.createdAt)) ||
    typeof envelope.workspaceId !== 'string' ||
    !envelope.workspaceId ||
    iv.length !== 12 ||
    authTag.length !== 16 ||
    encryptedKey.length < 256 ||
    ciphertext.length === 0 ||
    !/^[a-f0-9]{64}$/i.test(String(envelope.plaintextSha256 ?? '')) ||
    !/^[a-f0-9]{64}$/i.test(String(envelope.ciphertextSha256 ?? '')) ||
    sha256(ciphertext) !== envelope.ciphertextSha256
  )
    throw new Error('Encrypted backup envelope is invalid or corrupted');
  return envelope as BackupEnvelope;
}

export function validateBackupBundle(value: unknown): BackupBundle {
  const bundle = value as Partial<BackupBundle>;
  if (
    bundle.schemaVersion !== 2 ||
    typeof bundle.workspaceId !== 'string' ||
    !bundle.workspaceId ||
    typeof bundle.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(bundle.createdAt)) ||
    !bundle.stores ||
    !bundle.manifest
  )
    throw new Error('Decrypted backup bundle metadata is invalid');
  for (const store of BACKUP_STORES) {
    const records = bundle.stores[store];
    const manifest = bundle.manifest[store];
    if (!Array.isArray(records) || !manifest) throw new Error(`Decrypted backup is missing ${store}`);
    records.forEach((record) => storeSchemas[store].parse(record));
    const ids = records.map((record) => String(record.id));
    if (
      manifest.count !== records.length ||
      JSON.stringify(manifest.ids) !== JSON.stringify(ids) ||
      manifest.canonicalSha256 !== sha256(canonicalize(records))
    )
      throw new Error(`Decrypted backup manifest does not match ${store}`);
  }
  const integrity = auditWorkspaceData({
    companies: bundle.stores.companies,
    people: bundle.stores.people,
    routes: bundle.stores.routes,
    activities: bundle.stores.activities,
    owners: bundle.stores.owners,
    settings: bundle.stores.settings,
    workspaceId: bundle.workspaceId,
  });
  if (!integrity.ok) throw new Error(`Decrypted backup has ${integrity.issues.length} integrity issue(s)`);
  return { ...(bundle as BackupBundle), integrity };
}

export async function runHostingerBackup(input: {
  repository: CrmRepository;
  directory: string;
  publicKeyPem: string;
  workspaceId?: string;
  now?: Date;
  maxDurationMs?: number;
}) {
  const workspaceId = input.workspaceId ?? 'default';
  const maxDurationMs = input.maxDurationMs ?? BACKUP_EXECUTION_LIMIT_MS;
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) throw new Error('Backup execution limit is invalid');
  const deadline = Date.now() + maxDurationMs;
  const assertWithinDeadline = () => {
    if (Date.now() >= deadline) throw new Error('Backup exceeded the whole-operation execution limit');
  };
  mkdirSync(input.directory, { recursive: true, mode: 0o700 });
  const lockPath = join(input.directory, '.backup.lock');
  let lock: number | undefined;
  let temporary = '';
  try {
    try {
      lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      writeFileSync(lock, `${new Date().toISOString()}\n`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        let startedAt = Number.NaN;
        try {
          startedAt = Date.parse(readFileSync(lockPath, 'utf8').trim());
        } catch {
          // The file metadata below remains a safe recovery clock for a malformed crash lock.
        }
        const recoveryClock = Number.isFinite(startedAt) ? startedAt : statSync(lockPath).mtimeMs;
        if (Date.now() - recoveryClock > BACKUP_LOCK_STALE_MS) {
          rmSync(lockPath, { force: true });
          lock = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
          writeFileSync(lock, `${new Date().toISOString()}\n`);
        } else {
          throw Object.assign(new Error('A backup is already running'), { statusCode: 409, code: 'BACKUP_RUNNING' });
        }
      } else {
        throw error;
      }
    }
    assertWithinDeadline();
    let stores: Record<StoreName, Array<Record<string, unknown>>> | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await input.repository.getWorkspaceRevision(workspaceId);
      assertWithinDeadline();
      const storeReads = Promise.all(
        BACKUP_STORES.map(async (store) => [
          store,
          (await input.repository.list(store, workspaceId)).sort((left, right) => left.id.localeCompare(right.id)),
        ]),
      );
      const candidate = Object.fromEntries(
        await Promise.race([
          storeReads,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Backup exceeded the whole-operation execution limit')),
              Math.max(1, deadline - Date.now()),
            ).unref(),
          ),
        ]),
      ) as Record<StoreName, Array<Record<string, unknown>>>;
      const after = await input.repository.getWorkspaceRevision(workspaceId);
      assertWithinDeadline();
      if (before.revision === after.revision) {
        stores = candidate;
        break;
      }
    }
    if (!stores)
      throw Object.assign(new Error('Workspace changed while the backup snapshot was being read'), {
        statusCode: 409,
        code: 'BACKUP_SNAPSHOT_CHANGED',
      });
    assertWithinDeadline();
    const integrity = auditWorkspaceData({
      companies: stores.companies,
      people: stores.people,
      routes: stores.routes,
      activities: stores.activities,
      owners: stores.owners,
      settings: stores.settings,
      workspaceId,
    });
    if (!integrity.ok) throw new Error(`Backup refused ${integrity.issues.length} integrity issue(s)`);
    assertWithinDeadline();
    const createdAt = (input.now ?? new Date()).toISOString();
    const bundle: BackupBundle = {
      schemaVersion: 2,
      createdAt,
      workspaceId,
      stores,
      manifest: Object.fromEntries(
        BACKUP_STORES.map((store) => [
          store,
          {
            count: stores[store].length,
            ids: stores[store].map((record) => String(record.id)),
            canonicalSha256: sha256(canonicalize(stores[store])),
          },
        ]),
      ),
      integrity,
    };
    validateBackupBundle(bundle);
    assertWithinDeadline();
    const plaintext = gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'), { level: 9 });
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const encryptedKey = publicEncrypt({ key: input.publicKeyPem, oaepHash: 'sha256' }, key).toString('base64');
    const metadata = {
      format: 'northwind-encrypted-backup' as const,
      version: 2 as const,
      createdAt,
      workspaceId,
      algorithm: 'RSA-OAEP-SHA256+A256GCM' as const,
      encryptedKey,
      plaintextSha256: sha256(plaintext),
    };
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(authenticatedEnvelopeMetadata(metadata));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: BackupEnvelope = {
      ...metadata,
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertextSha256: sha256(ciphertext),
      ciphertext: ciphertext.toString('base64'),
    };
    assertWithinDeadline();
    verifyBackupEnvelope(envelope);
    const stamp = createdAt.replace(/[:.]/g, '-');
    const filename = `northwind-${workspaceId}-${stamp}.nwbackup`;
    temporary = join(input.directory, `.${filename}.${process.pid}.tmp`);
    const destination = join(input.directory, filename);
    writeFileSync(temporary, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600 });
    verifyBackupEnvelope(JSON.parse(readFileSync(temporary, 'utf8')));
    assertWithinDeadline();
    renameSync(temporary, destination);
    const retained = readdirSync(input.directory)
      .filter((name) => /^northwind-[a-zA-Z0-9._-]+-.*\.nwbackup$/.test(name))
      .sort()
      .reverse();
    for (const old of retained.slice(2)) rmSync(join(input.directory, old), { force: true });
    return {
      ok: true,
      filename,
      createdAt,
      bytes: statSync(destination).size,
      retained: retained.slice(0, 2),
      counts: integrity.counts,
      ciphertextSha256: envelope.ciphertextSha256,
    };
  } finally {
    if (temporary) rmSync(temporary, { force: true });
    if (lock !== undefined) {
      closeSync(lock);
      rmSync(lockPath, { force: true });
    }
  }
}

export function getHostingerBackupStatus(directory: string) {
  if (!existsSync(directory)) return { count: 0, latest: null, ageHours: null, files: [] };
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.nwbackup'))
    .map((entry) => {
      const path = join(directory, entry.name);
      const envelope = verifyBackupEnvelope(JSON.parse(readFileSync(path, 'utf8')));
      return { filename: entry.name, createdAt: envelope.createdAt, bytes: statSync(path).size };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latest = files[0] ?? null;
  return {
    count: files.length,
    latest,
    ageHours: latest ? Math.round(((Date.now() - Date.parse(latest.createdAt)) / 3_600_000) * 100) / 100 : null,
    files,
  };
}

export function decryptBackup(envelopeValue: unknown, privateKeyPem: string) {
  const envelope = verifyBackupEnvelope(envelopeValue);
  const key = privateDecrypt({ key: privateKeyPem, oaepHash: 'sha256' }, Buffer.from(envelope.encryptedKey, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(authenticatedEnvelopeMetadata(envelope));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  if (sha256(plaintext) !== envelope.plaintextSha256) throw new Error('Decrypted backup hash does not match');
  const bundle = validateBackupBundle(JSON.parse(gunzipSync(plaintext).toString('utf8')));
  if (bundle.workspaceId !== envelope.workspaceId || bundle.createdAt !== envelope.createdAt)
    throw new Error('Authenticated envelope metadata does not match the decrypted backup');
  return bundle;
}
