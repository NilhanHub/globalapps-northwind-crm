import { afterAll, describe, expect, it } from 'vitest';
import { Firestore } from '@google-cloud/firestore';
import { createFirestoreRepository } from './firestore-repository.js';
import { VersionConflictError } from './repository.js';
import { companySchema } from '@northwind/domain';

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
    const revisionBeforeNoop = await repository.getWorkspaceRevision(workspaceId);
    await repository.upsertTransaction({ companies: [{ ...updated, optionalField: undefined }] });
    expect(await repository.getWorkspaceRevision(workspaceId)).toEqual(revisionBeforeNoop);
    await expect(repository.update('companies', created.id, { name: 'Stale' }, 1, workspaceId)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    expect(await repository.list('companies', workspaceId)).toMatchObject([{ name: 'Acme Two', version: 2 }]);
  });

  it('paginates with a deterministic document-id tie breaker', async () => {
    const pageWorkspace = `${workspaceId}-pages`;
    const records = Array.from({ length: 105 }, (_, index) =>
      companySchema.parse({
        id: `company-${String(index).padStart(3, '0')}`,
        name: `Paged ${String(index % 7).padStart(2, '0')}`,
        normalizedName: `paged ${String(index % 7).padStart(2, '0')}`,
        createdAt: '2026-01-01T00:00:00.000Z',
        workspaceId: pageWorkspace,
      }),
    );
    await repository.upsertTransaction({ companies: records });
    const collected: string[] = [];
    let startAfter: [unknown, string] | undefined;
    do {
      const page = await repository.page('companies', pageWorkspace, {
        limit: 50,
        orderBy: 'normalizedName',
        direction: 'asc',
        ...(startAfter ? { startAfter } : {}),
      });
      collected.push(...page.items.map((item) => item.id));
      startAfter = page.nextAnchor ?? undefined;
    } while (startAfter);
    expect(collected).toHaveLength(105);
    expect(new Set(collected)).toHaveLength(105);
    await db.recursiveDelete(db.collection('workspaces').doc(pageWorkspace));
  });
});
