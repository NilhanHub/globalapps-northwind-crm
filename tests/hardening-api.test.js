import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 18788;
const BASE = `http://127.0.0.1:${PORT}`;
let dataDir;
let server;
let target;
let mutual;
let duplicateMutual;
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
      const response = await fetch(`${BASE}/api/companies`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start');
}

test.before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'northwind-hardening-test-'));
  fs.writeFileSync(path.join(dataDir, 'companies.json'), JSON.stringify([
    { id: 'company-test', name: 'Test Company', status: 'New', activity: [] },
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

test('setup creates duplicate candidates and derived people counts', async () => {
  let result = await request('/api/people', {
    method: 'POST', body: { name: 'Alex Morgan', linkedinUrl: 'https://linkedin.com/in/alex-morgan/', type: 'mutual' },
  });
  assert.equal(result.response.status, 201);
  mutual = result.body;

  result = await request('/api/people', {
    method: 'POST', body: { name: ' Alex  Morgan ', linkedinUrl: 'https://www.linkedin.com/in/alex-morgan', type: 'mutual' },
  });
  assert.equal(result.response.status, 201);
  duplicateMutual = result.body;

  result = await request('/api/people', {
    method: 'POST',
    body: {
      name: 'Target Person', type: 'target', companyId: 'company-test',
      mutualPersonIds: [mutual.id, duplicateMutual.id],
    },
  });
  assert.equal(result.response.status, 201);
  target = result.body;

  result = await request('/api/routes', {
    method: 'POST',
    body: { companyId: 'company-test', targetPersonId: target.id, mutualPersonId: mutual.id, owner: 'unassigned' },
  });
  assert.equal(result.response.status, 201);
  route = result.body;

  result = await request('/api/people');
  const enrichedTarget = result.body.find((person) => person.id === target.id);
  const enrichedMutual = result.body.find((person) => person.id === mutual.id);
  assert.equal(enrichedTarget.relationshipCount, 2);
  assert.equal(enrichedTarget.activeRouteCount, 1);
  assert.deepEqual(enrichedMutual.duplicateCandidateIds, [duplicateMutual.id]);
});

test('direct route edits remain API-compatible and append audit activity', async () => {
  let result = await request(`/api/routes/${route.id}`, {
    method: 'PATCH', body: { notes: 'Priority warm path', actor: 'Nilhan' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.notes, 'Priority warm path');
  result = await request(`/api/activities?routeId=${route.id}`);
  assert.equal(result.body.some((activity) => activity.type === 'edit' && activity.actor === 'Nilhan'), true);
});

test('bulk route actions are atomic and append structured activity', async () => {
  let result = await request('/api/routes/bulk/actions', {
    method: 'POST',
    body: {
      routeIds: [route.id], actor: 'Nilhan', owner: 'Paul',
      dueDate: '2026-07-10', nextAction: 'Call Alex',
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.routes[0].owner, 'Paul');
  assert.equal(result.body.routes[0].nextAction, 'Call Alex');
  assert.equal(result.body.activities[0].type, 'edit');
  assert.equal(result.body.activities[0].actor, 'Nilhan');
  assert.equal(result.body.activities[0].previousState.owner, 'unassigned');
  assert.equal(result.body.activities[0].resultingState.owner, 'Paul');

  result = await request('/api/routes/bulk/actions', {
    method: 'POST',
    body: { routeIds: [route.id, 'missing'], actor: 'Nilhan', owner: 'Jeremy' },
  });
  assert.equal(result.response.status, 404);
  const persisted = await request(`/api/routes?includeArchived=true`);
  assert.equal(persisted.body.find((item) => item.id === route.id).owner, 'Paul');
});

test('route stage movement is auditable and the latest action can be undone', async () => {
  let result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST',
    body: {
      action: 'move_stage', actor: 'Paul', stage: 'Mutual friend to contact',
      summary: 'Ready to ask Alex', details: 'Prepared the context note.',
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.route.stage, 'Mutual friend to contact');
  assert.equal(result.body.activity.type, 'edit');
  assert.equal(result.body.activity.details, 'Prepared the context note.');
  assert.equal(result.body.activity.previousState.stage, 'Found route');
  const activityId = result.body.activity.id;

  result = await request(`/api/routes/${route.id}/actions/${activityId}/undo`, {
    method: 'POST', body: { actor: 'Paul' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.route.stage, 'Found route');
  assert.equal(result.body.activity.type, 'undo');
  assert.equal(result.body.activity.undoOfActivityId, activityId);
});

test('route archive and restore append audit activity', async () => {
  let result = await request(`/api/routes/${route.id}/archive`, {
    method: 'POST', body: { actor: 'Nilhan', reason: 'Paused while the mutual is away' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.activity.type, 'archive');
  assert.equal(result.body.activity.reason, 'Paused while the mutual is away');

  result = await request(`/api/routes/${route.id}/restore`, {
    method: 'POST', body: { actor: 'Nilhan' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.activity.type, 'restore');
});

test('terminal route actions require a reason', async () => {
  let result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST', body: { action: 'mark_won', actor: 'Paul' },
  });
  assert.equal(result.response.status, 400);
  assert.match(result.body.error, /reason/i);

  result = await request(`/api/routes/${route.id}/actions`, {
    method: 'POST', body: { action: 'mark_dead', actor: 'Paul', reason: 'Mutual cannot make the introduction' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.route.outcome, 'dead');
  assert.equal(result.body.activity.reason, 'Mutual cannot make the introduction');
});

test('person archive hides the record and restore only revives its cascade', async () => {
  let result = await request('/api/routes', {
    method: 'POST', body: { companyId: 'company-test', targetPersonId: target.id, mutualPersonId: mutual.id, owner: 'Paul' },
  });
  assert.equal(result.response.status, 201);
  const cascadedRouteId = result.body.id;

  result = await request(`/api/people/${mutual.id}/archive`, {
    method: 'POST', body: { actor: 'Nilhan', reason: 'Temporary cleanup' },
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.person.archivedAt);
  assert.equal(result.body.routesArchived, 1);
  let activityResult = await request(`/api/activities?routeId=${cascadedRouteId}`);
  assert.equal(activityResult.body.some((activity) => activity.type === 'archive'), true);

  result = await request('/api/people');
  assert.equal(result.body.some((person) => person.id === mutual.id), false);
  result = await request('/api/people?includeArchived=true');
  assert.equal(result.body.some((person) => person.id === mutual.id), true);

  result = await request(`/api/people/${mutual.id}/restore`, {
    method: 'POST', body: { actor: 'Nilhan' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.person.archivedAt, undefined);
  activityResult = await request(`/api/activities?routeId=${cascadedRouteId}`);
  assert.equal(activityResult.body.some((activity) => activity.type === 'restore'), true);
});

test('people merge rewrites links and archives the source', async () => {
  const result = await request('/api/people/merge', {
    method: 'POST',
    body: { survivorId: mutual.id, sourceId: duplicateMutual.id, actor: 'Nilhan', reason: 'Same LinkedIn profile' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.source.mergedIntoPersonId, mutual.id);
  assert.ok(result.body.source.archivedAt);

  const peopleResult = await request('/api/people?includeArchived=true');
  const mergedTarget = peopleResult.body.find((person) => person.id === target.id);
  assert.deepEqual(mergedTarget.mutualPersonIds, [mutual.id]);
});

test('company archive cascades, filters by default, restores, and blocks dependent purge', async () => {
  let result = await request('/api/companies/company-test/archive', {
    method: 'POST', body: { actor: 'Nilhan', reason: 'Account paused' },
  });
  assert.equal(result.response.status, 200);
  assert.ok(result.body.company.archivedAt);

  result = await request('/api/companies');
  assert.equal(result.body.some((company) => company.id === 'company-test'), false);
  result = await request('/api/companies?includeArchived=true');
  assert.equal(result.body.some((company) => company.id === 'company-test'), true);

  result = await request('/api/companies/company-test', {
    method: 'DELETE', headers: { 'X-Source': 'ui' },
  });
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /depend/i);

  result = await request('/api/companies/company-test/restore', {
    method: 'POST', body: { actor: 'Nilhan' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.company.archivedAt, undefined);
});

test('startup recovers a prepared coordinated transaction journal', async () => {
  server.kill();
  await new Promise((resolve) => server.once('exit', resolve));
  const companies = JSON.parse(fs.readFileSync(path.join(dataDir, 'companies.json'), 'utf8'));
  const recoveredCompanies = companies.map((company) => company.id === 'company-test' ? { ...company, name: 'Recovered Company' } : company);
  fs.writeFileSync(path.join(dataDir, '.crm-transaction.json'), JSON.stringify({
    id: 'test-recovery',
    createdAt: new Date().toISOString(),
    before: { companies },
    after: { companies: recoveredCompanies },
  }, null, 2));

  server = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), CRM_DATA_DIR: dataDir, BYPASS_AUTH: '1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer();
  const result = await request('/api/companies');
  assert.equal(result.body.find((company) => company.id === 'company-test').name, 'Recovered Company');
  assert.equal(fs.existsSync(path.join(dataDir, '.crm-transaction.json')), false);
});
