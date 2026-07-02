import { afterAll, describe, expect, it } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreRepository } from './firestore-repository.js';
import { VersionConflictError } from './repository.js';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const suite = emulator ? describe : describe.skip;

suite('Firestore repository emulator integration', () => {
  const db = new Firestore({ projectId: 'demo-northwind-crm' });
  const repository = createFirestoreRepository(db);
  const workspaceId = `test-${Date.now()}`;

  afterAll(async () => {
    await db.recursiveDelete(db.collection('workspaces').doc(workspaceId));
    await db.terminate();
  });

  it('persists records and rejects a stale update transactionally', async () => {
    const created = await repository.create(
      'companies',
      { id: 'company-1', name: 'Acme', createdAt: '2026-01-01T00:00:00.000Z' },
      workspaceId,
    );
    const updated = await repository.update('companies', created.id, { name: 'Acme Two' }, 1, workspaceId);
    expect(updated.version).toBe(2);
    await expect(repository.update('companies', created.id, { name: 'Stale' }, 1, workspaceId)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    expect(await repository.list('companies', workspaceId)).toMatchObject([{ name: 'Acme Two', version: 2 }]);
  });
});
