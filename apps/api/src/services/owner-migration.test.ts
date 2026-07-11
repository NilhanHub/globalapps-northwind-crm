import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { routeSchema } from '@northwind/domain';
import { createJsonRepository } from '../repositories/json-repository.js';
import { migrateOwnerProfiles } from './owner-migration.js';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe('owner profile migration', () => {
  it('maps every existing route once and is idempotent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'northwind-owner-migration-'));
    directories.push(directory);
    const repository = createJsonRepository(directory);
    const route = routeSchema.parse({
      id: 'route-legacy',
      companyId: 'company-1',
      targetPersonId: 'target-1',
      mutualPersonId: 'mutual-1',
      owner: 'Paul',
      stage: 'Found route',
      confidence: 'emerging',
      outcome: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await repository.upsertTransaction({ routes: [route] });

    await expect(migrateOwnerProfiles(repository)).resolves.toMatchObject({
      changed: true,
      ownerCount: 5,
      routeCount: 1,
    });
    const migrated = (await repository.list('routes', 'default'))[0]!;
    expect(migrated).toMatchObject({ ownerId: 'owner-paul', owner: 'Paul', version: route.version + 1 });
    await expect(migrateOwnerProfiles(repository)).resolves.toMatchObject({
      changed: false,
      ownerCount: 5,
      routeCount: 1,
    });
    expect((await repository.list('routes', 'default'))[0]!.version).toBe(migrated.version);
    expect(
      (await repository.list('activities', 'default')).filter((item) => item.type === 'owner_migration'),
    ).toHaveLength(1);
  });
});
