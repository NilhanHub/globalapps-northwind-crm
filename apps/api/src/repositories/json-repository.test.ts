import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
});
