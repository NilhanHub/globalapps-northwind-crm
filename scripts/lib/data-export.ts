import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { auditWorkspaceData, canonicalize } from '@northwind/domain';
import { storeSchemas, type StoreName } from '../../apps/api/src/repositories/repository.js';

export const exportStores: StoreName[] = ['companies', 'people', 'routes', 'activities', 'importJobs', 'owners', 'settings'];

export function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalRecords(records: Array<Record<string, unknown>>) {
  return [...records].sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function validateExportDirectory(directory: string) {
  const resolved = resolve(directory);
  const manifest = JSON.parse(readFileSync(resolve(resolved, 'manifest.json'), 'utf8')) as {
    schemaVersion: number;
    workspaceId: string;
    stores: Record<string, { file: string; count: number; ids: string[]; sha256: string }>;
  };
  if (manifest.schemaVersion !== 2) throw new Error(`Unsupported export schema: ${manifest.schemaVersion}`);
  const data: Record<string, Array<Record<string, unknown>>> = {};
  for (const store of exportStores) {
    const descriptor = manifest.stores[store];
    if (!descriptor) throw new Error(`Manifest is missing ${store}`);
    const file = resolve(resolved, basename(descriptor.file));
    const raw = readFileSync(file);
    if (sha256(raw) !== descriptor.sha256) throw new Error(`${store} file hash does not match its manifest`);
    const records = JSON.parse(raw.toString('utf8')) as Array<Record<string, unknown>>;
    if (!Array.isArray(records) || records.length !== descriptor.count) throw new Error(`${store} count does not match`);
    const parsed = records.map((record) => storeSchemas[store].parse(record) as Record<string, unknown>);
    const ids = parsed.map((record) => String(record.id)).sort();
    if (canonicalize(ids) !== canonicalize([...descriptor.ids].sort())) throw new Error(`${store} IDs do not match`);
    data[store] = parsed;
  }
  const integrity = auditWorkspaceData({
    companies: data.companies!,
    people: data.people!,
    routes: data.routes!,
    activities: data.activities!,
    owners: data.owners!,
    settings: data.settings!,
    workspaceId: manifest.workspaceId,
  });
  if (!integrity.ok) throw new Error(`Export integrity failed with ${integrity.issues.length} relationship issue(s)`);
  return { manifest, integrity };
}
