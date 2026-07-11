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

export type BackupEnvelope = {
  format: 'northwind-encrypted-backup';
  version: 1;
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
    envelope.version !== 1 ||
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
}) {
  const workspaceId = input.workspaceId ?? 'default';
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
        const startedAt = Date.parse(readFileSync(lockPath, 'utf8').trim());
        if (Number.isFinite(startedAt) && Date.now() - startedAt > 20 * 60_000) {
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
    const storeReads = Promise.all(
      BACKUP_STORES.map(async (store) => [
        store,
        (await input.repository.list(store, workspaceId)).sort((left, right) => left.id.localeCompare(right.id)),
      ]),
    );
    const stores = Object.fromEntries(
      await Promise.race([
        storeReads,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Backup exceeded the ten-minute execution limit')), 10 * 60_000).unref(),
        ),
      ]),
    ) as Record<StoreName, Array<Record<string, unknown>>>;
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
    const plaintext = gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'), { level: 9 });
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope: BackupEnvelope = {
      format: 'northwind-encrypted-backup',
      version: 1,
      createdAt,
      workspaceId,
      algorithm: 'RSA-OAEP-SHA256+A256GCM',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      encryptedKey: publicEncrypt({ key: input.publicKeyPem, oaepHash: 'sha256' }, key).toString('base64'),
      plaintextSha256: sha256(plaintext),
      ciphertextSha256: sha256(ciphertext),
      ciphertext: ciphertext.toString('base64'),
    };
    verifyBackupEnvelope(envelope);
    const stamp = createdAt.replace(/[:.]/g, '-');
    const filename = `northwind-${workspaceId}-${stamp}.nwbackup`;
    temporary = join(input.directory, `.${filename}.${process.pid}.tmp`);
    const destination = join(input.directory, filename);
    writeFileSync(temporary, `${JSON.stringify(envelope)}\n`, { encoding: 'utf8', mode: 0o600 });
    verifyBackupEnvelope(JSON.parse(readFileSync(temporary, 'utf8')));
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
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  if (sha256(plaintext) !== envelope.plaintextSha256) throw new Error('Decrypted backup hash does not match');
  return validateBackupBundle(JSON.parse(gunzipSync(plaintext).toString('utf8')));
}
