import {
  FieldPath,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from '@google-cloud/firestore';
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
  type PageQuery,
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
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item === undefined ? null : item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
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

export function translateFirestoreError(error: unknown): never {
  if (error instanceof VersionConflictError || error instanceof RecordNotFoundError) throw error;
  const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
  const transientNumericCodes = new Set(['5', '8', '10', '13', '14']);
  const transientNamedCodes = [
    'deadline-exceeded',
    'deadline_exceeded',
    'resource-exhausted',
    'resource_exhausted',
    'aborted',
    'internal',
    'unavailable',
  ];
  if (transientNumericCodes.has(code) || transientNamedCodes.some((item) => code.includes(item))) {
    throw new FirestoreUnavailableError();
  }
  throw error;
}

const cloudError = translateFirestoreError;

export function createFirestoreRepository(db: Firestore): CrmRepository {
  const doc = (workspaceId: string, store: StoreName, id: string) => {
    if (!SAFE_SEGMENT.test(id)) throw new Error(`Invalid Firestore record id: ${id}`);
    return db.collection(firestoreCollectionPath(workspaceId, store)).doc(id);
  };
  const workspaceDoc = (workspaceId: string) => {
    if (!SAFE_SEGMENT.test(workspaceId)) throw new Error('Invalid workspace identifier for Firestore');
    return db.collection('workspaces').doc(workspaceId);
  };
  const bumpRevision = (transaction: Transaction, reference: DocumentReference, snapshot: DocumentSnapshot) => {
    const revision = Number(snapshot.data()?.revision ?? 0) + 1;
    transaction.set(reference, { revision, updatedAt: new Date().toISOString() }, { merge: true });
  };

  const transact = async (changes: StoreChanges) => {
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
        const workspaceIds = [...new Set(entries.map((entry) => entry.record.workspaceId))];
        const metaEntries: Array<{ workspaceId: string; reference: DocumentReference; snapshot: DocumentSnapshot }> =
          [];
        for (const workspaceId of workspaceIds) {
          const reference = workspaceDoc(workspaceId);
          metaEntries.push({ workspaceId, reference, snapshot: await transaction.get(reference) });
        }
        const changedWorkspaceIds = new Set<string>();
        entries.forEach((entry, index) => {
          const snapshot = snapshots[index]!;
          const action = validateFirestoreTransition(
            snapshot.exists ? (snapshot.data() as Record<string, unknown>) : undefined,
            entry.record,
          );
          if (action === 'create') {
            transaction.create(entry.reference, entry.record);
            changedWorkspaceIds.add(entry.record.workspaceId);
          }
          if (action === 'update') {
            transaction.set(entry.reference, entry.record);
            changedWorkspaceIds.add(entry.record.workspaceId);
          }
        });
        for (const meta of metaEntries) {
          if (changedWorkspaceIds.has(meta.workspaceId)) bumpRevision(transaction, meta.reference, meta.snapshot);
        }
      });
    } catch (error) {
      cloudError(error);
    }
  };

  return {
    async healthCheck() {
      try {
        await db.collection(firestoreCollectionPath('default', 'companies')).limit(1).get();
      } catch (error) {
        cloudError(error);
      }
    },

    async getWorkspaceRevision(workspaceId: string) {
      try {
        const snapshot = await workspaceDoc(workspaceId).get();
        return {
          revision: String(snapshot.data()?.revision ?? 0),
          updatedAt: String(snapshot.data()?.updatedAt ?? ''),
        };
      } catch (error) {
        return cloudError(error);
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

    async page<S extends StoreName>(store: S, workspaceId: string, query: PageQuery) {
      try {
        let reference: FirebaseFirestore.Query = db.collection(firestoreCollectionPath(workspaceId, store));
        for (const [field, expected] of Object.entries(query.equals ?? {}))
          reference = reference.where(field, '==', expected);
        if (query.prefix) {
          reference = reference
            .where(query.prefix.field, '>=', query.prefix.value)
            .where(query.prefix.field, '<=', `${query.prefix.value}\uf8ff`);
        }
        reference = reference.orderBy(query.orderBy, query.direction).orderBy(FieldPath.documentId(), query.direction);
        if (query.startAfter) reference = reference.startAfter(...query.startAfter);
        const snapshot = await reference.limit(query.limit + 1).get();
        const hasMore = snapshot.docs.length > query.limit;
        const docs = snapshot.docs.slice(0, query.limit);
        const items = docs.map((item) =>
          storeSchemas[store].parse(normalizeRecordScope(item.data())),
        ) as StoreRecord<S>[];
        const last = items.at(-1) as Record<string, unknown> | undefined;
        return {
          items,
          hasMore,
          nextAnchor: hasMore && last ? ([last[query.orderBy], String(last.id)] as [unknown, string]) : null,
        };
      } catch (error) {
        return cloudError(error);
      }
    },

    async create<S extends StoreName>(store: S, input: Record<string, unknown>, workspaceId: string) {
      const record = storeSchemas[store].parse(normalizeRecordScope({ ...input, workspaceId, version: 1 }));
      try {
        await db.runTransaction(async (transaction) => {
          const reference = doc(workspaceId, store, record.id);
          const metaReference = workspaceDoc(workspaceId);
          const [snapshot, metaSnapshot] = await Promise.all([
            transaction.get(reference),
            transaction.get(metaReference),
          ]);
          if (snapshot.exists) throw new VersionConflictError(1);
          transaction.create(reference, record);
          bumpRevision(transaction, metaReference, metaSnapshot);
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
          const metaReference = workspaceDoc(workspaceId);
          const [snapshot, metaSnapshot] = await Promise.all([
            transaction.get(reference),
            transaction.get(metaReference),
          ]);
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
          bumpRevision(transaction, metaReference, metaSnapshot);
          return updated as StoreRecord<S>;
        });
      } catch (error) {
        return cloudError(error);
      }
    },

    async transaction(changes: StoreChanges) {
      await transact(changes);
    },

    async upsertTransaction(changes: StoreChanges) {
      await transact(changes);
    },

    async delete<S extends StoreName>(store: S, id: string, expectedVersion: number, workspaceId: string) {
      try {
        await db.runTransaction(async (transaction) => {
          const reference = doc(workspaceId, store, id);
          const metaReference = workspaceDoc(workspaceId);
          const [snapshot, metaSnapshot] = await Promise.all([
            transaction.get(reference),
            transaction.get(metaReference),
          ]);
          if (!snapshot.exists) throw new RecordNotFoundError(id);
          const current = storeSchemas[store].parse(normalizeRecordScope(snapshot.data()!));
          if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
          transaction.delete(reference);
          bumpRevision(transaction, metaReference, metaSnapshot);
        });
      } catch (error) {
        cloudError(error);
      }
    },
  };
}
