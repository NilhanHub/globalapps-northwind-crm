import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSanitizedEnvironment,
  removeGeneratedEmulatorLogs,
} from '../scripts/run-firestore-emulator-tests.mjs';

test('Firebase emulator environment excludes credentials and unrelated application configuration', () => {
  const environment = buildSanitizedEnvironment(
    {
      Path: 'safe-path',
      JAVA_HOME: 'safe-java',
      CI: 'true',
      APPDATA: 'original-appdata',
      CRM_PASSWORD_SCRYPT: 'secret',
      FIREBASE_TOKEN: 'secret',
      GOOGLE_APPLICATION_CREDENTIALS: 'secret-file',
      SOME_API_KEY: 'secret',
    },
    'isolated-config',
  );

  assert.equal(environment.Path, 'safe-path');
  assert.equal(environment.JAVA_HOME, 'safe-java');
  assert.equal(environment.CI, 'true');
  assert.equal(environment.APPDATA, 'isolated-config');
  assert.equal(environment.XDG_CONFIG_HOME, 'isolated-config');
  assert.equal(environment.CRM_PASSWORD_SCRYPT, undefined);
  assert.equal(environment.FIREBASE_TOKEN, undefined);
  assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(environment.SOME_API_KEY, undefined);
});

test('Firebase emulator log cleanup removes only generated emulator logs', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'northwind-emulator-logs-'));
  try {
    for (const name of ['firebase-debug.log', 'firebase-debug.1.log', 'firestore-debug.log', 'keep.log']) {
      writeFileSync(path.join(root, name), 'test', 'utf8');
    }
    removeGeneratedEmulatorLogs(root);
    assert.equal(existsSync(path.join(root, 'keep.log')), true);
    assert.equal(existsSync(path.join(root, 'firebase-debug.log')), false);
    assert.equal(existsSync(path.join(root, 'firebase-debug.1.log')), false);
    assert.equal(existsSync(path.join(root, 'firestore-debug.log')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
