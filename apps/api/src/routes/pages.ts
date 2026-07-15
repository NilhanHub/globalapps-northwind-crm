import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { normalizeIdentity, OWNER_IDS } from '@northwind/domain';
import type { RequestContext } from '@northwind/domain';
import type { CrmRepository } from '../repositories/repository.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const encodeCursor = (anchor: [unknown, string], fingerprint: string) =>
  Buffer.from(JSON.stringify({ anchor, fingerprint }), 'utf8').toString('base64url');
const decodeCursor = (value: string | undefined, fingerprint: string): [unknown, string] | undefined => {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      anchor?: unknown;
      fingerprint?: string;
    };
    if (decoded.fingerprint !== fingerprint || !Array.isArray(decoded.anchor) || decoded.anchor.length !== 2)
      throw new Error('mismatch');
    return [decoded.anchor[0], String(decoded.anchor[1])];
  } catch {
    throw Object.assign(new Error('Cursor is invalid or does not match this query'), {
      statusCode: 400,
      code: 'INVALID_CURSOR',
    });
  }
};

export function registerPageRoutes(app: FastifyInstance, repository: CrmRepository) {
  const routePageResponse = async (
    request: { requestContext?: RequestContext; query: unknown },
    query: Record<string, string | undefined>,
    limit: number,
  ) => {
    const view = String(query.view ?? 'all');
    if (!['all', 'unassigned', 'overdue', 'unscheduled', 'imported'].includes(view))
      throw Object.assign(new Error('Route view is invalid'), { statusCode: 400, code: 'VALIDATION_ERROR' });
    const search = normalizeIdentity(String(query.q ?? '')).slice(0, 80);
    const fingerprint = sha256(
      JSON.stringify({
        store: 'routes',
        limit,
        orderBy: 'updatedAt',
        direction: 'desc',
        ownerId: query.ownerId ?? '',
        view,
        search,
        includeArchived: query.includeArchived,
      }),
    );
    const startAfter = decodeCursor(query.cursor, fingerprint);
    const context = request.requestContext!;
    const [routes, people] = await Promise.all([
      repository.list('routes', context.workspaceId),
      search ? repository.list('people', context.workspaceId) : Promise.resolve([]),
    ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const filtered = routes
      .filter((route) => query.includeArchived === 'true' || !route.archivedAt)
      .filter((route) => !query.ownerId || route.ownerId === query.ownerId)
      .filter((route) => {
        if (view === 'unassigned') return route.ownerId === OWNER_IDS.unassigned;
        if (view === 'overdue') return route.outcome === 'pending' && Boolean(route.dueDate) && route.dueDate < today;
        if (view === 'unscheduled') return route.outcome === 'pending' && (!route.dueDate || !route.nextAction);
        if (view === 'imported') return Boolean(route.sourceIdentityKey);
        return true;
      })
      .filter((route) => {
        if (!search) return true;
        return normalizeIdentity(
          [
            route.companyName,
            peopleById.get(route.targetPersonId)?.name,
            peopleById.get(route.mutualPersonId)?.name,
          ].join(' '),
        ).includes(search);
      })
      .sort((left, right) => {
        const updated = String(right.updatedAt ?? right.createdAt).localeCompare(
          String(left.updatedAt ?? left.createdAt),
        );
        return updated || right.id.localeCompare(left.id);
      });
    let start = 0;
    if (startAfter) {
      const index = filtered.findIndex(
        (route) => String(route.updatedAt ?? route.createdAt) === String(startAfter[0]) && route.id === startAfter[1],
      );
      if (index < 0)
        throw Object.assign(new Error('Cursor is invalid or no longer available'), {
          statusCode: 400,
          code: 'INVALID_CURSOR',
        });
      start = index + 1;
    }
    const items = filtered.slice(start, start + limit);
    const hasMore = start + items.length < filtered.length;
    const last = items.at(-1);
    return {
      items,
      hasMore,
      nextCursor:
        hasMore && last ? encodeCursor([String(last.updatedAt ?? last.createdAt), last.id], fingerprint) : null,
    };
  };

  const pageResponse = async (
    store: 'companies' | 'people' | 'routes' | 'activities',
    request: { requestContext?: RequestContext; query: unknown },
    orderBy: string,
    direction: 'asc' | 'desc',
  ) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    if (store === 'routes' && (String(query.q ?? '').trim() || !['', 'all'].includes(String(query.view ?? ''))))
      return routePageResponse(request, query, limit);
    const equals = Object.fromEntries(
      Object.entries(query)
        .filter(([key, value]) => ['stage', 'ownerId', 'outcome', 'companyId', 'type'].includes(key) && value)
        .map(([key, value]) => [key, value]),
    );
    const prefix = String(query.q ?? '').trim()
      ? { field: orderBy, value: normalizeIdentity(String(query.q)) }
      : undefined;
    const fingerprint = sha256(
      JSON.stringify({ store, limit, orderBy, direction, equals, prefix, includeArchived: query.includeArchived }),
    );
    const startAfter = decodeCursor(query.cursor, fingerprint);
    const page = await repository.page(store, request.requestContext!.workspaceId, {
      limit,
      orderBy,
      direction,
      equals,
      ...(startAfter ? { startAfter } : {}),
      ...(prefix ? { prefix } : {}),
    });
    const visible =
      query.includeArchived === 'true'
        ? page.items
        : page.items.filter((record) => !('archivedAt' in record) || !record.archivedAt);
    return {
      items: visible,
      hasMore: page.hasMore,
      nextCursor: page.nextAnchor ? encodeCursor(page.nextAnchor, fingerprint) : null,
    };
  };

  app.get('/api/companies/page', (request) => pageResponse('companies', request, 'normalizedName', 'asc'));
  app.get('/api/people/page', (request) => pageResponse('people', request, 'normalizedName', 'asc'));
  app.get('/api/routes/page', (request) => pageResponse('routes', request, 'updatedAt', 'desc'));
  app.get('/api/activities/page', (request) => pageResponse('activities', request, 'timestamp', 'desc'));

  app.get('/api/routes/metrics', async (request) => {
    const routes = await repository.list('routes', request.requestContext!.workspaceId);
    const active = routes.filter((route) => !route.archivedAt && route.outcome === 'pending');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return {
      active: active.length,
      overdue: active.filter((route) => route.dueDate && route.dueDate < today).length,
      dueToday: active.filter((route) => route.dueDate === today).length,
      unassigned: active.filter((route) => route.ownerId === OWNER_IDS.unassigned).length,
      awaitingReply: active.filter((route) => ['Intro requested', 'Target contacted'].includes(route.stage)).length,
    };
  });

  app.get('/api/search', async (request) => {
    const query = normalizeIdentity(String((request.query as { q?: string }).q ?? '')).slice(0, 80);
    if (query.length < 2) return { items: [] };
    const context = request.requestContext!;
    const [companies, people] = await Promise.all([
      repository.page('companies', context.workspaceId, {
        limit: 10,
        orderBy: 'normalizedName',
        direction: 'asc',
        prefix: { field: 'normalizedName', value: query },
      }),
      repository.page('people', context.workspaceId, {
        limit: 10,
        orderBy: 'normalizedName',
        direction: 'asc',
        prefix: { field: 'normalizedName', value: query },
      }),
    ]);
    return {
      items: [
        ...companies.items
          .filter((item) => !item.archivedAt)
          .map((item) => ({ kind: 'company', id: item.id, label: item.name, href: `/companies/${item.id}` })),
        ...people.items
          .filter((item) => !item.archivedAt)
          .map((item) => ({ kind: 'person', id: item.id, label: item.name, href: '/people' })),
      ].slice(0, 10),
    };
  });
}
