import { normalizeRecordScope } from '@northwind/domain';
import {
  FirestoreUnavailableError,
  VersionConflictError,
  storeSchemas,
  type CrmRepository,
  type StoreName,
  type StoreRecord,
} from './repository.js';

type FirestoreValue = {
  nullValue?: null;
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number')
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value && typeof value === 'object')
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  throw new Error(`Unsupported Firestore migration value: ${typeof value}`);
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue?.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue?.fields ?? {});
  throw new Error('Unsupported Firestore value returned during migration');
}

export function toFirestoreFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

export function fromFirestoreFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

export function createFirestoreRestMigrationRepository(options: {
  projectId: string;
  databaseId?: string;
  tokenProvider: () => Promise<string>;
  fetcher?: typeof fetch;
}): CrmRepository {
  const fetcher = options.fetcher ?? fetch;
  const databaseId = options.databaseId ?? '(default)';
  if (!/^\(default\)$|^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId))
    throw new Error('Firestore database ID is invalid');
  const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(options.projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
  const collectionUrl = (workspaceId: string, store: StoreName) =>
    `${root}/workspaces/${encodeURIComponent(workspaceId)}/${store}`;
  const request = async (url: string, init: RequestInit = {}) => {
    const token = await options.tokenProvider();
    const response = await fetcher(url, {
      ...init,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    if (response.status === 409) throw new VersionConflictError(1);
    if (!response.ok) throw new FirestoreUnavailableError();
    return (await response.json()) as Record<string, unknown>;
  };

  return {
    async healthCheck() {
      await request(`${collectionUrl('default', 'companies')}?pageSize=1`);
    },
    async getWorkspaceRevision() {
      return { revision: 'migration-only', updatedAt: '' };
    },
    async list<S extends StoreName>(store: S, workspaceId: string): Promise<StoreRecord<S>[]> {
      const records: StoreRecord<S>[] = [];
      let pageToken = '';
      do {
        const query = new URLSearchParams({ pageSize: '300' });
        if (pageToken) query.set('pageToken', pageToken);
        const payload = await request(`${collectionUrl(workspaceId, store)}?${query}`);
        const documents = Array.isArray(payload.documents) ? payload.documents : [];
        for (const document of documents) {
          const fields = (document as { fields?: Record<string, FirestoreValue> }).fields ?? {};
          records.push(storeSchemas[store].parse(normalizeRecordScope(fromFirestoreFields(fields))) as StoreRecord<S>);
        }
        pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
      } while (pageToken);
      return records;
    },
    async create<S extends StoreName>(store: S, input: Record<string, unknown>, workspaceId: string) {
      const record = storeSchemas[store].parse(normalizeRecordScope({ ...input, workspaceId, version: 1 }));
      const payload = await request(
        `${collectionUrl(workspaceId, store)}?${new URLSearchParams({ documentId: record.id })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFirestoreFields(record) }),
        },
      );
      const fields = (payload as { fields?: Record<string, FirestoreValue> }).fields ?? {};
      return storeSchemas[store].parse(normalizeRecordScope(fromFirestoreFields(fields))) as StoreRecord<S>;
    },
    async update() {
      throw new Error('The migration-only REST repository cannot update records');
    },
    async transaction() {
      throw new Error('The migration-only REST repository cannot run application transactions');
    },
    async upsertTransaction() {
      throw new Error('The migration-only REST repository cannot run application transactions');
    },
    async delete() {
      throw new Error('The migration-only REST repository cannot delete records');
    },
  };
}
