import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import {
  activitySchema,
  createRouteActivity,
  DomainValidationError,
  DuplicateActiveRouteError,
  prepareCompany,
  preparePerson,
  prepareRoute,
  routeSchema,
} from '@northwind/domain';
import type { RequestContext } from '@northwind/domain';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AuthService } from './auth/auth-service.js';
import type { JsonRepository } from './repositories/json-repository.js';
import { RecordNotFoundError, VersionConflictError } from './repositories/json-repository.js';
import { ZodError } from 'zod';

const SESSION_COOKIE = 'northwind_session';
const CSRF_COOKIE = 'northwind_csrf';
const publicPaths = new Set(['/api/health', '/api/auth/login']);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const safeHashEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

type AppOptions = {
  repository: JsonRepository;
  authService: AuthService;
  secureCookies: boolean;
  agentTokenHash?: string;
  publicDir?: string;
  allowedOrigins?: string[];
  logRequests?: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    requestContext?: RequestContext & { csrfHash?: string; sessionTokenHash?: string; expiresAt?: string };
  }
}

export async function createApp(options: AppOptions) {
  const app = Fastify({ logger: false, bodyLimit: 100 * 1024, trustProxy: true, requestIdHeader: 'x-request-id' });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  if (options.logRequests)
    app.addHook('onResponse', async (request, reply) => {
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          level: 'info',
          msg: 'http_request',
          requestId: request.id,
          method: request.method,
          path: request.url.split('?')[0],
          statusCode: reply.statusCode,
        }),
      );
    });
  if (options.publicDir) {
    await app.register(staticPlugin, {
      root: options.publicDir,
      wildcard: false,
      index: false,
      cacheControl: true,
      maxAge: '1y',
      immutable: true,
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/'))
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'API route not found.', requestId: request.id } });
      reply.header('Cache-Control', 'no-store');
      return reply
        .type('text/html; charset=utf-8')
        .send(readFileSync(resolve(options.publicDir!, 'index.html'), 'utf8'));
    });
  }

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error('Unknown error');
    if (err instanceof ZodError) {
      return void reply
        .status(400)
        .send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Check the highlighted fields and try again.',
            fieldErrors: err.flatten().fieldErrors,
            requestId: request.id,
          },
        });
    }
    if (err instanceof DomainValidationError)
      return void reply
        .status(400)
        .send({
          error: {
            code: err.code,
            message: err.message,
            ...(err.field ? { fieldErrors: { [err.field]: [err.message] } } : {}),
            requestId: request.id,
          },
        });
    if (err instanceof DuplicateActiveRouteError)
      return void reply.status(409).send({ error: { code: err.code, message: err.message, requestId: request.id } });
    const statusCode = 'statusCode' in err ? Number(err.statusCode) : 0;
    const status =
      err instanceof VersionConflictError ? 409 : err instanceof RecordNotFoundError ? 404 : statusCode || 500;
    const code =
      'code' in err && typeof err.code === 'string' ? err.code : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
    const message = status === 500 ? 'The request could not be completed.' : err.message;
    void reply.status(status).send({ error: { code, message, requestId: request.id } });
  });

  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    const origin = request.headers.origin;
    if (origin) {
      const sameOrigin = origin === `${request.protocol}://${request.headers.host}`;
      if (!sameOrigin && !options.allowedOrigins?.includes(origin))
        return reply
          .status(403)
          .send({ error: { code: 'ORIGIN_FORBIDDEN', message: 'This origin is not allowed.', requestId: request.id } });
      reply.header('Vary', 'Origin');
      if (!sameOrigin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
    }
    if (!path.startsWith('/api/') || publicPaths.has(path)) return;
    const authorization = request.headers.authorization ?? '';
    if (
      authorization.startsWith('Bearer ') &&
      options.agentTokenHash &&
      safeHashEqual(sha256(authorization.slice(7)), options.agentTokenHash)
    ) {
      const requestedName =
        String(request.headers['x-agent-name'] ?? 'Desktop agent')
          .replace(/[^a-zA-Z0-9 ._-]/g, '')
          .slice(0, 60) || 'Desktop agent';
      request.requestContext = {
        actor: `agent:${requestedName}`,
        authType: 'agent',
        workspaceId: 'default',
        requestId: request.id,
      };
      return;
    }
    const token = request.cookies[SESSION_COOKIE];
    const context = token ? await options.authService.authenticateSession(token) : null;
    if (!context && path === '/api/auth/session') return;
    if (!context)
      return reply
        .status(401)
        .send({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.', requestId: request.id } });
    request.requestContext = { ...context, requestId: request.id };
  });

  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0]!;
    if (!path.startsWith('/api/') || publicPaths.has(path) || path.startsWith('/api/auth/')) return;
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || request.requestContext?.authType === 'agent') return;
    const context = request.requestContext;
    const csrf = request.headers['x-csrf-token'];
    if (
      !context ||
      typeof csrf !== 'string' ||
      !options.authService.validateCsrf(context as Parameters<AuthService['validateCsrf']>[0], csrf)
    ) {
      return reply.status(403).send({
        error: {
          code: 'CSRF_INVALID',
          message: 'Your session changed. Refresh and try again.',
          requestId: request.id,
        },
      });
    }
  });

  app.get('/api/health', async () => ({ status: 'ok', service: 'northwind-api', time: new Date().toISOString() }));

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { username?: string; password?: string };
    const session = await options.authService.login(String(body?.username ?? ''), String(body?.password ?? ''));
    if (!session)
      return reply.status(401).send({
        error: { code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.', requestId: request.id },
      });
    reply.setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: options.secureCookies,
      path: '/',
      maxAge: 12 * 60 * 60,
    });
    reply.setCookie(CSRF_COOKIE, session.csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      secure: options.secureCookies,
      path: '/',
      maxAge: 12 * 60 * 60,
    });
    return { authenticated: true, actor: session.actor, expiresAt: session.expiresAt, csrfToken: session.csrfToken };
  });

  app.get('/api/auth/session', async (request) => {
    const context = request.requestContext;
    if (!context) return { authenticated: false };
    const csrfToken = request.cookies[CSRF_COOKIE] ?? '';
    return {
      authenticated: true,
      actor: context.actor,
      expiresAt: context.expiresAt,
      csrfToken: options.authService.validateCsrf(context as Parameters<AuthService['validateCsrf']>[0], csrfToken)
        ? csrfToken
        : '',
    };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await options.authService.logout(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/bootstrap', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    const [companies, people, routes, activities] = await Promise.all([
      options.repository.list('companies', workspaceId),
      options.repository.list('people', workspaceId),
      options.repository.list('routes', workspaceId),
      options.repository.list('activities', workspaceId),
    ]);
    return { companies, people, routes, activities };
  });

  app.get('/api/companies', async (request) => {
    const records = await options.repository.list('companies', request.requestContext!.workspaceId);
    const includeArchived = (request.query as { includeArchived?: string }).includeArchived === 'true';
    return includeArchived ? records : records.filter((record) => !record.archivedAt);
  });

  app.post('/api/companies', async (request, reply) => {
    const context = request.requestContext!;
    const record = prepareCompany(request.body as Record<string, unknown>, {
      id: `company-${randomUUID()}`,
      now: new Date().toISOString(),
      actor: context.actor,
    });
    const created = await options.repository.create('companies', record, context.workspaceId);
    return reply.status(201).send(created);
  });

  app.patch('/api/companies/:id', async (request) => {
    const context = request.requestContext!;
    const expectedVersion = Number(request.headers['if-match']);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      const error = new Error('If-Match must contain the current record version') as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 428;
      error.code = 'VERSION_REQUIRED';
      throw error;
    }
    return options.repository.update(
      'companies',
      (request.params as { id: string }).id,
      request.body as Record<string, unknown>,
      expectedVersion,
      context.workspaceId,
    );
  });

  app.get('/api/people', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    const [records, routes, activities] = await Promise.all([
      options.repository.list('people', workspaceId),
      options.repository.list('routes', workspaceId),
      options.repository.list('activities', workspaceId),
    ]);
    const includeArchived = (request.query as { includeArchived?: string }).includeArchived === 'true';
    const visible = includeArchived ? records : records.filter((record) => !record.archivedAt);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return visible.map((person) => {
      const relationshipIds = new Set([
        ...person.mutualPersonIds,
        ...records
          .filter((candidate) => candidate.mutualPersonIds.includes(person.id))
          .map((candidate) => candidate.id),
      ]);
      const personRoutes = routes.filter((route) => [route.targetPersonId, route.mutualPersonId].includes(person.id));
      const routeIds = new Set(personRoutes.map((route) => route.id));
      const lastActivityAt =
        activities
          .filter((activity) => routeIds.has(activity.routeId))
          .map((activity) => activity.timestamp)
          .sort()
          .at(-1) ?? '';
      const possibleDuplicateIds = records
        .filter(
          (candidate) =>
            candidate.id !== person.id &&
            !candidate.archivedAt &&
            ((person.linkedinUrl && normalize(person.linkedinUrl) === normalize(candidate.linkedinUrl)) ||
              (normalize(person.name) === normalize(candidate.name) &&
                (!person.companyId || !candidate.companyId || person.companyId === candidate.companyId))),
        )
        .map((candidate) => candidate.id);
      return {
        ...person,
        relationshipCount: relationshipIds.size,
        activeRouteCount: personRoutes.filter(
          (route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage),
        ).length,
        lastActivityAt,
        possibleDuplicateIds,
      };
    });
  });

  app.post('/api/people', async (request, reply) => {
    const context = request.requestContext!;
    const [companies, people] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('people', context.workspaceId),
    ]);
    const record = preparePerson(request.body as Record<string, unknown>, {
      id: `person-${randomUUID()}`,
      now: new Date().toISOString(),
      companies,
      people,
    });
    return reply.status(201).send(await options.repository.create('people', record, context.workspaceId));
  });

  app.patch('/api/people/:id', async (request) => {
    const context = request.requestContext!;
    const expectedVersion = Number(request.headers['if-match']);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw Object.assign(new Error('If-Match must contain the current record version'), {
        statusCode: 428,
        code: 'VERSION_REQUIRED',
      });
    const body = request.body as Record<string, unknown>;
    const [companies, people] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('people', context.workspaceId),
    ]);
    const current = people.find((person) => person.id === (request.params as { id: string }).id);
    if (!current) throw new RecordNotFoundError((request.params as { id: string }).id);
    const companyId = String(body.companyId ?? current.companyId);
    if (companyId && !companies.some((company) => company.id === companyId && !company.archivedAt))
      throw Object.assign(new Error('companyId must reference an active company'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    const mutualPersonIds = Array.isArray(body.mutualPersonIds)
      ? [...new Set(body.mutualPersonIds.map(String))]
      : current.mutualPersonIds;
    if (
      mutualPersonIds.some(
        (id) =>
          !people.some((person) => person.id === id && !person.archivedAt && ['mutual', 'both'].includes(person.type)),
      )
    )
      throw Object.assign(new Error('mutualPersonIds must reference active mutual contacts'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    return options.repository.update(
      'people',
      current.id,
      {
        ...body,
        companyId,
        companyName: companies.find((company) => company.id === companyId)?.name ?? '',
        mutualPersonIds,
        updatedAt: new Date().toISOString(),
      },
      expectedVersion,
      context.workspaceId,
    );
  });

  app.get('/api/routes', async (request) => {
    const records = await options.repository.list('routes', request.requestContext!.workspaceId);
    const includeArchived = (request.query as { includeArchived?: string }).includeArchived === 'true';
    return includeArchived ? records : records.filter((record) => !record.archivedAt);
  });

  app.post('/api/routes', async (request, reply) => {
    const context = request.requestContext!;
    const [companies, people, routes] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('people', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
    ]);
    const record = prepareRoute(request.body as Record<string, unknown>, {
      id: `route-${randomUUID()}`,
      now: new Date().toISOString(),
      companies,
      people,
      routes,
    });
    return reply.status(201).send(await options.repository.create('routes', record, context.workspaceId));
  });

  app.patch('/api/routes/:id', async (request) => {
    const context = request.requestContext!;
    const expectedVersion = Number(request.headers['if-match']);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw Object.assign(new Error('If-Match must contain the current record version'), {
        statusCode: 428,
        code: 'VERSION_REQUIRED',
      });
    const body = request.body as Record<string, unknown>;
    if (['stage', 'outcome', 'companyId', 'targetPersonId', 'mutualPersonId'].some((key) => key in body))
      throw Object.assign(
        new Error('Stage, outcome and relationship references must be changed through audited route actions'),
        { statusCode: 400, code: 'AUDITED_ACTION_REQUIRED' },
      );
    const [routes, activities] = await Promise.all([
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const index = routes.findIndex((route) => route.id === (request.params as { id: string }).id);
    if (index < 0) throw new RecordNotFoundError((request.params as { id: string }).id);
    const current = routes[index]!;
    if (current.version !== expectedVersion) throw new VersionConflictError(current.version);
    const now = new Date().toISOString();
    const updated = routeSchema.parse({ ...current, ...body, updatedAt: now, version: current.version + 1 });
    routes[index] = updated;
    const activity = createRouteActivity({
      id: `activity-${randomUUID()}`,
      route: updated,
      actor: context.actor,
      type: 'edit',
      summary: 'Route details updated',
      now,
      previousState: { owner: current.owner, dueDate: current.dueDate, nextAction: current.nextAction },
      resultingState: { owner: updated.owner, dueDate: updated.dueDate, nextAction: updated.nextAction },
    });
    await options.repository.transaction({ routes, activities: [...activities, activity] });
    return { route: updated, activity };
  });

  app.get('/api/activities', async (request) =>
    options.repository.list('activities', request.requestContext!.workspaceId),
  );

  app.post('/api/activities', async (request, reply) => {
    const context = request.requestContext!;
    const body = request.body as Record<string, unknown>;
    const companyId = String(body.companyId ?? '').trim();
    const routeId = String(body.routeId ?? '').trim();
    const summary = String(body.summary ?? '').trim();
    const type = String(body.type ?? '').trim();
    const [companies, routes] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
    ]);
    if (!summary || !type)
      throw Object.assign(new Error('Activity type and summary are required'), { statusCode: 400, code: 'BAD_INPUT' });
    if (companyId && !companies.some((company) => company.id === companyId && !company.archivedAt))
      throw Object.assign(new Error('companyId must reference an active company'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    if (routeId && !routes.some((route) => route.id === routeId))
      throw Object.assign(new Error('routeId must reference an existing route'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    const activity = activitySchema.parse({
      id: `activity-${randomUUID()}`,
      companyId,
      routeId,
      actor: context.actor,
      type,
      summary,
      details: String(body.details ?? ''),
      reason: String(body.reason ?? ''),
      timestamp: new Date().toISOString(),
      workspaceId: context.workspaceId,
      version: 1,
    });
    return reply.status(201).send(await options.repository.create('activities', activity, context.workspaceId));
  });

  app.post('/api/routes/bulk/actions', async (request) => {
    const context = request.requestContext!;
    const body = request.body as { routeIds?: string[]; owner?: string; dueDate?: string; nextAction?: string };
    if (!Array.isArray(body.routeIds) || !body.routeIds.length)
      throw Object.assign(new Error('routeIds must contain at least one route'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    const [routes, activities] = await Promise.all([
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const ids = new Set(body.routeIds);
    if (routes.filter((route) => ids.has(route.id) && !route.archivedAt).length !== ids.size)
      throw new RecordNotFoundError('One or more selected routes');
    const now = new Date().toISOString();
    const changed = routes.map((route) =>
      ids.has(route.id)
        ? {
            ...route,
            ...(body.owner !== undefined ? { owner: body.owner } : {}),
            ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
            ...(body.nextAction !== undefined ? { nextAction: body.nextAction } : {}),
            updatedAt: now,
            version: route.version + 1,
          }
        : route,
    );
    const activityRecords = changed
      .filter((route) => ids.has(route.id))
      .map((route) =>
        createRouteActivity({
          id: `activity-${randomUUID()}`,
          route: route as never,
          actor: context.actor,
          type: 'edit',
          summary: 'Route assignment and schedule updated',
          now,
          resultingState: { owner: route.owner, dueDate: route.dueDate, nextAction: route.nextAction },
        }),
      );
    await options.repository.transaction({ routes: changed, activities: [...activities, ...activityRecords] });
    return { routes: changed.filter((route) => ids.has(route.id)), activities: activityRecords };
  });

  app.post('/api/routes/:id/actions', async (request) => {
    const context = request.requestContext!;
    const routeId = (request.params as { id: string }).id;
    const body = request.body as Record<string, unknown>;
    const [routes, activities] = await Promise.all([
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const index = routes.findIndex((route) => route.id === routeId && !route.archivedAt);
    if (index < 0) throw new RecordNotFoundError(routeId);
    const current = routes[index]!;
    const previousState = {
      owner: current.owner,
      stage: current.stage,
      confidence: current.confidence,
      nextAction: current.nextAction,
      dueDate: current.dueDate,
      outcome: current.outcome,
      notes: current.notes,
    };
    const action = String(body.action ?? '');
    const actionMap: Record<string, { stage?: string; outcome?: string; type: string; summary: string }> = {
      intro_requested: { stage: 'Intro requested', type: 'intro_requested', summary: 'Introduction requested' },
      intro_agreed: { stage: 'Intro agreed', type: 'intro_agreed', summary: 'Introduction agreed' },
      target_contacted: { stage: 'Target contacted', type: 'target_contacted', summary: 'Target contacted' },
      meeting_reply: { stage: 'Meeting / reply', type: 'meeting', summary: 'Meeting or reply recorded' },
      mark_won: { stage: 'Won', outcome: 'won', type: 'won', summary: 'Route marked won' },
      mark_dead: { stage: 'Dead / no route', outcome: 'dead', type: 'dead', summary: 'Route marked dead' },
      call_mutual: { type: 'call', summary: 'Logged a call to the mutual contact' },
      message_mutual: { type: 'email', summary: 'Logged a message to the mutual contact' },
      move_stage: {
        stage: String(body.stage ?? ''),
        type: 'edit',
        summary: `Route moved to ${String(body.stage ?? '')}`,
      },
    };
    const definition = actionMap[action];
    if (!definition) throw Object.assign(new Error('Unsupported route action'), { statusCode: 400, code: 'BAD_INPUT' });
    if (['mark_won', 'mark_dead'].includes(action) && !String(body.reason ?? '').trim())
      throw Object.assign(new Error('A reason is required'), { statusCode: 400, code: 'BAD_INPUT' });
    const now = new Date().toISOString();
    const updated = {
      ...current,
      ...(definition.stage ? { stage: definition.stage } : {}),
      ...(definition.outcome ? { outcome: definition.outcome } : {}),
      ...(body.nextAction !== undefined ? { nextAction: String(body.nextAction) } : {}),
      ...(body.followUpDate !== undefined ? { dueDate: String(body.followUpDate) } : {}),
      updatedAt: now,
      version: current.version + 1,
    };
    const resultingState = {
      owner: updated.owner,
      stage: updated.stage,
      confidence: updated.confidence,
      nextAction: updated.nextAction,
      dueDate: updated.dueDate,
      outcome: updated.outcome,
      notes: updated.notes,
    };
    const activity = createRouteActivity({
      id: `activity-${randomUUID()}`,
      route: updated as never,
      actor: context.actor,
      type: definition.type,
      summary: definition.summary,
      now,
      previousState,
      resultingState,
      details: String(body.details ?? ''),
      reason: String(body.reason ?? ''),
    });
    routes[index] = updated as never;
    await options.repository.transaction({ routes, activities: [...activities, activity] });
    return { route: updated, activity };
  });

  app.post('/api/routes/:id/actions/:activityId/undo', async (request) => {
    const context = request.requestContext!;
    const { id, activityId } = request.params as { id: string; activityId: string };
    const [routes, activities] = await Promise.all([
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const routeIndex = routes.findIndex((route) => route.id === id);
    if (routeIndex < 0) throw new RecordNotFoundError(id);
    const source = activities.find((activity) => activity.id === activityId && activity.routeId === id) as
      ((typeof activities)[number] & { previousState?: Record<string, unknown> }) | undefined;
    if (!source?.previousState || Date.now() - Date.parse(source.timestamp) > 30_000)
      throw Object.assign(new Error('Undo is no longer available for this action'), {
        statusCode: 409,
        code: 'UNDO_EXPIRED',
      });
    const latestMutation = activities.filter((activity) => activity.routeId === id && activity.type !== 'note').at(-1);
    if (latestMutation?.id !== source.id)
      throw Object.assign(new Error('Only the latest route mutation can be undone'), {
        statusCode: 409,
        code: 'UNDO_NOT_LATEST',
      });
    const current = routes[routeIndex]!;
    const now = new Date().toISOString();
    const restored = { ...current, ...source.previousState, updatedAt: now, version: current.version + 1 };
    const undoActivity = createRouteActivity({
      id: `activity-${randomUUID()}`,
      route: restored as never,
      actor: context.actor,
      type: 'undo',
      summary: `Undid: ${source.summary}`,
      now,
      previousState: { stage: current.stage, owner: current.owner },
      resultingState: source.previousState,
    });
    routes[routeIndex] = restored as never;
    await options.repository.transaction({
      routes,
      activities: [...activities, { ...undoActivity, undoOfActivityId: source.id }],
    });
    return { route: restored, activity: { ...undoActivity, undoOfActivityId: source.id } };
  });

  app.post('/api/routes/:id/:archiveAction', async (request) => {
    const context = request.requestContext!;
    const { id, archiveAction } = request.params as { id: string; archiveAction: string };
    if (!['archive', 'restore'].includes(archiveAction)) throw new RecordNotFoundError(id);
    const [routes, activities] = await Promise.all([
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const index = routes.findIndex((route) => route.id === id);
    if (index < 0) throw new RecordNotFoundError(id);
    const current = routes[index]!;
    const now = new Date().toISOString();
    if (archiveAction === 'archive' && !String((request.body as { reason?: string })?.reason ?? '').trim())
      throw Object.assign(new Error('Archive reason is required'), { statusCode: 400, code: 'BAD_INPUT' });
    const updated =
      archiveAction === 'archive'
        ? {
            ...current,
            archivedAt: now,
            archivedBy: context.actor,
            archiveReason: String((request.body as { reason?: string }).reason),
            archiveOperationId: `archive-${randomUUID()}`,
            version: current.version + 1,
          }
        : Object.fromEntries(
            Object.entries({ ...current, version: current.version + 1 }).filter(
              ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
            ),
          );
    routes[index] = updated as never;
    const activity = createRouteActivity({
      id: `activity-${randomUUID()}`,
      route: updated as never,
      actor: context.actor,
      type: archiveAction,
      summary: `Route ${archiveAction}d`,
      now,
      reason: archiveAction === 'archive' ? String((request.body as { reason?: string }).reason) : '',
    });
    await options.repository.transaction({ routes, activities: [...activities, activity] });
    return { route: updated, activity };
  });

  app.post('/api/people/:id/:archiveAction', async (request) => {
    const context = request.requestContext!;
    const { id, archiveAction } = request.params as { id: string; archiveAction: string };
    if (!['archive', 'restore'].includes(archiveAction)) throw new RecordNotFoundError(id);
    const [people, routes, activities] = await Promise.all([
      options.repository.list('people', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const index = people.findIndex((person) => person.id === id);
    if (index < 0) throw new RecordNotFoundError(id);
    const current = people[index]!;
    const now = new Date().toISOString();
    const reason = String((request.body as { reason?: string })?.reason ?? '').trim();
    if (archiveAction === 'archive' && !reason)
      throw Object.assign(new Error('Archive reason is required'), { statusCode: 400, code: 'BAD_INPUT' });
    const operationId = archiveAction === 'archive' ? `archive-${randomUUID()}` : current.archiveOperationId;
    people[index] = (
      archiveAction === 'archive'
        ? {
            ...current,
            archivedAt: now,
            archivedBy: context.actor,
            archiveReason: reason,
            archiveOperationId: operationId,
            version: current.version + 1,
          }
        : Object.fromEntries(
            Object.entries({ ...current, version: current.version + 1 }).filter(
              ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
            ),
          )
    ) as never;
    const affected: typeof routes = [];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex]!;
      if (![route.targetPersonId, route.mutualPersonId].includes(id)) continue;
      if (archiveAction === 'archive' && !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage)) {
        routes[routeIndex] = {
          ...route,
          archivedAt: now,
          archivedBy: context.actor,
          archiveReason: reason,
          archiveOperationId: operationId,
          version: route.version + 1,
        } as never;
        affected.push(routes[routeIndex]!);
      } else if (archiveAction === 'restore' && route.archiveOperationId === operationId) {
        routes[routeIndex] = Object.fromEntries(
          Object.entries({ ...route, version: route.version + 1 }).filter(
            ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
          ),
        ) as never;
        affected.push(routes[routeIndex]!);
      }
    }
    const audit = affected.map((route) =>
      createRouteActivity({
        id: `activity-${randomUUID()}`,
        route,
        actor: context.actor,
        type: archiveAction,
        summary: `Route ${archiveAction}d with person`,
        now,
        reason,
      }),
    );
    await options.repository.transaction({ people, routes, activities: [...activities, ...audit] });
    return { person: people[index], routes: affected, activities: audit };
  });

  app.post('/api/companies/:id/:archiveAction', async (request) => {
    const context = request.requestContext!;
    const { id, archiveAction } = request.params as { id: string; archiveAction: string };
    if (!['archive', 'restore'].includes(archiveAction)) throw new RecordNotFoundError(id);
    const [companies, people, routes, activities] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('people', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const index = companies.findIndex((company) => company.id === id);
    if (index < 0) throw new RecordNotFoundError(id);
    const current = companies[index]!;
    const now = new Date().toISOString();
    const reason = String((request.body as { reason?: string })?.reason ?? '').trim();
    if (archiveAction === 'archive' && !reason)
      throw Object.assign(new Error('Archive reason is required'), { statusCode: 400, code: 'BAD_INPUT' });
    const operationId = archiveAction === 'archive' ? `archive-${randomUUID()}` : current.archiveOperationId;
    companies[index] = (
      archiveAction === 'archive'
        ? {
            ...current,
            archivedAt: now,
            archivedBy: context.actor,
            archiveReason: reason,
            archiveOperationId: operationId,
            version: current.version + 1,
          }
        : Object.fromEntries(
            Object.entries({ ...current, version: current.version + 1 }).filter(
              ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
            ),
          )
    ) as never;
    for (let personIndex = 0; personIndex < people.length; personIndex++) {
      const person = people[personIndex]!;
      if (person.companyId !== id) continue;
      if (archiveAction === 'archive' && !person.archivedAt)
        people[personIndex] = {
          ...person,
          archivedAt: now,
          archivedBy: context.actor,
          archiveReason: reason,
          archiveOperationId: operationId,
          version: person.version + 1,
        } as never;
      if (archiveAction === 'restore' && person.archiveOperationId === operationId)
        people[personIndex] = Object.fromEntries(
          Object.entries({ ...person, version: person.version + 1 }).filter(
            ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
          ),
        ) as never;
    }
    const affected: typeof routes = [];
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex++) {
      const route = routes[routeIndex]!;
      if (route.companyId !== id) continue;
      if (archiveAction === 'archive' && !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage)) {
        routes[routeIndex] = {
          ...route,
          archivedAt: now,
          archivedBy: context.actor,
          archiveReason: reason,
          archiveOperationId: operationId,
          version: route.version + 1,
        } as never;
        affected.push(routes[routeIndex]!);
      }
      if (archiveAction === 'restore' && route.archiveOperationId === operationId) {
        routes[routeIndex] = Object.fromEntries(
          Object.entries({ ...route, version: route.version + 1 }).filter(
            ([key]) => !['archivedAt', 'archivedBy', 'archiveReason', 'archiveOperationId'].includes(key),
          ),
        ) as never;
        affected.push(routes[routeIndex]!);
      }
    }
    const audit = affected.map((route) =>
      createRouteActivity({
        id: `activity-${randomUUID()}`,
        route,
        actor: context.actor,
        type: archiveAction,
        summary: `Route ${archiveAction}d with company`,
        now,
        reason,
      }),
    );
    await options.repository.transaction({ companies, people, routes, activities: [...activities, ...audit] });
    return {
      company: companies[index],
      people: people.filter((person) => person.companyId === id),
      routes: affected,
      activities: audit,
    };
  });

  app.post('/api/people/merge', async (request) => {
    const context = request.requestContext!;
    const { survivorId, sourceId, reason } = request.body as {
      survivorId?: string;
      sourceId?: string;
      reason?: string;
    };
    if (!survivorId || !sourceId || survivorId === sourceId || !String(reason ?? '').trim())
      throw Object.assign(new Error('survivorId, sourceId and reason are required'), {
        statusCode: 400,
        code: 'BAD_INPUT',
      });
    const [people, routes, activities] = await Promise.all([
      options.repository.list('people', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    const survivorIndex = people.findIndex((person) => person.id === survivorId && !person.archivedAt);
    const sourceIndex = people.findIndex((person) => person.id === sourceId && !person.archivedAt);
    if (survivorIndex < 0 || sourceIndex < 0) throw new RecordNotFoundError('merge person');
    const survivor = people[survivorIndex]!;
    const source = people[sourceIndex]!;
    const now = new Date().toISOString();
    people[survivorIndex] = {
      ...survivor,
      title: survivor.title || source.title,
      companyId: survivor.companyId || source.companyId,
      companyName: survivor.companyName || source.companyName,
      location: survivor.location || source.location,
      linkedinUrl: survivor.linkedinUrl || source.linkedinUrl,
      notes: survivor.notes || source.notes,
      type: survivor.type === source.type ? survivor.type : 'both',
      mutualPersonIds: [...new Set([...survivor.mutualPersonIds, ...source.mutualPersonIds])].filter(
        (personId) => personId !== survivorId && personId !== sourceId,
      ),
      updatedAt: now,
      version: survivor.version + 1,
    } as never;
    people[sourceIndex] = {
      ...source,
      archivedAt: now,
      archivedBy: context.actor,
      archiveReason: String(reason),
      archiveOperationId: `merge-${randomUUID()}`,
      mergedIntoPersonId: survivorId,
      updatedAt: now,
      version: source.version + 1,
    } as never;
    for (let index = 0; index < people.length; index++)
      people[index] = {
        ...people[index]!,
        mutualPersonIds: people[index]!.mutualPersonIds.map((personId) =>
          personId === sourceId ? survivorId : personId,
        ).filter((value, itemIndex, all) => all.indexOf(value) === itemIndex),
      };
    const rewritten = routes.map((route) => ({
      ...route,
      targetPersonId: route.targetPersonId === sourceId ? survivorId : route.targetPersonId,
      mutualPersonId: route.mutualPersonId === sourceId ? survivorId : route.mutualPersonId,
    }));
    const activeKeys = new Set<string>();
    for (const route of rewritten.filter(
      (item) => !item.archivedAt && !['Won', 'Dead / no route'].includes(item.stage),
    )) {
      const key = `${route.companyId}:${route.targetPersonId}:${route.mutualPersonId}`;
      if (activeKeys.has(key))
        throw Object.assign(new Error('Merge would create duplicate active routes'), {
          statusCode: 409,
          code: 'DUPLICATE_ROUTE',
        });
      activeKeys.add(key);
    }
    const mergeActivity = {
      id: `activity-${randomUUID()}`,
      routeId: '',
      companyId: '',
      actor: context.actor,
      type: 'merge',
      summary: `Merged ${source.name} into ${survivor.name}`,
      details: '',
      reason: String(reason),
      timestamp: now,
      workspaceId: context.workspaceId,
      version: 1,
    };
    await options.repository.transaction({ people, routes: rewritten, activities: [...activities, mergeActivity] });
    return { survivor: people[survivorIndex], source: people[sourceIndex] };
  });

  app.delete('/api/:collection/:id', async (request) => {
    const context = request.requestContext!;
    if (context.authType !== 'session')
      throw Object.assign(new Error('Permanent deletion is restricted to the human interface'), {
        statusCode: 403,
        code: 'HUMAN_ONLY',
      });
    const { collection, id } = request.params as { collection: string; id: string };
    if (!['companies', 'people', 'routes'].includes(collection)) throw new RecordNotFoundError(id);
    const [companies, people, routes, activities] = await Promise.all([
      options.repository.list('companies', context.workspaceId),
      options.repository.list('people', context.workspaceId),
      options.repository.list('routes', context.workspaceId),
      options.repository.list('activities', context.workspaceId),
    ]);
    if (collection === 'companies') {
      const record = companies.find((company) => company.id === id);
      if (!record) throw new RecordNotFoundError(id);
      if (!record.archivedAt)
        throw Object.assign(new Error('Archive the company before permanent deletion'), {
          statusCode: 400,
          code: 'ARCHIVE_REQUIRED',
        });
      if (
        people.some((person) => person.companyId === id) ||
        routes.some((route) => route.companyId === id) ||
        activities.some((activity) => activity.companyId === id)
      )
        throw Object.assign(new Error('The company still has people, routes or activity history'), {
          statusCode: 409,
          code: 'DEPENDENCIES_EXIST',
        });
      await options.repository.transaction({ companies: companies.filter((company) => company.id !== id) });
    } else if (collection === 'people') {
      const record = people.find((person) => person.id === id);
      if (!record) throw new RecordNotFoundError(id);
      if (!record.archivedAt)
        throw Object.assign(new Error('Archive the person before permanent deletion'), {
          statusCode: 400,
          code: 'ARCHIVE_REQUIRED',
        });
      if (
        routes.some((route) => [route.targetPersonId, route.mutualPersonId].includes(id)) ||
        people.some((person) => person.mutualPersonIds.includes(id))
      )
        throw Object.assign(new Error('The person still has relationship or route dependencies'), {
          statusCode: 409,
          code: 'DEPENDENCIES_EXIST',
        });
      await options.repository.transaction({ people: people.filter((person) => person.id !== id) });
    } else {
      const record = routes.find((route) => route.id === id);
      if (!record) throw new RecordNotFoundError(id);
      if (!record.archivedAt)
        throw Object.assign(new Error('Archive the route before permanent deletion'), {
          statusCode: 400,
          code: 'ARCHIVE_REQUIRED',
        });
      if (activities.some((activity) => activity.routeId === id))
        throw Object.assign(new Error('The route still has activity history'), {
          statusCode: 409,
          code: 'DEPENDENCIES_EXIST',
        });
      await options.repository.transaction({ routes: routes.filter((route) => route.id !== id) });
    }
    return { ok: true };
  });

  return app;
}
