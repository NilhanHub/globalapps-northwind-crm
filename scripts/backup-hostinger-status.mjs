/* global Buffer, console, process */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const directory = process.env.CRM_HOSTINGER_BACKUP_DIR?.trim() ?? '';
if (!directory || !isAbsolute(directory)) throw new Error('CRM_HOSTINGER_BACKUP_DIR must be an absolute path');

const verify = (value) => {
  const iv = typeof value?.iv === 'string' ? Buffer.from(value.iv, 'base64') : Buffer.alloc(0);
  const authTag = typeof value?.authTag === 'string' ? Buffer.from(value.authTag, 'base64') : Buffer.alloc(0);
  const encryptedKey =
    typeof value?.encryptedKey === 'string' ? Buffer.from(value.encryptedKey, 'base64') : Buffer.alloc(0);
  const ciphertext = typeof value?.ciphertext === 'string' ? Buffer.from(value.ciphertext, 'base64') : Buffer.alloc(0);
  const hash = createHash('sha256').update(ciphertext).digest('hex');
  if (
    value?.format !== 'northwind-encrypted-backup' ||
    value?.version !== 2 ||
    value?.algorithm !== 'RSA-OAEP-SHA256+A256GCM' ||
    !Number.isFinite(Date.parse(value?.createdAt)) ||
    typeof value?.workspaceId !== 'string' ||
    !value.workspaceId ||
    iv.length !== 12 ||
    authTag.length !== 16 ||
    encryptedKey.length < 256 ||
    ciphertext.length === 0 ||
    !/^[a-f0-9]{64}$/i.test(String(value?.plaintextSha256 ?? '')) ||
    !/^[a-f0-9]{64}$/i.test(String(value?.ciphertextSha256 ?? '')) ||
    hash !== value?.ciphertextSha256
  )
    throw new Error('Encrypted backup envelope is invalid or corrupted');
  return value;
};

const files = existsSync(directory)
  ? readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.nwbackup'))
      .map((entry) => {
        const path = join(directory, entry.name);
        const envelope = verify(JSON.parse(readFileSync(path, 'utf8')));
        return { filename: entry.name, createdAt: envelope.createdAt, bytes: statSync(path).size };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  : [];
const latest = files[0] ?? null;
console.log(
  JSON.stringify(
    {
      count: files.length,
      latest,
      ageHours: latest ? Math.round(((Date.now() - Date.parse(latest.createdAt)) / 3_600_000) * 100) / 100 : null,
      files,
    },
    null,
    2,
  ),
);
