import type { DocumentSnapshot, Firestore } from '@google-cloud/firestore';
import { normalizeRecordScope } from '@northwind/domain';
import {
  FirestoreUnavailableError,
  RecordNotFoundError,
  VersionConflictError,
  storeSchemas,
  type CrmRepository,
  type StoreChanges,
  type StoreName,
  type StoreRecord,
} from './repository.js';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function firestoreCollectionPath(workspaceId: string, store: StoreName) {
  if (!SAFE_SEGMENT.test(workspaceId)) throw new Error('Invalid workspace identifier for Firestore');
  return `workspaces/${workspaceId}/${store}`;
}

export function sortFirestoreRecords<T extends Record<string, unknown>>(store: StoreName, records: T[]): T[] {
  const field = store === 'activities' ? 'timestamp' : 'createdAt';
  return [...records].sort((left, right) => {
    const byTime = String(left[field] ?? '').localeCompare(String(right[field] ?? ''));
    return byTime || String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
}

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

export function validateFirestoreTransition(
  current: Record<string, unknown> | undefined,
  desired: Record<string, unknown>,
): 'create' | 'update' | 'noop' {
  const desiredVersion = Number(desired.version);
  if (!current) {
    if (desiredVersion !== 1) throw new VersionConflictError(0);
    return 'create';
  }
  const currentVersion = Number(current.version);
  if (desiredVersion === currentVersion && canonical(current) === canonical(desired)) return 'noop';
  if (desiredVersion !== currentVersion + 1) throw new VersionConflictError(currentVersion);
  return 'update';
}

function cloudError(error: unknown): never {
  if (error instanceof VersionConflictError || error instanceof RecordNotFoundError) throw error;
  const code = String((error as { code?: unknown })?.code ?? '');
  if (
    ['5', '10', '13', '14', 'deadline-exceeded', 'aborted', 'internal', 'unavailable'].some((item) =>
      code.includes(item),
    )
  ) {
    throw new FirestoreUnavailableError();
  }
  throw error;
}

export function createFirestoreRepository(db: Firestore): CrmRepository {
  const doc = (workspaceId: string, store: StoreName, id: string) => {
    if (!SAFE_SEGMENT.test(id)) throw new Error(`Invalid Firestore record id: ${id}`);
    return db.collection(firestoreCollectionPath(workspaceId, store)).doc(id);
  };

  return {
    async healthCheck() {
      try {
        await db.collection(firestoreCollectionPath('default', 'companies')).limit(1).get();
      } catch (error) {
        cloudError(error);
      }
    },

    async list<S extends StoreName>(store: S, workspaceId: string): Promise<StoreRecord<S>[]> {
      try {
        const snapshot = await db.collection(firestoreCollectionPath(workspaceId, store)).get();
        return sortFirestoreRecords(
          store,
          snapshot.docs.map((item) => storeSchemas[store].parse(normalizeRecordScope(item.data()))),
        ) as StoreRecord<S>[];
      } catch (error) {
        return cloudError(error);
      }
    },

    async create<S extends StoreName>(store: S, input: Record<string, unknown>, workspaceId: string) {
      const record = storeSchemas[store].parse(normalizeRecordScope({ ...input, workspaceId, version: 1 }));
      try {
        await db.runTransaction(async (transaction) => {
          const reference = doc(workspaceId, store, record.id);
          if ((await transaction.get(reference)).exists) throw new VersionConflictError(1);
          transaction.create(reference, record);
        });
        return record as StoreRecord<S>;
      } catch (error) {
        return cloudError(error);
      }
    },

    async update<S extends StoreName>(
      store: S,
      id: string,
      patch: Record<string, unknown>,
      expectedVersion: number,
      workspaceId: string,
    ) {
      try {
        return await db.runTransaction(async (transaction) => {
          const reference = doc(workspaceId, store, id);
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) throw new RecordNotFoundError(id);
          const current = storeSchemas[store].parse(normalizeRecordScope(snapshot.data()!));
          if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
          const updated = storeSchemas[store].parse({
            ...current,
            ...patch,
            id,
            workspaceId,
            version: current.version + 1,
          });
          transaction.set(reference, updated);
          return updated as StoreRecord<S>;
        });
      } catch (error) {
        return cloudError(error);
      }
    },

    async transaction(changes: StoreChanges) {
      const entries = (Object.entries(changes) as [StoreName, Array<Record<string, unknown>>][]).flatMap(
        ([store, records]) =>
          records.map((record) => {
            const parsed = storeSchemas[store].parse(normalizeRecordScope(record));
            return { store, record: parsed, reference: doc(parsed.workspaceId, store, parsed.id) };
          }),
      );
      if (entries.length > 450) throw new Error('A cloud transaction cannot contain more than 450 records');
      try {
        await db.runTransaction(async (transaction) => {
          const snapshots: DocumentSnapshot[] = [];
          for (const entry of entries) snapshots.push(await transaction.get(entry.reference));
          entries.forEach((entry, index) => {
            const snapshot = snapshots[index]!;
            const action = validateFirestoreTransition(
              snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined,
              entry.record,
            );
            if (action === 'create') transaction.create(entry.reference, entry.record);
            if (action === 'update') transaction.set(entry.reference, entry.record);
          });
        });
      } catch (error) {
        cloudError(error);
      }
    },

    async delete<S extends StoreName>(store: S, id: string, expectedVersion: number, workspaceId: string) {
      try {
        await db.runTransaction(async (transaction) => {
          const reference = doc(workspaceId, store, id);
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) throw new RecordNotFoundError(id);
          const current = storeSchemas[store].parse(normalizeRecordScope(snapshot.data()!));
          if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
          transaction.delete(reference);
        });
      } catch (error) {
        cloudError(error);
      }
    },
  };
}
