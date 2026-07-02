import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 18787;
const BASE = `http://127.0.0.1:${PORT}`;
let dataDir;
let server;
let target;
let mutual;
let route;

async function request(url, options = {}) {
  const response = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  const body = await response.json();
  return { response, body };
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const result = await fetch(`${BASE}/api/companies`);
      if (result.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start');
}

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'northwind-crm-test-'));
  fs.writeFileSync(path.join(dataDir, 'companies.json'), JSON.stringify([
    { id: 'weetabix-food-company-test', name: 'Weetabix Food Company', status: 'New', activity: [] },
  ], null, 2));
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), CRM_DATA_DIR: dataDir, BYPASS_AUTH: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();
});

test.after(() => {
  if (server) server.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test('missing relationship stores initialize as empty arrays', async () => {
  for (const resource of ['people', 'routes', 'activities']) {
    const { response, body } = await request(`/api/${resource}`);
    assert.equal(response.status, 200);
    assert.deepEqual(body, []);
    assert.equal(fs.existsSync(path.join(dataDir, `${resource}.json`)), true);
  }
});

test('people can be created and a target can link unlimited mutual contacts', async () => {
  let result = await request('/api/people', {
    method: 'POST',
    body: { name: 'Siobhan Devall', type: 'mutual', location: 'United Kingdom' },
  });
  assert.equal(result.response.status, 201);
  mutual = result.body;

  result = await request('/api/people', {
    method: 'POST',
    body: {
      name: 'Paul Dunk',
      title: 'Head of IT PMO',
      type: 'target',
      companyId: 'weetabix-food-company-test',
      mutualPersonIds: [mutual.id],
    },
  });
  assert.equal(result.response.status, 201);
  target = result.body;
  assert.deepEqual(target.mutualPersonIds, [mutual.id]);

  result = await request(`/api/people/${target.id}`, {
    method: 'PATCH',
    body: { notes: 'Priority transformation contact' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.notes, 'Priority transformation contact');
});

test('route creation validates relationships and rejects duplicate active paths', async () => {
  let result = await request('/api/routes', {
    method: 'POST',
    body: {
      companyId: 'weetabix-food-company-test',
      targetPersonId: target.id,
      mutualPersonId: mutual.id,
      owner: 'unassigned',
    },
  });
  assert.equal(result.response.status, 201);
  route = result.body;
  assert.equal(route.stage, 'Found route');
  assert.equal(route.outcome, 'pending');

  result = await request('/api/routes', {
    method: 'POST',
    body: {
      companyId: 'weetabix-food-company-test',
      targetPersonId: target.id,
      mutualPersonId: mutual.id,
      owner: 'Paul',
    },
  });
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /active route already exists/i);

  result = await request(`/api/people/${target.id}`, {
    method: 'PATCH',
    body: { mutualPersonIds: [] },
  });
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /active route/i);
});

test('route actions persist stage changes and append typed activity', async () => {
  const actions = [
    ['call_mutual', 'call', 'Found route'],
    ['message_mutual', 'email', 'Found route'],
    ['intro_requested', 'intro_requested', 'Intro requested'],
    ['intro_agreed', 'intro_agreed', 'Intro agreed'],
    ['target_contacted', 'target_contacted', 'Target contacted'],
    ['meeting_reply', 'meeting', 'Meeting / reply'],
  ];

  for (const [action, type, stage] of actions) {
    const result = await request(`/api/routes/${route.id}/actions`, {
      method: 'POST',
      body: { action, actor: 'Paul', summary: `${action} recorded` },
    });
    assert.equal(result.response.status, 200, action);
    assert.equal(result.body.route.stage, stage, action);
    assert.equal(result.body.activity.type, type, action);
  }

  let result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST',
    body: { action: 'reassign', actor: 'Nilhan', owner: 'Jeremy' },
  });
  assert.equal(result.body.route.owner, 'Jeremy');
  assert.equal(result.body.activity.type, 'reassignment');

  result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST',
    body: { action: 'edit', actor: 'Jeremy', changes: { nextAction: 'Call Siobhan', dueDate: '2026-07-03' } },
  });
  assert.equal(result.body.route.nextAction, 'Call Siobhan');
  assert.equal(result.body.route.dueDate, '2026-07-03');

  result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST',
    body: { action: 'mark_won', actor: 'Jeremy', reason: 'Commercial agreement confirmed' },
  });
  assert.equal(result.body.route.stage, 'Won');
  assert.equal(result.body.route.outcome, 'won');
});

test('a completed pair can start a new route and be marked dead', async () => {
  let result = await request('/api/routes', {
    method: 'POST',
    body: {
      companyId: 'weetabix-food-company-test',
      targetPersonId: target.id,
      mutualPersonId: mutual.id,
      owner: 'Paul',
    },
  });
  assert.equal(result.response.status, 201);

  result = await request(`/api/routes/${result.body.id}/actions`, {
    method: 'POST',
    body: { action: 'mark_dead', actor: 'Paul', reason: 'No route available', summary: 'No route available' },
  });
  assert.equal(result.body.route.stage, 'Dead / no route');
  assert.equal(result.body.route.outcome, 'dead');
  assert.equal(result.body.activity.type, 'dead');
});

test('invalid references, owners, dates, actions, and IDs return useful errors', async () => {
  let result = await request('/api/people', { method: 'POST', body: { name: '', type: 'target' } });
  assert.equal(result.response.status, 400);

  result = await request('/api/routes', {
    method: 'POST',
    body: { companyId: 'missing', targetPersonId: target.id, mutualPersonId: mutual.id, owner: 'Paul' },
  });
  assert.equal(result.response.status, 400);

  result = await request(`/api/routes/${route.id}`, { method: 'PATCH', body: { owner: 'Nobody' } });
  assert.equal(result.response.status, 400);

  result = await request(`/api/routes/${route.id}`, { method: 'PATCH', body: { dueDate: 'July someday' } });
  assert.equal(result.response.status, 400);

  result = await request(`/api/routes/${route.id}/actions`, { method: 'POST', body: { action: 'teleport', actor: 'Paul' } });
  assert.equal(result.response.status, 400);

  result = await request('/api/routes/missing/actions', { method: 'POST', body: { action: 'intro_requested', actor: 'Paul' } });
  assert.equal(result.response.status, 404);
});

test('relationship stores remain intact after a server restart', async () => {
  server.kill();
  await new Promise((resolve) => server.once('exit', resolve));
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), CRM_DATA_DIR: dataDir, BYPASS_AUTH: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();

  const peopleResult = await request('/api/people');
  const routesResult = await request('/api/routes');
  const activitiesResult = await request('/api/activities');
  assert.equal(peopleResult.body.some((person) => person.name === 'Paul Dunk'), true);
  assert.equal(routesResult.body.length, 2);
  assert.equal(activitiesResult.body.some((activity) => activity.type === 'won'), true);
  assert.equal(activitiesResult.body.some((activity) => activity.type === 'dead'), true);
});
