import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateRepositoryData } from './cloud-migration.js';
import { createJsonRepository } from './repositories/json-repository.js';

const dirs: string[] = [];
function storeDir(companyName?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'northwind-cloud-migration-'));
  dirs.push(dir);
  for (const store of ['companies', 'people', 'routes', 'activities']) {
    const value =
      store === 'companies' && companyName
        ? [{ id: 'c1', name: companyName, createdAt: '2026-01-01T00:00:00.000Z' }]
        : [];
    writeFileSync(join(dir, `${store}.json`), `${JSON.stringify(value)}\n`);
  }
  return dir;
}

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('cloud data migration', () => {
  it('dry-runs without writing and reports stable source hashes', async () => {
    const source = createJsonRepository(storeDir('Acme'));
    const destination = createJsonRepository(storeDir());
    const report = await migrateRepositoryData(source, destination, { workspaceId: 'default', dryRun: true });
    expect(report.stores.companies).toMatchObject({ sourceCount: 1, destinationCount: 0, createCount: 1 });
    expect(report.stores.companies.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await destination.list('companies', 'default')).toHaveLength(0);
  });

  it('is idempotent and refuses to replace a differing destination record', async () => {
    const source = createJsonRepository(storeDir('Acme'));
    const destination = createJsonRepository(storeDir());
    await migrateRepositoryData(source, destination, { workspaceId: 'default', dryRun: false });
    const second = await migrateRepositoryData(source, destination, { workspaceId: 'default', dryRun: false });
    expect(second.stores.companies).toMatchObject({ createCount: 0, unchangedCount: 1 });

    const conflicting = createJsonRepository(storeDir('Different'));
    await expect(
      migrateRepositoryData(conflicting, destination, { workspaceId: 'default', dryRun: false }),
    ).rejects.toThrow(/differs/i);
  });
});
