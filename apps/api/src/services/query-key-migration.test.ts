import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { companySchema, personSchema } from '@northwind/domain';
import { createJsonRepository } from '../repositories/json-repository.js';
import { migrateQueryKeys } from './query-key-migration.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('query-key migration', () => {
  it('fills legacy normalized keys once without changing record IDs', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'northwind-query-key-'));
    directories.push(directory);
    const repository = createJsonRepository(directory);
    await repository.upsertTransaction({
      companies: [companySchema.parse({ id: 'company-1', name: 'A & B Ltd', createdAt: '2026-01-01T00:00:00Z' })],
      people: [
        personSchema.parse({
          id: 'person-1',
          name: 'Áda One',
          type: 'mutual',
          linkedinUrl: 'https://www.linkedin.com/in/ada-one/',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      ],
    });
    await expect(migrateQueryKeys(repository)).resolves.toMatchObject({
      changed: true,
      companiesUpdated: 1,
      peopleUpdated: 1,
    });
    expect((await repository.list('companies', 'default'))[0]).toMatchObject({
      id: 'company-1',
      normalizedName: 'a and b ltd',
    });
    expect((await repository.list('people', 'default'))[0]).toMatchObject({
      id: 'person-1',
      normalizedName: 'ada one',
      normalizedLinkedInKey: 'linkedin.com/in/ada-one',
    });
    await expect(migrateQueryKeys(repository)).resolves.toMatchObject({ changed: false });
  });
});
