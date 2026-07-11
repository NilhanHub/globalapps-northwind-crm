import { generateKeyPairSync } from 'node:crypto';
import {
  mkdtempSync,
  openSync,
  closeSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { companySchema, personSchema, routeSchema } from '@northwind/domain';
import { createJsonRepository } from '../repositories/json-repository.js';
import { decryptBackup, runHostingerBackup, validateBackupBundle, verifyBackupEnvelope } from './hostinger-backup.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'northwind-backup-'));
  dirs.push(root);
  const data = join(root, 'data');
  const backups = join(root, 'private-backups');
  const repository = createJsonRepository(data);
  const now = '2026-07-01T00:00:00.000Z';
  const company = companySchema.parse({
    id: 'company-1',
    name: 'Fixture',
    normalizedName: 'fixture',
    createdAt: now,
  });
  const mutual = personSchema.parse({
    id: 'mutual-1',
    name: 'Mutual',
    normalizedName: 'mutual',
    type: 'mutual',
    createdAt: now,
    updatedAt: now,
  });
  const target = personSchema.parse({
    id: 'target-1',
    name: 'Target',
    normalizedName: 'target',
    type: 'target',
    companyId: company.id,
    mutualPersonIds: [mutual.id],
    createdAt: now,
    updatedAt: now,
  });
  const route = routeSchema.parse({
    id: 'route-1',
    companyId: company.id,
    targetPersonId: target.id,
    mutualPersonId: mutual.id,
    owner: 'Paul',
    stage: 'Found route',
    confidence: 'emerging',
    outcome: 'pending',
    createdAt: now,
  });
  await repository.upsertTransaction({ companies: [company], people: [mutual, target], routes: [route] });
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { repository, backups, ...keys };
}

describe('encrypted Hostinger backups', () => {
  it('retains two successful encrypted copies and decrypts a validated bundle', async () => {
    const state = await fixture();
    for (const day of [1, 2, 3])
      await runHostingerBackup({
        repository: state.repository,
        directory: state.backups,
        publicKeyPem: state.publicKey,
        now: new Date(`2026-07-0${day}T02:15:00.000Z`),
      });
    const files = readdirSync(state.backups)
      .filter((name) => name.endsWith('.nwbackup'))
      .sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toContain('2026-07-02');
    const envelope = JSON.parse(readFileSync(join(state.backups, files[1]!), 'utf8'));
    expect(verifyBackupEnvelope(envelope).format).toBe('northwind-encrypted-backup');
    const bundle = decryptBackup(envelope, state.privateKey) as { stores: { companies: unknown[]; routes: unknown[] } };
    expect(bundle.stores.companies).toHaveLength(1);
    expect(bundle.stores.routes).toHaveLength(1);
    const invalidBundle = structuredClone(bundle) as unknown as { manifest: { companies: { count: number } } };
    invalidBundle.manifest.companies.count += 1;
    expect(() => validateBackupBundle(invalidBundle)).toThrow(/manifest/);
  });

  it('preserves existing copies when a new backup fails and refuses concurrent execution', async () => {
    const state = await fixture();
    await runHostingerBackup({ repository: state.repository, directory: state.backups, publicKeyPem: state.publicKey });
    await expect(
      runHostingerBackup({ repository: state.repository, directory: state.backups, publicKeyPem: 'invalid-key' }),
    ).rejects.toThrow();
    expect(readdirSync(state.backups).filter((name) => name.endsWith('.nwbackup'))).toHaveLength(1);
    const lock = openSync(join(state.backups, '.backup.lock'), 'w');
    closeSync(lock);
    await expect(
      runHostingerBackup({ repository: state.repository, directory: state.backups, publicKeyPem: state.publicKey }),
    ).rejects.toMatchObject({ code: 'BACKUP_RUNNING' });
    expect(existsSync(join(state.backups, '.backup.lock'))).toBe(true);
  });

  it('detects ciphertext corruption before decryption', async () => {
    const state = await fixture();
    await runHostingerBackup({ repository: state.repository, directory: state.backups, publicKeyPem: state.publicKey });
    const file = readdirSync(state.backups).find((name) => name.endsWith('.nwbackup'))!;
    const path = join(state.backups, file);
    const envelope = JSON.parse(readFileSync(path, 'utf8'));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -4)}AAAA`;
    writeFileSync(path, JSON.stringify(envelope));
    expect(() => verifyBackupEnvelope(envelope)).toThrow(/corrupted/);
    delete envelope.iv;
    expect(() => verifyBackupEnvelope(envelope)).toThrow(/corrupted/);
  });
});
