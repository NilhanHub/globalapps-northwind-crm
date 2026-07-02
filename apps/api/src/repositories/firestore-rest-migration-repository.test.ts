import { describe, expect, it, vi } from 'vitest';
import {
  createFirestoreRestMigrationRepository,
  fromFirestoreFields,
  toFirestoreFields,
} from './firestore-rest-migration-repository.js';

describe('Firestore REST migration repository', () => {
  it('round-trips JSON-compatible CRM records through Firestore values', () => {
    const record = {
      id: 'c1',
      name: 'Acme',
      size: 20,
      contacted: false,
      tags: ['warm', 'priority'],
      nextStep: { type: 'call', note: '' },
      optional: null,
    };
    expect(fromFirestoreFields(toFirestoreFields(record))).toEqual(record);
  });

  it('lists and creates records with a supplied approved-user token without exposing it in data', async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET')
        return new Response(
          JSON.stringify({
            documents: [
              {
                name: 'projects/p/databases/(default)/documents/workspaces/default/companies/c1',
                fields: toFirestoreFields({
                  id: 'c1',
                  name: 'Acme',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  workspaceId: 'default',
                  version: 1,
                }),
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      return new Response(JSON.stringify({ fields: JSON.parse(String(init.body)).fields }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const repository = createFirestoreRestMigrationRepository({
      projectId: 'globalapps-northwind-crm',
      tokenProvider: async () => 'in-memory-token',
      fetcher: fetcher as typeof fetch,
    });
    expect(await repository.list('companies', 'default')).toMatchObject([{ id: 'c1', name: 'Acme' }]);
    await repository.create(
      'activities',
      {
        id: 'a1',
        actor: 'migration',
        type: 'migration',
        summary: 'Migrated',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      'default',
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.stringContaining('documentId=a1'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer in-memory-token' }) }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('private_key');
  });
});
