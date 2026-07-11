import { createHash } from 'node:crypto';
import type { Firestore } from '@google-cloud/firestore';
import { auditWorkspaceData, canonicalize } from '@northwind/domain';
import { storeSchemas, type StoreName } from '../repositories/repository.js';

export const RESTORE_STORES: StoreName[] = [
  'companies',
  'people',
  'routes',
  'activities',
  'importJobs',
  'owners',
  'settings',
];

type BackupManifestEntry = {
  count: number;
  ids: string[];
  canonicalSha256: string;
};

export type ValidatedBackupBundle = {
  schemaVersion: 2;
  createdAt: string;
  workspaceId: string;
  stores: Record<StoreName, Array<Record<string, unknown>>>;
  manifest: Record<StoreName, BackupManifestEntry>;
};

export type RestoreTarget = {
  projectId: string;
  targetDatabaseId: string;
  sourceDatabaseId: string;
  productionDatabaseId?: string;
  workspaceId: string;
  confirmation: string;
};

const DATABASE_ID = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const DEFAULT_DATABASE_IDS = new Set(['(default)', 'default']);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function sortedRecords(records: Array<Record<string, unknown>>) {
  return [...records].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function exactRecord(left: Record<string, unknown>, right: Record<string, unknown>) {
  return canonicalize(left) === canonicalize(right);
}

export function restoreConfirmationPhrase(target: Omit<RestoreTarget, 'confirmation'>) {
  return `RESTORE ${target.projectId}/${target.targetDatabaseId}/${target.workspaceId}`;
}

/**
 * Guardrails for a restore drill. The source/default database can never be the
 * target, and an explicit phrase makes accidental invocation fail closed.
 */
export function assertSafeRestoreTarget(target: RestoreTarget) {
  if (!PROJECT_ID.test(target.projectId)) throw new Error('A valid explicit target project ID is required');
  if (!DATABASE_ID.test(target.targetDatabaseId) || DEFAULT_DATABASE_IDS.has(target.targetDatabaseId))
    throw new Error('The restore target must be an explicit non-default Firestore database ID');
  if (!target.sourceDatabaseId.trim()) throw new Error('The source database ID must be declared explicitly');
  if (target.targetDatabaseId === target.sourceDatabaseId)
    throw new Error('The restore target cannot be the source Firestore database');
  const productionDatabaseId = target.productionDatabaseId?.trim() || '(default)';
  if (target.targetDatabaseId === productionDatabaseId)
    throw new Error('The restore target cannot be the production Firestore database');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target.workspaceId))
    throw new Error('A valid workspace ID is required');
  const expected = restoreConfirmationPhrase(target);
  if (target.confirmation !== expected)
    throw new Error(`Restore confirmation did not match. Expected exactly: ${expected}`);
}

async function readTargetStore(db: Firestore, workspaceId: string, store: StoreName) {
  const snapshot = await db.collection(`workspaces/${workspaceId}/${store}`).get();
  return sortedRecords(
    snapshot.docs.map((document) => {
      const record = storeSchemas[store].parse(document.data()) as Record<string, unknown>;
      if (record.id !== document.id) throw new Error(`${store}/${document.id} has a mismatched record ID`);
      if (record.workspaceId !== workspaceId)
        throw new Error(`${store}/${document.id} belongs to a different workspace`);
      return record;
    }),
  );
}

function verifyStoreAgainstManifest(
  store: StoreName,
  records: Array<Record<string, unknown>>,
  manifest: BackupManifestEntry,
) {
  const ids = records.map((record) => String(record.id));
  if (records.length !== manifest.count) throw new Error(`${store} restore count does not match the backup manifest`);
  if (canonicalize(ids) !== canonicalize(manifest.ids))
    throw new Error(`${store} restored IDs do not match the backup manifest`);
  if (sha256(canonicalize(records)) !== manifest.canonicalSha256)
    throw new Error(`${store} restored data hash does not match the backup manifest`);
}

/**
 * Restores a previously decrypted and validated bundle into an existing,
 * explicitly named temporary Firestore database. No delete operation is used.
 * Exact pre-existing records are treated as completed work, so an interrupted
 * restore can be resumed. Conflicting or extra target records fail preflight
 * before any new document is written.
 */
export async function restoreValidatedBackupToFirestore(input: {
  db: Firestore;
  bundle: ValidatedBackupBundle;
  target: RestoreTarget;
  batchSize?: number;
}) {
  assertSafeRestoreTarget(input.target);
  if (input.bundle.workspaceId !== input.target.workspaceId)
    throw new Error('The requested workspace does not match the validated backup workspace');
  const batchSize = input.batchSize ?? 400;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 450)
    throw new Error('Restore batch size must be between 1 and 450');

  const missing: Array<{ store: StoreName; record: Record<string, unknown> }> = [];
  let unchanged = 0;

  for (const store of RESTORE_STORES) {
    const source = sortedRecords(input.bundle.stores[store]);
    verifyStoreAgainstManifest(store, source, input.bundle.manifest[store]);
    for (const record of source) {
      if (record.workspaceId !== input.bundle.workspaceId)
        throw new Error(`${store}/${String(record.id)} is not scoped to the backup workspace`);
      storeSchemas[store].parse(record);
    }
    const existing = await readTargetStore(input.db, input.target.workspaceId, store);
    const sourceById = new Map(source.map((record) => [String(record.id), record]));
    for (const record of existing) {
      const expected = sourceById.get(String(record.id));
      if (!expected) throw new Error(`${store}/${String(record.id)} exists only in the restore target`);
      if (!exactRecord(record, expected))
        throw new Error(`${store}/${String(record.id)} conflicts with the validated backup`);
    }
    const existingById = new Map(existing.map((record) => [String(record.id), record]));
    for (const record of source) {
      if (existingById.has(String(record.id))) unchanged += 1;
      else missing.push({ store, record });
    }
  }

  let created = 0;
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    const batch = input.db.batch();
    const chunk = missing.slice(offset, offset + batchSize);
    for (const { store, record } of chunk) {
      const reference = input.db.doc(`workspaces/${input.target.workspaceId}/${store}/${String(record.id)}`);
      batch.create(reference, record);
    }
    await batch.commit();
    created += chunk.length;
  }

  const workspaceReference = input.db.doc(`workspaces/${input.target.workspaceId}`);
  await input.db.runTransaction(async (transaction) => {
    const current = await transaction.get(workspaceReference);
    if (!current.exists) {
      transaction.create(workspaceReference, {
        revision: 1,
        updatedAt: input.bundle.createdAt,
        restoreCompletedAt: new Date().toISOString(),
        restoredFromBackupCreatedAt: input.bundle.createdAt,
      });
    }
  });

  const verifiedStores = {} as Record<StoreName, Array<Record<string, unknown>>>;
  for (const store of RESTORE_STORES) {
    const records = await readTargetStore(input.db, input.target.workspaceId, store);
    verifyStoreAgainstManifest(store, records, input.bundle.manifest[store]);
    verifiedStores[store] = records;
  }
  const integrity = auditWorkspaceData({
    companies: verifiedStores.companies,
    people: verifiedStores.people,
    routes: verifiedStores.routes,
    activities: verifiedStores.activities,
    owners: verifiedStores.owners,
    settings: verifiedStores.settings,
    workspaceId: input.target.workspaceId,
  });
  if (!integrity.ok) throw new Error(`Restored database has ${integrity.issues.length} integrity issue(s)`);

  return {
    ok: true as const,
    projectId: input.target.projectId,
    databaseId: input.target.targetDatabaseId,
    workspaceId: input.target.workspaceId,
    created,
    unchanged,
    counts: integrity.counts,
    issueCount: 0,
    manifestVerified: true,
  };
}
