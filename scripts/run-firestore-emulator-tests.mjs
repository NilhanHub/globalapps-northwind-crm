/* global console, process */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SAFE_ENVIRONMENT_KEYS = new Set(
  [
    'ALLUSERSPROFILE',
    'APPDATA',
    'CI',
    'COLORTERM',
    'CommonProgramFiles',
    'CommonProgramFiles(x86)',
    'CommonProgramW6432',
    'ComSpec',
    'FORCE_COLOR',
    'GITHUB_ACTIONS',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'JAVA_HOME',
    'LANG',
    'LC_ALL',
    'LOCALAPPDATA',
    'NO_COLOR',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'Path',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TERM',
    'TMP',
    'TMPDIR',
    'USERPROFILE',
    'windir',
  ].map((key) => key.toLowerCase()),
);

export function buildSanitizedEnvironment(source, isolatedConfigDirectory) {
  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && SAFE_ENVIRONMENT_KEYS.has(key.toLowerCase())) sanitized[key] = value;
  }
  sanitized.APPDATA = isolatedConfigDirectory;
  sanitized.XDG_CONFIG_HOME = isolatedConfigDirectory;
  sanitized.DISABLE_AUTO_UPDATE = 'true';
  sanitized.DO_NOT_TRACK = '1';
  sanitized.NO_UPDATE_NOTIFIER = '1';
  return sanitized;
}

export function removeGeneratedEmulatorLogs(root) {
  for (const name of readdirSync(root)) {
    if (/^firebase-debug(?:\.\d+)?\.log$/.test(name) || name === 'firestore-debug.log') {
      rmSync(path.join(root, name), { force: true });
    }
  }
}

export function runFirestoreEmulatorTests(root = process.cwd()) {
  const projectRoot = path.resolve(root);
  const isolatedConfigDirectory = mkdtempSync(path.join(tmpdir(), 'northwind-firebase-cli-config-'));
  const firebaseCli = path.join(projectRoot, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
  const testCommand =
    'vitest run apps/api/src/repositories/firestore-emulator.test.ts apps/api/src/services/firestore-backup-restore.test.ts';

  removeGeneratedEmulatorLogs(projectRoot);
  try {
    if (!existsSync(firebaseCli)) {
      console.error('Firebase CLI is not installed at the expected local project path.');
      return 2;
    }
    const result = spawnSync(
      process.execPath,
      [firebaseCli, 'emulators:exec', '--only', 'firestore', '--project', 'demo-northwind-crm', testCommand],
      {
        cwd: projectRoot,
        env: buildSanitizedEnvironment(process.env, isolatedConfigDirectory),
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    if (result.error) {
      console.error(`Firebase emulator tests could not start: ${result.error.message}`);
      return 2;
    }
    return result.status ?? 1;
  } finally {
    removeGeneratedEmulatorLogs(projectRoot);
    rmSync(isolatedConfigDirectory, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = runFirestoreEmulatorTests();
