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
  const pageResponse = async (
    store: 'companies' | 'people' | 'routes' | 'activities',
    request: { requestContext?: RequestContext; query: unknown },
    orderBy: string,
    direction: 'asc' | 'desc',
  ) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
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
