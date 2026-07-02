import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateDataStores } from './migration.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('data migration', () => {
  it('copies and verifies root stores without deleting originals', () => {
    const root = mkdtempSync(join(tmpdir(), 'northwind-migrate-'));
    dirs.push(root);
    for (const name of ['companies', 'people', 'routes', 'activities'])
      writeFileSync(join(root, `${name}.json`), '[]\n');
    const result = migrateDataStores(root, join(root, 'data'));
    expect(result.every((item) => item.sourceHash === item.destinationHash)).toBe(true);
    expect(existsSync(join(root, 'companies.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, 'data', 'companies.json'), 'utf8'))).toEqual([]);
  });

  it('is idempotent when destination stores already match', () => {
    const root = mkdtempSync(join(tmpdir(), 'northwind-migrate-'));
    dirs.push(root);
    for (const name of ['companies', 'people', 'routes', 'activities'])
      writeFileSync(join(root, `${name}.json`), '[]\n');
    migrateDataStores(root, join(root, 'data'));
    expect(migrateDataStores(root, join(root, 'data')).map((item) => item.status)).toEqual([
      'unchanged',
      'unchanged',
      'unchanged',
      'unchanged',
    ]);
  });
});
