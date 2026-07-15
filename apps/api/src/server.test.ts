import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createAuthService, hashPassword } from './auth/auth-service.js';
import { createJsonRepository } from './repositories/json-repository.js';
import { createApp } from './server.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

async function fixture(
  options: {
    now?: () => Date;
    repositoryUnavailable?: boolean;
    backup?: { directory: string; publicKeyPem: string; triggerTokenHash: string };
  } = {},
) {
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
  mkdirSync(join(publicDir, 'assets'), { recursive: true });
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>Northwind React</title>');
  writeFileSync(join(publicDir, 'assets', 'index-test123.js'), 'globalThis.__northwindAsset = true;\n');
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
    agentTokens: [
      {
        keyId: 'reporter',
        tokenHash: createHash('sha256').update('read-secret').digest('hex'),
        permissions: ['read'],
      },
    ],
    publicDir,
    release: {
      version: '2.1.0-test',
      commitSha: 'abc1234',
      buildTime: '2026-07-11T00:00:00.000Z',
      repositoryType: 'json',
    },
    ...(options.backup ? { backup: options.backup } : {}),
  });
  return { app, repository, dir };
}

describe('modular API server', () => {
  it('preserves API routing, SPA fallback, asset caching and security headers', async () => {
    const { app } = await fixture();

    const apiMissing = await app.inject({
      method: 'GET',
      url: '/api/not-a-route',
      headers: { authorization: 'Bearer agent-secret' },
    });
    expect(apiMissing.statusCode).toBe(404);
    expect(apiMissing.headers['cache-control']).toBe('no-store');
    expect(apiMissing.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const deepLink = await app.inject({ method: 'GET', url: '/companies/company-1' });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.headers['content-type']).toContain('text/html');
    expect(deepLink.headers['cache-control']).toBe('no-store');
    expect(deepLink.headers['content-security-policy']).toContain("default-src 'self'");
    expect(deepLink.headers['strict-transport-security']).toBeTruthy();
    expect(deepLink.body).toContain('<title>Northwind React</title>');

    const asset = await app.inject({ method: 'GET', url: '/assets/index-test123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toContain('max-age=31536000');
    expect(asset.headers['cache-control']).toContain('immutable');
    expect(asset.body).toContain('__northwindAsset');

    const missingAsset = await app.inject({ method: 'GET', url: '/assets/missing-test123.js' });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.body).not.toContain('<title>Northwind React</title>');
    await app.close();
  });

  it('exposes a public health check and protects bootstrap', async () => {
    const { app } = await fixture();
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: 'ok',
      readiness: 'ready',
      version: '2.1.0-test',
      commitSha: 'abc1234',
      repositoryType: 'json',
    });
    expect((await app.inject({ method: 'GET', url: '/api/live' })).json()).toMatchObject({
      status: 'ok',
      liveness: 'alive',
    });
    expect((await app.inject({ method: 'GET', url: '/api/ready' })).json()).toMatchObject({ readiness: 'ready' });
    expect(
      (await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' } })).statusCode,
    ).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json()).toEqual({ authenticated: false });
    expect((await app.inject({ method: 'GET', url: '/api/bootstrap' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/diagnostics' })).statusCode).toBe(401);
    await app.close();
  });

  it('reports repository failure instead of claiming a healthy service', async () => {
    const { app } = await fixture({ repositoryUnavailable: true });
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toMatchObject({ error: { code: 'FIRESTORE_UNAVAILABLE' } });
    await app.close();
  });

  it('reports backup freshness and accepts only strong dedicated trigger tokens', async () => {
    const root = mkdtempSync(join(tmpdir(), 'northwind-api-backup-'));
    dirs.push(root);
    const token = randomBytes(32).toString('base64url');
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const { app } = await fixture({
      backup: {
        directory: join(root, 'archives'),
        publicKeyPem: publicKey,
        triggerTokenHash: createHash('sha256').update(token).digest('hex'),
      },
    });
    const wrongToken = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({
      backup: { enabled: true, state: 'missing', count: 0 },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/maintenance/backups/run',
          headers: { 'x-backup-token': wrongToken },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/maintenance/backups/run',
          headers: { 'x-backup-token': token },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({
      backup: { enabled: true, state: 'healthy', count: 1 },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/maintenance/backups/run',
          headers: { 'x-backup-token': token },
        })
      ).statusCode,
    ).toBe(429);
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
    const firstRevision = await app.inject({ method: 'GET', url: '/api/workspace/revision', cookies });
    expect(firstRevision.statusCode).toBe(200);
    expect(firstRevision.json()).toMatchObject({ workspaceId: 'default', revision: expect.any(String) });
    const changed = await app.inject({
      method: 'PATCH',
      url: `/api/companies/${created.id}`,
      cookies,
      headers: { 'x-csrf-token': csrfToken, 'if-match': String(created.version) },
      payload: { status: 'Contacted' },
    });
    expect(changed.statusCode).toBe(200);
    const nextRevision = await app.inject({ method: 'GET', url: '/api/workspace/revision', cookies });
    expect(nextRevision.json<{ revision: string }>().revision).not.toBe(
      firstRevision.json<{ revision: string }>().revision,
    );
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

  it('rejects normalized duplicate companies and renames cached company fields transactionally', async () => {
    const { app } = await fixture();
    const headers = { authorization: 'Bearer agent-secret' };
    const company = (
      await app.inject({ method: 'POST', url: '/api/companies', headers, payload: { name: 'Acme & Sons' } })
    ).json<{ id: string; version: number }>();
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/companies',
      headers,
      payload: { name: ' ACME and Sons ' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ error: { code: 'DUPLICATE_IDENTITY', matches: [{ id: company.id }] } });
    const mutual = (
      await app.inject({ method: 'POST', url: '/api/people', headers, payload: { name: 'Morgan', type: 'mutual' } })
    ).json<{ id: string }>();
    const target = (
      await app.inject({
        method: 'POST',
        url: '/api/people',
        headers,
        payload: { name: 'Taylor', type: 'target', companyId: company.id, mutualPersonIds: [mutual.id] },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: 'POST',
      url: '/api/routes',
      headers,
      payload: { companyId: company.id, targetPersonId: target.id, mutualPersonId: mutual.id },
    });
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/companies/${company.id}`,
      headers: { ...headers, 'if-match': String(company.version) },
      payload: { name: 'Acme Global' },
    });
    expect(renamed.statusCode).toBe(200);
    const people = (await app.inject({ method: 'GET', url: '/api/people', headers })).json<
      Array<{ id: string; companyName: string }>
    >();
    const routes = (await app.inject({ method: 'GET', url: '/api/routes', headers })).json<
      Array<{ companyName: string }>
    >();
    expect(people.find((person) => person.id === target.id)?.companyName).toBe('Acme Global');
    expect(routes[0]?.companyName).toBe('Acme Global');
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
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/companies',
          headers: { authorization: 'Bearer read-secret' },
          payload: { name: 'Forbidden writer' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/companies', headers: { authorization: 'Bearer read-secret' } }))
        .statusCode,
    ).toBe(200);
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
      notes: 'Imported research note',
    });
    expect(routeResponse.statusCode).toBe(201);
    const route = routeResponse.json<{ id: string }>();
    expect((await request('POST', `/api/routes/${route.id}/actions`, { action: 'call_mutual' })).statusCode).toBe(400);
    const call = await request('POST', `/api/routes/${route.id}/actions`, {
      action: 'call_mutual',
      interaction: {
        contactPersonId: mutual.id,
        channel: 'call',
        outcome: 'Connected and discussed the target',
        occurredAt: '2026-07-10T10:00:00.000Z',
        notes: 'Warm conversation',
        nextAction: 'Send context',
        followUpDate: '2026-07-15',
      },
    });
    expect(call.statusCode).toBe(200);
    expect(call.json()).toMatchObject({
      activity: {
        type: 'call',
        occurredAt: '2026-07-10T10:00:00.000Z',
        interaction: { contactPersonId: mutual.id, channel: 'call' },
      },
    });
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
      activity: { type: 'move_stage', actor: 'northwind' },
    });
    expect(
      (await request('POST', `/api/routes/${route.id}/actions`, { action: 'move_stage', stage: 'Won' })).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', `/api/routes/${route.id}/actions`, {
          action: 'move_stage',
          stage: 'Dead / no route',
        })
      ).statusCode,
    ).toBe(400);
    const activityId = moved.json<{ activity: { id: string } }>().activity.id;
    const undone = await request('POST', `/api/routes/${route.id}/actions/${activityId}/undo`, {});
    expect(undone.json()).toMatchObject({ route: { stage: 'Found route' }, activity: { type: 'undo' } });
    expect((await request('GET', '/api/activities')).json()).toHaveLength(3);
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
    await request('POST', `/api/routes/${route.id}/actions`, { action: 'move_stage', stage: 'Target contacted' });
    const reset = await request('POST', '/api/routes/bulk/actions', { routeIds: [route.id], action: 'reset' });
    expect(reset.json()).toMatchObject({
      routes: [
        {
          owner: 'unassigned',
          stage: 'Found route',
          outcome: 'pending',
          confidence: 'emerging',
          dueDate: '',
          nextAction: '',
          notes: 'Imported research note',
        },
      ],
      activities: [{ type: 'reset' }],
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

  it('previews and commits idempotent resumable research imports', async () => {
    const { app } = await fixture();
    const headers = { authorization: 'Bearer agent-secret' };
    const content = `Company: Import Co\nTarget: Taylor Import\nTarget role: CFO\nMutual contact: Morgan Import\nNotes: Historical context only`;
    const payload = { files: [{ filename: 'Connections at Import Co.eml', content }] };
    const preview = await app.inject({ method: 'POST', url: '/api/imports/research/preview', headers, payload });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ preview: { creates: { companies: 1, people: 2, routes: 1 } } });
    const imported = await app.inject({ method: 'POST', url: '/api/imports/research', headers, payload });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ status: 'completed', summary: { companiesCreated: 1, routesCreated: 1 } });
    const jobId = imported.json<{ id: string }>().id;
    expect((await app.inject({ method: 'GET', url: `/api/imports/${jobId}`, headers })).statusCode).toBe(200);
    const repeated = await app.inject({ method: 'POST', url: '/api/imports/research', headers, payload });
    expect(repeated.json()).toMatchObject({
      status: 'completed',
      summary: { companiesCreated: 0, peopleCreated: 0, peopleUpdated: 0, routesCreated: 0 },
    });
    expect((await app.inject({ method: 'GET', url: '/api/routes', headers })).json()).toHaveLength(1);
    await app.close();
  });

  it('sends only affected records to coordinated cloud-style transactions', async () => {
    const { app, repository } = await fixture();
    const headers = { authorization: 'Bearer agent-secret' };
    const companies: Array<{ id: string }> = [];
    for (let index = 0; index < 20; index += 1) {
      companies.push(
        (
          await app.inject({
            method: 'POST',
            url: '/api/companies',
            headers,
            payload: { name: `Transaction Fixture ${index}` },
          })
        ).json<{ id: string }>(),
      );
    }
    const original = repository.upsertTransaction.bind(repository);
    repository.upsertTransaction = async (changes) => {
      const count = Object.values(changes).reduce((sum, records) => sum + (records?.length ?? 0), 0);
      expect(count).toBeLessThanOrEqual(2);
      await original(changes);
    };
    const archived = await app.inject({
      method: 'POST',
      url: `/api/companies/${companies[0]!.id}/archive`,
      headers,
      payload: { reason: 'Transaction scope test' },
    });
    expect(archived.statusCode).toBe(200);
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

  it('manages configurable owners, shared reminders and opaque cursor pages', async () => {
    const { app } = await fixture();
    const agent = { authorization: 'Bearer agent-secret' };
    const company = (
      await app.inject({ method: 'POST', url: '/api/companies', headers: agent, payload: { name: 'Paged Company' } })
    ).json<{ id: string }>();
    const mutual = (
      await app.inject({
        method: 'POST',
        url: '/api/people',
        headers: agent,
        payload: { name: 'Mutual', type: 'mutual' },
      })
    ).json<{ id: string }>();
    const target = (
      await app.inject({
        method: 'POST',
        url: '/api/people',
        headers: agent,
        payload: { name: 'Target', type: 'target', companyId: company.id, mutualPersonIds: [mutual.id] },
      })
    ).json<{ id: string }>();
    const route = (
      await app.inject({
        method: 'POST',
        url: '/api/routes',
        headers: agent,
        payload: { companyId: company.id, targetPersonId: target.id, mutualPersonId: mutual.id },
      })
    ).json<{ id: string; ownerId: string; version: number }>();
    expect(route.ownerId).toBe('owner-unassigned');
    const searchedRoutes = await app.inject({
      method: 'GET',
      url: '/api/routes/page?limit=1&q=target',
      headers: agent,
    });
    expect(searchedRoutes.statusCode).toBe(200);
    expect(searchedRoutes.json()).toMatchObject({ items: [{ id: route.id }] });
    expect((await app.inject({ method: 'GET', url: '/api/owners', headers: agent })).json()).toHaveLength(5);
    const duplicateOwner = await app.inject({
      method: 'POST',
      url: '/api/owners',
      headers: agent,
      payload: { displayName: 'Paul' },
    });
    expect(duplicateOwner.statusCode).toBe(409);
    const owner = (
      await app.inject({ method: 'POST', url: '/api/owners', headers: agent, payload: { displayName: 'Morgan' } })
    ).json<{ id: string; version: number }>();
    const reorderedOwner = (
      await app.inject({
        method: 'PATCH',
        url: `/api/owners/${owner.id}`,
        headers: { ...agent, 'if-match': String(owner.version) },
        payload: { sortOrder: 0 },
      })
    ).json<{ id: string; version: number }>();
    expect(
      (await app.inject({ method: 'GET', url: '/api/owners', headers: agent })).json<Array<{ id: string }>>()[0]!.id,
    ).toBe(owner.id);
    const assigned = await app.inject({
      method: 'PATCH',
      url: `/api/routes/${route.id}`,
      headers: { ...agent, 'if-match': String(route.version) },
      payload: { ownerId: owner.id, dueDate: '2020-01-01', nextAction: 'Follow up' },
    });
    expect(assigned.statusCode).toBe(200);
    const overdueRoutes = await app.inject({
      method: 'GET',
      url: '/api/routes/page?limit=1&view=overdue',
      headers: agent,
    });
    expect(overdueRoutes.statusCode).toBe(200);
    expect(overdueRoutes.json()).toMatchObject({ items: [{ id: route.id }] });
    const reminders = await app.inject({ method: 'GET', url: '/api/reminders', headers: agent });
    expect(reminders.json<{ items: Array<{ category: string }> }>().items.map((item) => item.category)).toContain(
      'overdue',
    );
    const snooze = await app.inject({
      method: 'POST',
      url: `/api/routes/${route.id}/actions`,
      headers: agent,
      payload: { action: 'snooze_reminder', until: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(snooze.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/reminders', headers: agent })).json<{ items: unknown[] }>().items,
    ).toHaveLength(0);
    const refusedDeactivation = await app.inject({
      method: 'POST',
      url: `/api/owners/${owner.id}/deactivate`,
      headers: agent,
      payload: { version: reorderedOwner.version },
    });
    expect(refusedDeactivation.statusCode).toBe(409);
    const deactivated = await app.inject({
      method: 'POST',
      url: `/api/owners/${owner.id}/deactivate`,
      headers: agent,
      payload: { version: reorderedOwner.version, replacementOwnerId: 'owner-unassigned' },
    });
    expect(deactivated.json()).toMatchObject({ owner: { active: false }, reassignedRouteCount: 1 });
    const reassignedRoute = (await app.inject({ method: 'GET', url: '/api/routes', headers: agent }))
      .json<Array<{ id: string; ownerId: string }>>()
      .find((candidate) => candidate.id === route.id)!;
    expect(reassignedRoute.ownerId).toBe('owner-unassigned');
    const rescheduled = await app.inject({
      method: 'POST',
      url: `/api/routes/${route.id}/actions`,
      headers: agent,
      payload: { action: 'reschedule_next_action', followUpDate: '2027-01-15' },
    });
    expect(rescheduled.json()).toMatchObject({ route: { dueDate: '2027-01-15' } });
    const completed = await app.inject({
      method: 'POST',
      url: `/api/routes/${route.id}/actions`,
      headers: agent,
      payload: { action: 'complete_next_action' },
    });
    expect(completed.json()).toMatchObject({ route: { dueDate: '', nextAction: '' } });
    const laterCompany = (
      await app.inject({ method: 'POST', url: '/api/companies', headers: agent, payload: { name: 'Zulu Systems' } })
    ).json<{ id: string }>();
    const page = await app.inject({ method: 'GET', url: '/api/companies/page?limit=1', headers: agent });
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ hasMore: true, items: [{ id: company.id }] });
    const searchPage = await app.inject({
      method: 'GET',
      url: '/api/companies/page?limit=1&q=zulu',
      headers: agent,
    });
    expect(searchPage.statusCode).toBe(200);
    expect(searchPage.json()).toMatchObject({
      hasMore: false,
      nextCursor: null,
      items: [{ id: laterCompany.id, name: 'Zulu Systems' }],
    });
    const mismatchedCursor = await app.inject({
      method: 'GET',
      url: `/api/companies/page?limit=1&q=zulu&cursor=${encodeURIComponent(page.json<{ nextCursor: string }>().nextCursor)}`,
      headers: agent,
    });
    expect(mismatchedCursor.statusCode).toBe(400);
    expect(mismatchedCursor.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } });
    const invalidCursor = await app.inject({
      method: 'GET',
      url: '/api/companies/page?limit=1&cursor=not-a-cursor',
      headers: agent,
    });
    expect(invalidCursor.statusCode).toBe(400);
    expect(invalidCursor.json()).toMatchObject({ error: { code: 'INVALID_CURSOR' } });
    await app.close();
  });
});
