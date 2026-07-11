import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { companySchema } from '@northwind/domain';
import { VersionConflictError, createJsonRepository } from './json-repository.js';

const dirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'northwind-repo-'));
  dirs.push(dir);
  for (const store of ['companies', 'people', 'routes', 'activities'])
    writeFileSync(join(dir, `${store}.json`), '[]\n');
  return dir;
};

afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('JSON repository', () => {
  it('normalizes legacy scope fields while preserving the stored record', async () => {
    const dir = makeDir();
    writeFileSync(
      join(dir, 'companies.json'),
      JSON.stringify([{ id: 'c1', name: 'Acme', createdAt: '2026-01-01T00:00:00Z' }]),
    );
    const repo = createJsonRepository(dir);
    expect(await repo.list('companies', 'default')).toMatchObject([{ id: 'c1', workspaceId: 'default', version: 1 }]);
  });

  it('rejects stale optimistic writes with a version conflict', async () => {
    const dir = makeDir();
    const repo = createJsonRepository(dir);
    const created = await repo.create(
      'companies',
      { id: 'c1', name: 'Acme', createdAt: '2026-01-01T00:00:00Z' },
      'default',
    );
    await repo.update('companies', 'c1', { name: 'Acme Two' }, created.version, 'default');
    await expect(repo.update('companies', 'c1', { name: 'Stale' }, created.version, 'default')).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });

  it('serializes concurrent mutations without losing records', async () => {
    const dir = makeDir();
    const repo = createJsonRepository(dir);
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        repo.create(
          'activities',
          {
            id: `a${index}`,
            actor: 'QA',
            type: 'note',
            summary: `Note ${index}`,
            timestamp: '2026-01-01T00:00:00Z',
          },
          'default',
        ),
      ),
    );
    expect(await repo.list('activities', 'default')).toHaveLength(12);
    expect(JSON.parse(readFileSync(join(dir, 'activities.json'), 'utf8')).length).toBe(12);
  });

  it('returns stable cursor pages without gaps or duplicates', async () => {
    const repo = createJsonRepository(makeDir());
    const records = Array.from({ length: 105 }, (_, index) =>
      companySchema.parse({
        id: `company-${String(index).padStart(3, '0')}`,
        name: `Fixture ${String(index % 11).padStart(2, '0')}`,
        normalizedName: `fixture ${String(index % 11).padStart(2, '0')}`,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    await repo.upsertTransaction({ companies: records });
    const collected: string[] = [];
    let startAfter: [unknown, string] | undefined;
    do {
      const page = await repo.page('companies', 'default', {
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
  });
});
