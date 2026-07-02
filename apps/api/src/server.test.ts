import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuthService, hashPassword } from './auth/auth-service.js';
import { createJsonRepository } from './repositories/json-repository.js';
import { createApp } from './server.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function fixture(options: { now?: () => Date; repositoryUnavailable?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'northwind-api-'));
  dirs.push(dir);
  for (const name of ['companies', 'people', 'routes', 'activities']) writeFileSync(join(dir, `${name}.json`), '[]\n');
  const sessions: Array<Record<string, unknown>> = [];
  const auth = createAuthService({
    username: 'northwind',
    passwordHash: await hashPassword('a-secure-password'),
    sessionRepository: {
      find: async (tokenHash) => sessions.find((session) => session.tokenHash === tokenHash),
      create: async (session) => {
        const index = sessions.findIndex((candidate) => candidate.tokenHash === session.tokenHash);
        if (index < 0) sessions.push(session);
        else sessions[index] = session;
      },
      touch: async (tokenHash, updates) => {
        const index = sessions.findIndex((candidate) => candidate.tokenHash === tokenHash);
        if (index < 0) return undefined;
        sessions[index] = { ...sessions[index], ...updates };
        return sessions[index];
      },
      delete: async (tokenHash) => {
        const index = sessions.findIndex((session) => session.tokenHash === tokenHash);
        if (index >= 0) sessions.splice(index, 1);
      },
    },
    ...(options.now ? { now: options.now } : {}),
  });
  const publicDir = join(dir, 'public');
  await import('node:fs').then(({ mkdirSync }) => mkdirSync(publicDir));
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>Northwind React</title>');
  const repository = createJsonRepository(dir);
  if (options.repositoryUnavailable)
    repository.healthCheck = async () => {
      throw Object.assign(new Error('Cloud unavailable'), { code: 'FIRESTORE_UNAVAILABLE', statusCode: 503 });
    };
  const app = await createApp({
    repository,
    authService: auth,
    secureCookies: false,
    agentTokenHash: createHash('sha256').update('agent-secret').digest('hex'),
    publicDir,
  });
  return { app };
}

describe('modular API server', () => {
  it('exposes a public health check and protects bootstrap', async () => {
    const { app } = await fixture();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' } })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json()).toEqual({ authenticated: false });
    expect((await app.inject({ method: 'GET', url: '/api/bootstrap' })).statusCode).toBe(401);
    await app.close();
  });

  it('reports repository failure instead of claiming a healthy service', async () => {
    const { app } = await fixture({ repositoryUnavailable: true });
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toMatchObject({ error: { code: 'FIRESTORE_UNAVAILABLE' } });
    await app.close();
  });

  it('creates a secure session and returns typed bootstrap data', async () => {
    const { app } = await fixture();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(String(login.headers['set-cookie'])).toContain('HttpOnly');
    expect(String(login.headers['set-cookie'])).toContain('SameSite=Strict');
    expect(String(login.headers['set-cookie'])).not.toMatch(/Max-Age|Expires=/i);
    const cookie = login.cookies[0]!;
    const session = login.json<{ csrfToken: string }>();
    const csrfCookie = login.cookies.find((item) => item.name === 'northwind_csrf')!;
    const restoredSession = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      cookies: { [cookie.name]: cookie.value, [csrfCookie.name]: csrfCookie.value },
    });
    expect(restoredSession.json()).toMatchObject({ authenticated: true, csrfToken: session.csrfToken });
    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/bootstrap',
      cookies: { [cookie.name]: cookie.value },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json()).toMatchObject({ companies: [], people: [], routes: [], activities: [] });
    expect(session.csrfToken).toBeTruthy();
    await app.close();
  });

  it('clears cookies and identifies a session that exceeded 16 hours of inactivity', async () => {
    let current = new Date('2026-07-02T10:00:00.000Z');
    const { app } = await fixture({ now: () => current });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    const sessionCookie = login.cookies.find((item) => item.name === 'northwind_session')!;
    current = new Date('2026-07-03T02:00:00.001Z');
    const expired = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      cookies: { [sessionCookie.name]: sessionCookie.value },
    });
    expect(expired.statusCode).toBe(200);
    expect(expired.json()).toEqual({ authenticated: false, reason: 'idle_timeout' });
    expect(String(expired.headers['set-cookie'])).toContain('northwind_session=;');
    await app.close();
  });

  it('requires csrf and optimistic versions for company mutations', async () => {
    const { app } = await fixture();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    const cookie = login.cookies[0]!;
    const { csrfToken } = login.json<{ csrfToken: string }>();
    const cookies = { [cookie.name]: cookie.value };
    expect(
      (await app.inject({ method: 'POST', url: '/api/companies', cookies, payload: { name: 'Acme' } })).statusCode,
    ).toBe(403);
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/companies',
      cookies,
      headers: { 'x-csrf-token': csrfToken },
      payload: { name: 'Acme' },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<{ id: string; version: number }>();
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/companies/${created.id}`,
      cookies,
      headers: { 'x-csrf-token': csrfToken, 'if-match': String(created.version) },
      payload: { status: 'Contacted' },
    });
    expect(changed.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/companies/${created.id}`,
          cookies,
          headers: { 'x-csrf-token': csrfToken, 'if-match': String(created.version) },
          payload: { status: 'Won' },
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });

  it('allows scoped desktop agents without browser csrf', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: { authorization: 'Bearer agent-secret', 'x-agent-name': 'Atlas' },
      payload: { name: 'Agent account' },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Agent account', createdBy: 'agent:Atlas' });
    await app.close();
  });

  it('serves the React shell for deep links without caching authenticated HTML', async () => {
    const { app } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/companies/example' });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Northwind React');
    expect(response.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('supports the complete target, mutual, route and auditable stage workflow', async () => {
    const { app } = await fixture();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    const sessionCookie = login.cookies.find((item) => item.name === 'northwind_session')!;
    const csrfCookie = login.cookies.find((item) => item.name === 'northwind_csrf')!;
    const { csrfToken } = login.json<{ csrfToken: string }>();
    const request = async (
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: Record<string, unknown>,
      headers: Record<string, string> = {},
    ) => {
      const common = {
        method,
        url,
        cookies: { [sessionCookie.name]: sessionCookie.value, [csrfCookie.name]: csrfCookie.value },
        headers: { 'x-csrf-token': csrfToken, ...headers },
      };
      return payload === undefined ? app.inject(common) : app.inject({ ...common, payload });
    };
    const company = (await request('POST', '/api/companies', { name: 'Acme' })).json<{ id: string }>();
    const mutual = (await request('POST', '/api/people', { name: 'Morgan Mutual', type: 'mutual' })).json<{
      id: string;
    }>();
    const targetResponse = await request('POST', '/api/people', {
      name: 'Taylor Target',
      type: 'target',
      companyId: company.id,
      mutualPersonIds: [mutual.id],
    });
    expect(targetResponse.statusCode).toBe(201);
    const target = targetResponse.json<{ id: string }>();
    const routeResponse = await request('POST', '/api/routes', {
      companyId: company.id,
      targetPersonId: target.id,
      mutualPersonId: mutual.id,
      owner: 'Jeremy',
    });
    expect(routeResponse.statusCode).toBe(201);
    const route = routeResponse.json<{ id: string }>();
    const enrichedPeople = (await request('GET', '/api/people')).json<
      Array<{ id: string; relationshipCount: number; activeRouteCount: number }>
    >();
    expect(enrichedPeople.find((person) => person.id === target.id)).toMatchObject({
      relationshipCount: 1,
      activeRouteCount: 1,
    });
    const moved = await request('POST', `/api/routes/${route.id}/actions`, {
      action: 'move_stage',
      stage: 'Intro requested',
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({
      route: { stage: 'Intro requested' },
      activity: { type: 'edit', actor: 'northwind' },
    });
    const activityId = moved.json<{ activity: { id: string } }>().activity.id;
    const undone = await request('POST', `/api/routes/${route.id}/actions/${activityId}/undo`, {});
    expect(undone.json()).toMatchObject({ route: { stage: 'Found route' }, activity: { type: 'undo' } });
    expect((await request('GET', '/api/activities')).json()).toHaveLength(2);
    expect((await request('POST', `/api/routes/${route.id}/archive`, { reason: 'Duplicate path' })).statusCode).toBe(
      200,
    );
    expect((await request('GET', '/api/routes')).json()).toHaveLength(0);
    expect((await request('POST', `/api/routes/${route.id}/restore`, {})).statusCode).toBe(200);
    expect((await request('GET', '/api/routes')).json()).toHaveLength(1);
    const bulk = await request('POST', '/api/routes/bulk/actions', {
      routeIds: [route.id],
      owner: 'Paul',
      dueDate: '2026-07-20',
      nextAction: 'Send context',
    });
    expect(bulk.json()).toMatchObject({
      routes: [{ owner: 'Paul', dueDate: '2026-07-20', nextAction: 'Send context' }],
    });
    expect(
      (await request('POST', `/api/people/${target.id}/archive`, { reason: 'Temporary removal' })).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/routes')).json()).toHaveLength(0);
    expect((await request('POST', `/api/people/${target.id}/restore`, {})).statusCode).toBe(200);
    expect((await request('GET', '/api/routes')).json()).toHaveLength(1);
    expect(
      (await request('POST', `/api/companies/${company.id}/archive`, { reason: 'Account paused' })).statusCode,
    ).toBe(200);
    expect((await request('GET', '/api/companies')).json()).toHaveLength(0);
    expect((await request('POST', `/api/companies/${company.id}/restore`, {})).statusCode).toBe(200);
    const source = (await request('POST', '/api/people', { name: 'Morgan Mutual Duplicate', type: 'mutual' })).json<{
      id: string;
    }>();
    const merged = await request('POST', '/api/people/merge', {
      survivorId: mutual.id,
      sourceId: source.id,
      reason: 'Same person',
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json()).toMatchObject({ source: { mergedIntoPersonId: mutual.id } });
    await app.close();
  });

  it('records standalone company activity with the authenticated actor', async () => {
    const { app } = await fixture();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    const sessionCookie = login.cookies.find((item) => item.name === 'northwind_session')!;
    const csrfCookie = login.cookies.find((item) => item.name === 'northwind_csrf')!;
    const { csrfToken } = login.json<{ csrfToken: string }>();
    const auth = {
      cookies: { [sessionCookie.name]: sessionCookie.value, [csrfCookie.name]: csrfCookie.value },
      headers: { 'x-csrf-token': csrfToken },
    };
    const company = (
      await app.inject({ method: 'POST', url: '/api/companies', ...auth, payload: { name: 'Acme' } })
    ).json<{ id: string }>();
    const recorded = await app.inject({
      method: 'POST',
      url: '/api/activities',
      ...auth,
      payload: {
        companyId: company.id,
        type: 'note',
        summary: 'Stakeholder map reviewed',
        details: 'Two new warm paths found',
        actor: 'spoofed',
      },
    });
    expect(recorded.statusCode).toBe(201);
    expect(recorded.json()).toMatchObject({
      companyId: company.id,
      actor: 'northwind',
      summary: 'Stakeholder map reviewed',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/activities',
          ...auth,
          payload: { companyId: 'missing', type: 'note', summary: 'Invalid' },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });

  it('validates relationship patches and refuses silent route stage changes', async () => {
    const { app } = await fixture();
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers: { authorization: 'Bearer agent-secret' },
      payload: { name: 'Bad enum', status: 'Maybe' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR', fieldErrors: { status: expect.any(Array) } },
    });
    const company = (
      await app.inject({
        method: 'POST',
        url: '/api/companies',
        headers: { authorization: 'Bearer agent-secret' },
        payload: { name: 'Acme' },
      })
    ).json<{ id: string }>();
    const mutual = (
      await app.inject({
        method: 'POST',
        url: '/api/people',
        headers: { authorization: 'Bearer agent-secret' },
        payload: { name: 'Morgan', type: 'mutual' },
      })
    ).json<{ id: string }>();
    const target = (
      await app.inject({
        method: 'POST',
        url: '/api/people',
        headers: { authorization: 'Bearer agent-secret' },
        payload: { name: 'Taylor', type: 'target', companyId: company.id, mutualPersonIds: [mutual.id] },
      })
    ).json<{ id: string; version: number }>();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/people/${target.id}`,
          headers: { authorization: 'Bearer agent-secret', 'if-match': String(target.version) },
          payload: { mutualPersonIds: ['missing'] },
        })
      ).statusCode,
    ).toBe(400);
    const route = (
      await app.inject({
        method: 'POST',
        url: '/api/routes',
        headers: { authorization: 'Bearer agent-secret' },
        payload: { companyId: company.id, targetPersonId: target.id, mutualPersonId: mutual.id },
      })
    ).json<{ id: string; version: number }>();
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/routes/${route.id}`,
          headers: { authorization: 'Bearer agent-secret', 'if-match': String(route.version) },
          payload: { stage: 'Intro requested' },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });

  it('permits permanent deletion only for archived dependency-free records from a human session', async () => {
    const { app } = await fixture();
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'northwind', password: 'a-secure-password' },
    });
    const sessionCookie = login.cookies.find((item) => item.name === 'northwind_session')!;
    const csrfCookie = login.cookies.find((item) => item.name === 'northwind_csrf')!;
    const { csrfToken } = login.json<{ csrfToken: string }>();
    const auth = {
      cookies: { [sessionCookie.name]: sessionCookie.value, [csrfCookie.name]: csrfCookie.value },
      headers: { 'x-csrf-token': csrfToken },
    };
    const company = (
      await app.inject({ method: 'POST', url: '/api/companies', ...auth, payload: { name: 'Disposable' } })
    ).json<{ id: string }>();
    expect((await app.inject({ method: 'DELETE', url: `/api/companies/${company.id}`, ...auth })).statusCode).toBe(400);
    await app.inject({
      method: 'POST',
      url: `/api/companies/${company.id}/archive`,
      ...auth,
      payload: { reason: 'Created by mistake' },
    });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/companies/${company.id}`,
          headers: { authorization: 'Bearer agent-secret' },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/companies/${company.id}`, ...auth })).statusCode).toBe(200);
    await app.close();
  });
});
