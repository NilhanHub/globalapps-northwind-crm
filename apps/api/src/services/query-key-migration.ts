import { randomUUID } from 'node:crypto';
import { activitySchema, companySchema, normalizeIdentity, normalizeLinkedIn, personSchema } from '@northwind/domain';
import type { CrmRepository, StoreChanges } from '../repositories/repository.js';

export async function migrateQueryKeys(repository: CrmRepository, workspaceId = 'default') {
  const [companies, people] = await Promise.all([
    repository.list('companies', workspaceId),
    repository.list('people', workspaceId),
  ]);
  const now = new Date().toISOString();
  const companyUpdates = companies.flatMap((company) => {
    const normalizedName = normalizeIdentity(company.name);
    if (company.normalizedName === normalizedName) return [];
    return [companySchema.parse({ ...company, normalizedName, updatedAt: now, version: company.version + 1 })];
  });
  const peopleUpdates = people.flatMap((person) => {
    const normalizedName = normalizeIdentity(person.name);
    const normalizedLinkedInKey = normalizeLinkedIn(person.linkedinUrl);
    if (
      person.normalizedName === normalizedName &&
      String(person.normalizedLinkedInKey ?? '') === normalizedLinkedInKey
    )
      return [];
    const withKeys: Record<string, unknown> = { ...person, normalizedName };
    if (normalizedLinkedInKey) withKeys.normalizedLinkedInKey = normalizedLinkedInKey;
    else delete withKeys.normalizedLinkedInKey;
    return [
      personSchema.parse({
        ...withKeys,
        updatedAt: now,
        version: person.version + 1,
      }),
    ];
  });
  const changes = [
    ...companyUpdates.map((record) => ({ store: 'companies' as const, record })),
    ...peopleUpdates.map((record) => ({ store: 'people' as const, record })),
  ];
  for (let offset = 0; offset < changes.length; offset += 400) {
    const transaction: StoreChanges = {};
    for (const change of changes.slice(offset, offset + 400)) {
      const records = (transaction[change.store] ?? []) as Array<Record<string, unknown>>;
      records.push(change.record);
      transaction[change.store] = records as never;
    }
    await repository.upsertTransaction(transaction);
  }
  if (changes.length) {
    const activity = activitySchema.parse({
      id: `activity-query-key-migration-${randomUUID()}`,
      actor: 'system-query-key-migration',
      type: 'query_key_migration',
      summary: `Updated normalized query keys for ${changes.length} records`,
      timestamp: now,
      workspaceId,
    });
    await repository.upsertTransaction({ activities: [activity] });
  }
  return {
    changed: changes.length > 0,
    companiesUpdated: companyUpdates.length,
    peopleUpdated: peopleUpdates.length,
  };
}
