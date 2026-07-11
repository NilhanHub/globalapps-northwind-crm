import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditWorkspaceData } from '@northwind/domain';
import { createMaintenanceRepository } from './lib/maintenance-repository.js';
import { canonicalRecords, exportStores, sha256 } from './lib/data-export.js';

const workspaceId = process.env.CRM_WORKSPACE_ID || 'default';
const { repository, repositoryType } = createMaintenanceRepository();
if (repositoryType !== 'firestore' && !process.argv.includes('--allow-json'))
  throw new Error('This command exports Firestore. Use --allow-json only for an isolated verification fixture.');
const exportedAt = new Date().toISOString();
const stamp = exportedAt.replace(/[:.]/g, '-');
const output = resolve(process.env.CRM_EXPORT_DIR || resolve('Evidence', 'firestore-exports', stamp));
mkdirSync(output, { recursive: true });
const data: Record<string, Array<Record<string, unknown>>> = {};
const stores: Record<string, { file: string; count: number; ids: string[]; sha256: string; canonicalSha256: string }> =
  {};
for (const store of exportStores) {
  const records = canonicalRecords((await repository.list(store, workspaceId)) as Array<Record<string, unknown>>);
  const filename = `${store}.json`;
  const serialized = `${JSON.stringify(records, null, 2)}\n`;
  writeFileSync(resolve(output, filename), serialized, 'utf8');
  data[store] = records;
  stores[store] = {
    file: filename,
    count: records.length,
    ids: records.map((record) => String(record.id)).sort(),
    sha256: sha256(serialized),
    canonicalSha256: sha256(JSON.stringify(records)),
  };
}
const integrity = auditWorkspaceData({
  companies: data.companies!,
  people: data.people!,
  routes: data.routes!,
  activities: data.activities!,
  owners: data.owners!,
  settings: data.settings!,
  workspaceId,
});
const manifest = { schemaVersion: 2, exportedAt, repositoryType, workspaceId, stores, integrity };
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify({ ok: integrity.ok, output, counts: integrity.counts, issueCount: integrity.issues.length }, null, 2),
);
if (!integrity.ok) process.exitCode = 2;
