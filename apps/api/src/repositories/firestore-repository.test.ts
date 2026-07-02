import { describe, expect, it } from 'vitest';
import { firestoreCollectionPath, sortFirestoreRecords, validateFirestoreTransition } from './firestore-repository.js';
import { VersionConflictError } from './repository.js';

describe('Firestore repository safeguards', () => {
  it('scopes every collection below the selected workspace', () => {
    expect(firestoreCollectionPath('default', 'companies')).toBe('workspaces/default/companies');
    expect(() => firestoreCollectionPath('../other', 'companies')).toThrow(/workspace/i);
  });

  it('accepts a one-version update and rejects stale or skipped versions', () => {
    const current = {
      id: 'company-1',
      name: 'Current',
      createdAt: '2026-01-01T00:00:00.000Z',
      workspaceId: 'default',
      version: 3,
    };
    expect(validateFirestoreTransition(current, { ...current, name: 'Next', version: 4 })).toBe('update');
    expect(() => validateFirestoreTransition(current, { ...current, name: 'Stale', version: 3 })).toThrow(
      VersionConflictError,
    );
    expect(() => validateFirestoreTransition(current, { ...current, name: 'Skipped', version: 5 })).toThrow(
      VersionConflictError,
    );
  });

  it('treats equal, identical records as no-op transaction inputs', () => {
    const record = {
      id: 'activity-1',
      actor: 'northwind',
      type: 'note',
      summary: 'Existing activity',
      timestamp: '2026-01-01T00:00:00.000Z',
      workspaceId: 'default',
      version: 1,
    };
    expect(validateFirestoreTransition(record, { ...record })).toBe('noop');
  });

  it('returns activities chronologically even when Firestore document order differs', () => {
    const records = [
      { id: 'z', timestamp: '2026-07-03T00:00:00.000Z' },
      { id: 'a', timestamp: '2026-07-01T00:00:00.000Z' },
      { id: 'm', timestamp: '2026-07-02T00:00:00.000Z' },
    ];
    expect(sortFirestoreRecords('activities', records).map((record) => record.id)).toEqual(['a', 'm', 'z']);
  });
});
