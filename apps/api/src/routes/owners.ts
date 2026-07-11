import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  activitySchema,
  createRouteActivity,
  defaultOwnerProfiles,
  DomainValidationError,
  normalizeIdentity,
  ownerProfileSchema,
  OWNER_IDS,
  workspaceSettingsSchema,
} from '@northwind/domain';
import type { CrmRepository } from '../repositories/repository.js';
import { RecordNotFoundError, VersionConflictError } from '../repositories/repository.js';

export function registerOwnerRoutes(app: FastifyInstance, repository: CrmRepository) {
  const ensureStoredOwners = async (workspaceId: string) => {
    const stored = await repository.list('owners', workspaceId);
    if (stored.length) return stored;
    const now = new Date().toISOString();
    const owners = defaultOwnerProfiles(now, workspaceId);
    const settings = await repository.list('settings', workspaceId);
    const activity = activitySchema.parse({
      id: `activity-${randomUUID()}`,
      actor: 'system-owner-migration',
      type: 'owner_migration',
      summary: 'Configured the default workspace owner profiles',
      timestamp: now,
      workspaceId,
    });
    try {
      await repository.upsertTransaction({
        owners,
        ...(settings.length
          ? {}
          : {
              settings: [
                workspaceSettingsSchema.parse({
                  id: 'settings',
                  timezone: 'Europe/London',
                  updatedAt: now,
                  workspaceId,
                }),
              ],
            }),
        activities: [activity],
      });
    } catch (error) {
      if (!(error instanceof VersionConflictError)) throw error;
      const concurrentOwners = await repository.list('owners', workspaceId);
      if (!concurrentOwners.length) throw error;
      return concurrentOwners;
    }
    return owners;
  };

  app.get('/api/owners', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    const owners = await repository.list('owners', workspaceId);
    const records = owners.length ? owners : defaultOwnerProfiles(new Date().toISOString(), workspaceId);
    return records.sort(
      (left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName),
    );
  });

  app.post('/api/owners', async (request, reply) => {
    const context = request.requestContext!;
    const owners = await ensureStoredOwners(context.workspaceId);
    const body = request.body as Record<string, unknown>;
    const displayName = String(body.displayName ?? '').trim();
    if (!displayName) throw new DomainValidationError('Owner name is required', 'displayName');
    const normalizedName = normalizeIdentity(displayName);
    if (owners.some((owner) => owner.normalizedName === normalizedName))
      throw Object.assign(new Error('An owner with this name already exists'), {
        statusCode: 409,
        code: 'DUPLICATE_OWNER',
      });
    const now = new Date().toISOString();
    const owner = ownerProfileSchema.parse({
      id: `owner-${randomUUID()}`,
      displayName,
      normalizedName,
      active: true,
      system: false,
      sortOrder: owners.length,
      createdAt: now,
      updatedAt: now,
      workspaceId: context.workspaceId,
    });
    const activity = activitySchema.parse({
      id: `activity-${randomUUID()}`,
      actor: context.actor,
      type: 'owner_created',
      summary: `Owner profile created: ${displayName}`,
      timestamp: now,
      workspaceId: context.workspaceId,
    });
    await repository.upsertTransaction({ owners: [owner], activities: [activity] });
    return reply.status(201).send(owner);
  });

  app.patch('/api/owners/:id', async (request) => {
    const context = request.requestContext!;
    const expectedVersion = Number(request.headers['if-match']);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw Object.assign(new Error('If-Match must contain the current record version'), {
        statusCode: 428,
        code: 'VERSION_REQUIRED',
      });
    const id = (request.params as { id: string }).id;
    const [owners, routes] = await Promise.all([
      ensureStoredOwners(context.workspaceId),
      repository.list('routes', context.workspaceId),
    ]);
    const current = owners.find((owner) => owner.id === id);
    if (!current) throw new RecordNotFoundError(id);
    if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
    const body = request.body as Record<string, unknown>;
    const displayName = body.displayName === undefined ? current.displayName : String(body.displayName).trim();
    if (!displayName) throw new DomainValidationError('Owner name is required', 'displayName');
    if (id === OWNER_IDS.unassigned && displayName !== current.displayName)
      throw Object.assign(new Error('Unassigned is a protected owner profile'), {
        statusCode: 409,
        code: 'PROTECTED_OWNER',
      });
    if (owners.some((owner) => owner.id !== id && owner.normalizedName === normalizeIdentity(displayName)))
      throw Object.assign(new Error('An owner with this name already exists'), {
        statusCode: 409,
        code: 'DUPLICATE_OWNER',
      });
    const now = new Date().toISOString();
    const requestedOrder = Number(body.sortOrder);
    const orderedOwners = [...owners].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.displayName.localeCompare(right.displayName),
    );
    if (Number.isInteger(requestedOrder)) {
      const from = orderedOwners.findIndex((owner) => owner.id === id);
      const [moved] = orderedOwners.splice(from, 1);
      orderedOwners.splice(Math.max(0, Math.min(orderedOwners.length, requestedOrder)), 0, moved!);
    }
    const ownerUpdates = orderedOwners.flatMap((owner, index) => {
      const nextDisplayName = owner.id === id ? displayName : owner.displayName;
      const nextOrder = Number.isInteger(requestedOrder) ? index : owner.sortOrder;
      if (owner.id !== id && nextOrder === owner.sortOrder) return [];
      return [
        ownerProfileSchema.parse({
          ...owner,
          displayName: nextDisplayName,
          normalizedName: normalizeIdentity(nextDisplayName),
          sortOrder: nextOrder,
          updatedAt: now,
          version: owner.version + 1,
        }),
      ];
    });
    const updated = ownerUpdates.find((owner) => owner.id === id)!;
    const changedRoutes =
      displayName === current.displayName
        ? []
        : routes
            .filter((route) => route.ownerId === id && !route.archivedAt && route.outcome === 'pending')
            .map((route) => ({ ...route, owner: displayName, updatedAt: now, version: route.version + 1 }));
    const activity = activitySchema.parse({
      id: `activity-${randomUUID()}`,
      actor: context.actor,
      type: 'owner_edited',
      summary:
        current.displayName === displayName
          ? `Owner profiles reordered: ${displayName}`
          : `Owner profile updated: ${current.displayName} → ${displayName}`,
      timestamp: now,
      workspaceId: context.workspaceId,
    });
    await repository.upsertTransaction({ owners: ownerUpdates, routes: changedRoutes, activities: [activity] });
    return updated;
  });

  app.post('/api/owners/:id/deactivate', async (request) => {
    const context = request.requestContext!;
    const id = (request.params as { id: string }).id;
    if (id === OWNER_IDS.unassigned)
      throw Object.assign(new Error('Unassigned is a protected owner profile'), {
        statusCode: 409,
        code: 'PROTECTED_OWNER',
      });
    const [owners, routes] = await Promise.all([
      ensureStoredOwners(context.workspaceId),
      repository.list('routes', context.workspaceId),
    ]);
    const current = owners.find((owner) => owner.id === id);
    if (!current) throw new RecordNotFoundError(id);
    if (!current.active)
      throw Object.assign(new Error('Owner profile is already inactive'), {
        statusCode: 409,
        code: 'OWNER_INACTIVE',
      });
    const body = request.body as { replacementOwnerId?: string; version?: number };
    if (current.version !== Number(body.version)) throw new VersionConflictError(current.version);
    const activeRoutes = routes.filter(
      (route) => route.ownerId === id && !route.archivedAt && route.outcome === 'pending',
    );
    const replacement = owners.find((owner) => owner.id === body.replacementOwnerId && owner.active);
    if (activeRoutes.length && !replacement)
      throw Object.assign(new Error('A valid replacement owner is required for active routes'), {
        statusCode: 409,
        code: 'OWNER_HAS_ROUTES',
      });
    const now = new Date().toISOString();
    const deactivated = ownerProfileSchema.parse({
      ...current,
      active: false,
      updatedAt: now,
      version: current.version + 1,
    });
    const changedRoutes = replacement
      ? activeRoutes.map((route) => ({
          ...route,
          ownerId: replacement.id,
          owner: replacement.displayName,
          updatedAt: now,
          version: route.version + 1,
        }))
      : [];
    const activities = changedRoutes.map((route) =>
      createRouteActivity({
        id: `activity-${randomUUID()}`,
        route,
        actor: context.actor,
        type: 'reassign',
        summary: `Route reassigned from ${current.displayName} to ${replacement!.displayName}`,
        now,
        previousState: { ownerId: current.id, owner: current.displayName },
        resultingState: { ownerId: replacement!.id, owner: replacement!.displayName },
      }),
    );
    activities.push(
      activitySchema.parse({
        id: `activity-${randomUUID()}`,
        actor: context.actor,
        type: 'owner_deactivated',
        summary: `Owner profile deactivated: ${current.displayName}`,
        timestamp: now,
        workspaceId: context.workspaceId,
      }),
    );
    await repository.upsertTransaction({ owners: [deactivated], routes: changedRoutes, activities });
    return { owner: deactivated, reassignedRouteCount: changedRoutes.length };
  });
}
