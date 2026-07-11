import { randomUUID } from 'node:crypto';
import {
  activitySchema,
  defaultOwnerProfiles,
  ownerIdForLegacyName,
  routeSchema,
  workspaceSettingsSchema,
} from '@northwind/domain';
import type { CrmRepository } from '../repositories/repository.js';

export async function migrateOwnerProfiles(repository: CrmRepository, workspaceId = 'default') {
  const [routes, owners, settings] = await Promise.all([
    repository.list('routes', workspaceId),
    repository.list('owners', workspaceId),
    repository.list('settings', workspaceId),
  ]);
  if (owners.length || settings.length) {
    if (!owners.length || !settings.length)
      throw new Error('Owner migration is incomplete; owners and settings must exist together');
    const ownerIds = new Set(owners.map((owner) => owner.id));
    const missing = routes.filter((route) => !ownerIds.has(route.ownerId));
    if (missing.length) throw new Error(`${missing.length} routes reference missing owners`);
    return { changed: false, ownerCount: owners.length, routeCount: routes.length };
  }

  const now = new Date().toISOString();
  const seededOwners = defaultOwnerProfiles(now, workspaceId);
  const migratedRoutes = routes.map((route) => {
    const ownerId = ownerIdForLegacyName(route.owner);
    if (!ownerId) throw new Error(`Route ${route.id} has an unmapped owner: ${route.owner}`);
    const owner = seededOwners.find((candidate) => candidate.id === ownerId)!;
    return routeSchema.parse({
      ...route,
      ownerId,
      owner: owner.displayName,
      updatedAt: now,
      version: route.version + 1,
    });
  });
  const workspaceSettings = workspaceSettingsSchema.parse({
    id: 'settings',
    timezone: 'Europe/London',
    updatedAt: now,
    workspaceId,
  });
  const activity = activitySchema.parse({
    id: `activity-owner-migration-${randomUUID()}`,
    actor: 'system-owner-migration',
    type: 'owner_migration',
    summary: `Configured owner profiles for ${migratedRoutes.length} routes`,
    timestamp: now,
    workspaceId,
  });
  await repository.upsertTransaction({
    owners: seededOwners,
    settings: [workspaceSettings],
    routes: migratedRoutes,
    activities: [activity],
  });
  return { changed: true, ownerCount: seededOwners.length, routeCount: migratedRoutes.length };
}
