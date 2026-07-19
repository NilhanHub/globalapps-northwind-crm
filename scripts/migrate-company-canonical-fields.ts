import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { activitySchema } from '@northwind/domain';
import { createFirebaseFirestore } from '../apps/api/src/firebase.js';
import { resolveRepositoryConfig } from '../apps/api/src/runtime-config.js';
import {
  planCompanyCanonicalRepairs,
  type CompanyCanonicalRepair,
} from '../apps/api/src/services/company-canonical-migration.js';

const supportedFlags = new Set(['--apply', '--dry-run']);
const unknownFlags = process.argv.slice(2).filter((argument) => !supportedFlags.has(argument));
if (unknownFlags.length) throw new Error(`Unsupported flags: ${unknownFlags.join(', ')}`);
if (process.argv.includes('--apply') && process.argv.includes('--dry-run'))
  throw new Error('Choose either --apply or --dry-run');

const apply = process.argv.includes('--apply');
const workspaceId = process.env.CRM_WORKSPACE_ID || 'default';
const config = resolveRepositoryConfig({ ...process.env, CRM_REPOSITORY: 'firestore' });
if (config.mode !== 'firestore') throw new Error('Company canonical-field migration requires Firestore');
const db = createFirebaseFirestore({
  projectId: config.projectId,
  databaseId: config.databaseId,
  ...(config.serviceAccountBase64 ? { serviceAccountBase64: config.serviceAccountBase64 } : {}),
});
const workspace = db.collection('workspaces').doc(workspaceId);
const companies = workspace.collection('companies');

const readRawCompanies = async () => (await companies.get()).docs.map((snapshot) => snapshot.data());
const fingerprint = (repairs: CompanyCanonicalRepair[]) =>
  repairs
    .map((repair) => `${repair.record.id}:${repair.expectedVersion}:${repair.reasons.join(',')}`)
    .sort()
    .join('|');

try {
  const migrationAt = new Date().toISOString();
  const planned = planCompanyCanonicalRepairs(await readRawCompanies(), migrationAt);
  if (apply && planned.length) {
    await db.runTransaction(
      async (transaction) => {
        const references = planned.map((repair) => companies.doc(repair.record.id));
        const snapshots = [];
        for (const reference of references) snapshots.push(await transaction.get(reference));
        const workspaceSnapshot = await transaction.get(workspace);
        if (snapshots.some((snapshot) => !snapshot.exists))
          throw new Error('Company data changed after migration preflight; refusing the write');
        const live = planCompanyCanonicalRepairs(
          snapshots.map((snapshot) => snapshot.data() as Record<string, unknown>),
          migrationAt,
        );
        if (fingerprint(live) !== fingerprint(planned))
          throw new Error('Company data changed after migration preflight; refusing the write');

        for (const repair of live) transaction.set(companies.doc(repair.record.id), repair.record);
        const activity = activitySchema.parse({
          id: `activity-company-canonical-migration-${randomUUID()}`,
          actor: 'system-company-canonical-migration',
          type: 'company_canonical_migration',
          summary: `Repaired canonical fields for ${live.length} companies`,
          timestamp: migrationAt,
          workspaceId,
        });
        transaction.create(workspace.collection('activities').doc(activity.id), activity);
        transaction.set(
          workspace,
          {
            revision: Number(workspaceSnapshot.data()?.revision ?? 0) + 1,
            updatedAt: migrationAt,
          },
          { merge: true },
        );
      },
      { maxAttempts: 1 },
    );
  }

  const remaining = planCompanyCanonicalRepairs(await readRawCompanies());
  if (apply && remaining.length) throw new Error(`Migration left ${remaining.length} non-canonical company records`);
  const reasonCounts = planned
    .flatMap((repair) => repair.reasons)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  console.log(
    JSON.stringify({
      ok: true,
      mode: apply ? 'apply' : 'dry-run',
      projectId: config.projectId,
      databaseId: config.databaseId,
      workspaceId,
      planned: planned.length,
      applied: apply ? planned.length : 0,
      remaining: remaining.length,
      reasons: reasonCounts,
    }),
  );
} finally {
  await db.terminate();
}
