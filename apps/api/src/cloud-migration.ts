import { createHash } from 'node:crypto';
import type { CrmRepository, StoreName } from './repositories/repository.js';

const stores: StoreName[] = ['companies', 'people', 'routes', 'activities'];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function recordHash(records: Array<Record<string, unknown>>) {
  const normalized = [...records].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return createHash('sha256').update(canonical(normalized)).digest('hex');
}

export async function migrateRepositoryData(
  source: CrmRepository,
  destination: CrmRepository,
  options: { workspaceId: string; dryRun: boolean },
) {
  const report: {
    dryRun: boolean;
    workspaceId: string;
    stores: Record<
      StoreName,
      {
        sourceCount: number;
        destinationCount: number;
        createCount: number;
        unchangedCount: number;
        sourceHash: string;
      }
    >;
  } = { dryRun: options.dryRun, workspaceId: options.workspaceId, stores: {} as never };

  for (const store of stores) {
    const sourceRecords = (await source.list(store, options.workspaceId)) as Array<Record<string, unknown>>;
    const destinationRecords = (await destination.list(store, options.workspaceId)) as Array<Record<string, unknown>>;
    const destinationById = new Map(destinationRecords.map((record) => [String(record.id), record]));
    const create: Array<Record<string, unknown>> = [];
    let unchangedCount = 0;
    for (const record of sourceRecords) {
      const existing = destinationById.get(String(record.id));
      if (!existing) {
        create.push(record);
        continue;
      }
      if (canonical(existing) !== canonical(record))
        throw new Error(
          `${store}/${String(record.id)} differs from the source; migration stopped without replacing it`,
        );
      unchangedCount += 1;
    }
    report.stores[store] = {
      sourceCount: sourceRecords.length,
      destinationCount: destinationRecords.length,
      createCount: create.length,
      unchangedCount,
      sourceHash: recordHash(sourceRecords),
    };
    if (!options.dryRun) {
      for (const record of create) await destination.create(store, record, options.workspaceId);
      const verified = (await destination.list(store, options.workspaceId)) as Array<Record<string, unknown>>;
      const verifiedById = new Map(verified.map((record) => [String(record.id), record]));
      for (const record of sourceRecords) {
        if (canonical(verifiedById.get(String(record.id))) !== canonical(record))
          throw new Error(`${store}/${String(record.id)} failed post-migration verification`);
      }
    }
  }
  return report;
}
