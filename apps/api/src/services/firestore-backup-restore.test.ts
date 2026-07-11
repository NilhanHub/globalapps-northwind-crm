import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Firestore } from '@google-cloud/firestore';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { companySchema } from '@northwind/domain';
import { createJsonRepository } from '../repositories/json-repository.js';
import { decryptBackup, runHostingerBackup } from './hostinger-backup.js';
import {
  assertSafeRestoreTarget,
  restoreConfirmationPhrase,
  restoreValidatedBackupToFirestore,
  type RestoreTarget,
} from './firestore-backup-restore.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

function target(overrides: Partial<RestoreTarget> = {}): RestoreTarget {
  const base = {
    projectId: 'demo-northwind-crm',
    targetDatabaseId: 'restore-drill',
    sourceDatabaseId: '(default)',
    productionDatabaseId: '(default)',
    workspaceId: 'default',
  };
  return { ...base, confirmation: restoreConfirmationPhrase(base), ...overrides };
}

describe('Firestore backup restore safeguards', () => {
  it('requires an explicit non-default, non-source, non-production target and exact confirmation', () => {
    expect(() => assertSafeRestoreTarget(target())).not.toThrow();
    expect(() => assertSafeRestoreTarget(target({ targetDatabaseId: '(default)' }))).toThrow(/non-default/);
    expect(() => assertSafeRestoreTarget(target({ sourceDatabaseId: 'restore-drill' }))).toThrow(/source/);
    expect(() => assertSafeRestoreTarget(target({ productionDatabaseId: 'restore-drill' }))).toThrow(/production/);
    expect(() => assertSafeRestoreTarget(target({ confirmation: 'yes' }))).toThrow(/confirmation/);
  });
});

const emulatorSuite = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

emulatorSuite('Firestore encrypted-backup restore', () => {
  const databaseId = `restore-drill-${Date.now()}`;
  const db = new Firestore({ projectId: 'demo-northwind-crm', databaseId });
  const workspaceId = `restore-${Date.now()}`;

  afterAll(async () => {
    await db.recursiveDelete(db.collection('workspaces').doc(workspaceId));
    await db.terminate();
  });

  it('preserves IDs and versions, resumes idempotently, and refuses conflicts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'northwind-firestore-restore-'));
    dirs.push(root);
    const repository = createJsonRepository(join(root, 'data'));
    const created = await repository.create(
      'companies',
      companySchema.parse({
        id: 'company-preserved',
        name: 'Preserved',
        normalizedName: 'preserved',
        createdAt: '2026-07-01T00:00:00.000Z',
      }),
      workspaceId,
    );
    const versionTwo = await repository.update(
      'companies',
      created.id,
      { website: 'https://example.com' },
      1,
      workspaceId,
    );
    const versionThree = await repository.update('companies', created.id, { notes: 'Restore fixture' }, 2, workspaceId);
    expect(versionTwo.version).toBe(2);
    expect(versionThree.version).toBe(3);

    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const backupDirectory = join(root, 'backups');
    await runHostingerBackup({ repository, directory: backupDirectory, publicKeyPem: keys.publicKey, workspaceId });
    const archive = readdirSync(backupDirectory).find((name) => name.endsWith('.nwbackup'))!;
    const bundle = decryptBackup(JSON.parse(readFileSync(join(backupDirectory, archive), 'utf8')), keys.privateKey);
    const restoreTargetBase = {
      projectId: 'demo-northwind-crm',
      targetDatabaseId: databaseId,
      sourceDatabaseId: '(default)',
      productionDatabaseId: '(default)',
      workspaceId,
    };
    const restoreTarget = {
      ...restoreTargetBase,
      confirmation: restoreConfirmationPhrase(restoreTargetBase),
    };

    const first = await restoreValidatedBackupToFirestore({ db, bundle, target: restoreTarget });
    expect(first).toMatchObject({ created: 1, unchanged: 0, issueCount: 0, manifestVerified: true });
    const stored = await db.doc(`workspaces/${workspaceId}/companies/company-preserved`).get();
    expect(stored.data()).toMatchObject({ id: 'company-preserved', version: 3, notes: 'Restore fixture' });

    const second = await restoreValidatedBackupToFirestore({ db, bundle, target: restoreTarget });
    expect(second).toMatchObject({ created: 0, unchanged: 1, issueCount: 0, manifestVerified: true });

    await db.doc(`workspaces/${workspaceId}/companies/company-preserved`).update({ name: 'Conflicting target' });
    await expect(restoreValidatedBackupToFirestore({ db, bundle, target: restoreTarget })).rejects.toThrow(/conflicts/);
    expect((await db.doc(`workspaces/${workspaceId}/companies/company-preserved`).get()).data()?.name).toBe(
      'Conflicting target',
    );
  });
});
