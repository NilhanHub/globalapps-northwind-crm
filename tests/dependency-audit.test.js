import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupAuditFindings,
  validateAuditData,
  validatePolicyShape,
} from '../scripts/dependency-audit.mjs';

function emptyAudit() {
  return { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };
}

function firebaseAudit() {
  return {
    vulnerabilities: {
      '@google-cloud/pubsub': { severity: 'moderate', via: ['@opentelemetry/core'] },
      '@opentelemetry/core': {
        severity: 'moderate',
        via: [{ name: '@opentelemetry/core', url: 'https://github.com/advisories/GHSA-8988-4f7v-96qf' }],
      },
      'firebase-tools': { severity: 'moderate', via: ['@google-cloud/pubsub', 'gaxios'] },
      gaxios: { severity: 'moderate', via: ['uuid'] },
      uuid: {
        severity: 'moderate',
        via: [{ name: 'uuid', url: 'https://github.com/advisories/GHSA-w5hq-g745-h8pq' }],
      },
    },
    metadata: { vulnerabilities: { moderate: 5, total: 5 } },
  };
}

function policy() {
  return {
    schemaVersion: 1,
    reviewCadenceDays: 7,
    exceptions: [
      {
        advisoryId: 'GHSA-w5hq-g745-h8pq',
        severity: 'moderate',
        reviewedAt: '2026-07-11',
        expiresOn: '2026-08-10',
        directDependency: { name: 'firebase-tools', version: '15.23.0' },
        allowedPackages: ['firebase-tools', 'gaxios', 'uuid'],
        expectedVia: [
          { from: 'firebase-tools', to: 'gaxios' },
          { from: 'gaxios', to: 'uuid' },
          { from: 'uuid', to: 'GHSA-W5HQ-G745-H8PQ' },
        ],
        expectedNodes: [
          { path: 'node_modules/firebase-tools', version: '15.23.0' },
          { path: 'node_modules/firebase-tools/node_modules/gaxios', version: '6.7.1' },
          {
            path: 'node_modules/firebase-tools/node_modules/gaxios/node_modules/uuid',
            version: '9.0.1',
          },
        ],
        rationale: 'Reviewed development-only UUID call path.',
      },
      {
        advisoryId: 'GHSA-8988-4f7v-96qf',
        severity: 'moderate',
        reviewedAt: '2026-07-11',
        expiresOn: '2026-08-10',
        directDependency: { name: 'firebase-tools', version: '15.23.0' },
        allowedPackages: ['@google-cloud/pubsub', '@opentelemetry/core', 'firebase-tools'],
        expectedVia: [
          { from: 'firebase-tools', to: '@google-cloud/pubsub' },
          { from: '@google-cloud/pubsub', to: '@opentelemetry/core' },
          { from: '@opentelemetry/core', to: 'GHSA-8988-4F7V-96QF' },
        ],
        expectedNodes: [
          { path: 'node_modules/firebase-tools', version: '15.23.0' },
          { path: 'node_modules/@google-cloud/pubsub', version: '5.3.1' },
          { path: 'node_modules/@opentelemetry/core', version: '1.30.1' },
        ],
        rationale: 'Reviewed development-only Pub/Sub emulator path.',
      },
    ],
  };
}

function lockfile() {
  return {
    packages: {
      'node_modules/firebase-tools': { version: '15.23.0', dev: true },
      'node_modules/firebase-tools/node_modules/gaxios': { version: '6.7.1', dev: true },
      'node_modules/firebase-tools/node_modules/gaxios/node_modules/uuid': {
        version: '9.0.1',
        dev: true,
      },
      'node_modules/@google-cloud/pubsub': { version: '5.3.1', dev: true },
      'node_modules/@opentelemetry/core': { version: '1.30.1', dev: true },
    },
  };
}

function validate(overrides = {}) {
  return validateAuditData({
    policy: policy(),
    productionAudit: emptyAudit(),
    fullAudit: firebaseAudit(),
    packageJson: { devDependencies: { 'firebase-tools': '15.23.0' } },
    lockfile: lockfile(),
    npmLsValid: true,
    now: new Date('2026-07-14T00:00:00Z'),
    ...overrides,
  });
}

test('clean audits pass without exceptions', () => {
  const result = validateAuditData({
    policy: { schemaVersion: 1, reviewCadenceDays: 7, exceptions: [] },
    productionAudit: emptyAudit(),
    fullAudit: emptyAudit(),
    packageJson: {},
    lockfile: { packages: {} },
  });
  assert.equal(result.ok, true);
});

test('five Firebase package warnings collapse into two advisory roots', () => {
  const groups = groupAuditFindings(firebaseAudit());
  assert.deepEqual(groups, [
    {
      advisoryId: 'GHSA-8988-4F7V-96QF',
      packages: ['@google-cloud/pubsub', '@opentelemetry/core', 'firebase-tools'],
      severities: ['moderate'],
    },
    {
      advisoryId: 'GHSA-W5HQ-G745-H8PQ',
      packages: ['firebase-tools', 'gaxios', 'uuid'],
      severities: ['moderate'],
    },
  ]);
  const result = validate();
  assert.equal(result.ok, true);
  assert.equal(result.propagatedWarningCount, 5);
  assert.equal(result.advisoryCount, 2);
});

test('production exposure fails closed', () => {
  const productionAudit = firebaseAudit();
  const result = validate({ productionAudit });
  assert.match(result.errors.join('\n'), /Production dependencies contain vulnerabilities/);
});

test('an unapproved advisory fails closed', () => {
  const changed = policy();
  changed.exceptions.pop();
  const result = validate({ policy: changed });
  assert.match(result.errors.join('\n'), /Unapproved advisory GHSA-8988-4F7V-96QF/);
});

test('a well-formed clean audit rejects obsolete exceptions', () => {
  const result = validate({ fullAudit: emptyAudit() });
  assert.match(result.errors.join('\n'), /is no longer reported; remove its stale exception/);
});

test('expired exceptions fail closed', () => {
  const result = validate({ now: new Date('2026-08-11T00:00:00Z') });
  assert.match(result.errors.join('\n'), /exception expired on 2026-08-10/);
});

test('dependency version drift fails closed', () => {
  const changed = lockfile();
  changed.packages['node_modules/@opentelemetry/core'].version = '2.8.0';
  const result = validate({ lockfile: changed });
  assert.match(result.errors.join('\n'), /dependency node drifted/);
});

test('dependency relationship drift fails closed', () => {
  const changed = policy();
  changed.exceptions[0].expectedVia[0].to = '@google-cloud/pubsub';
  const result = validate({ policy: changed });
  assert.match(result.errors.join('\n'), /dependency relationships drifted/);
});

test('high severity and invalid dependency trees cannot be excepted', () => {
  const changedAudit = firebaseAudit();
  changedAudit.vulnerabilities['@opentelemetry/core'].severity = 'high';
  const result = validate({ fullAudit: changedAudit, npmLsValid: false });
  const errors = result.errors.join('\n');
  assert.match(errors, /invalid dependency tree/);
  assert.match(errors, /high and critical findings cannot be excepted/);
});

test('malformed policies are rejected', () => {
  const errors = validatePolicyShape({ schemaVersion: 2, reviewCadenceDays: 0, exceptions: 'nope' });
  assert.match(errors.join('\n'), /schemaVersion must be 1/);
  assert.match(errors.join('\n'), /positive integer/);
  assert.match(errors.join('\n'), /exceptions must be an array/);
});

test('malformed exception entries return policy errors without evaluating the audit', () => {
  const changed = policy();
  delete changed.exceptions[0].expectedVia;
  const result = validate({ policy: changed });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /expectedVia must be a non-empty array/);
});
