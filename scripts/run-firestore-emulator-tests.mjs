/* global console, process */
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

function quoteCommandPart(value) {
  return /[\s"]/u.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function commandInvocation(base, args) {
  if (process.platform !== 'win32') return { command: base, args };
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [base, ...args].map(quoteCommandPart).join(' ')],
  };
}

function spawnSyncCommand(base, args, options) {
  const invocation = commandInvocation(base, args);
  return spawnSync(invocation.command, invocation.args, options);
}

function spawnCommand(base, args, options) {
  const invocation = commandInvocation(base, args);
  return spawn(invocation.command, invocation.args, options);
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Could not determine a free local port.'));
      });
    });
    server.on('error', reject);
  });
}

function canConnect(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, processHandle, timeoutMilliseconds = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMilliseconds) {
    if (processHandle.exitCode !== null) return false;
    if (await canConnect(port)) return true;
    wait(250);
  }
  return false;
}

export function buildSanitizedEnvironment(source, isolatedConfigDirectory) {
  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && SAFE_ENVIRONMENT_KEYS.has(key.toLowerCase())) sanitized[key] = value;
  }
  sanitized.APPDATA = isolatedConfigDirectory;
  sanitized.XDG_CONFIG_HOME = isolatedConfigDirectory;
  sanitized.CLOUDSDK_CONFIG = isolatedConfigDirectory;
  sanitized.DISABLE_AUTO_UPDATE = 'true';
  sanitized.DO_NOT_TRACK = '1';
  sanitized.NO_UPDATE_NOTIFIER = '1';
  return sanitized;
}

export function removeGeneratedEmulatorLogs(root) {
  for (const name of readdirSync(root)) {
    if (
      /^firebase-debug(?:\.\d+)?\.log$/.test(name) ||
      name === 'firestore-debug.log' ||
      /^firestore-emulator(?:\.\d+)?\.log$/.test(name)
    ) {
      rmSync(path.join(root, name), { force: true });
    }
  }
}

async function runFirestoreEmulatorTestsAsync(root = process.cwd()) {
  const projectRoot = path.resolve(root);
  const isolatedConfigDirectory = mkdtempSync(path.join(tmpdir(), 'northwind-gcloud-emulator-config-'));
  const fallbackFirebaseDirectory = mkdtempSync(path.join(tmpdir(), 'northwind-firebase-emulator-config-'));
  const port = await findFreePort();
  const hostPort = `127.0.0.1:${port}`;
  const baseEnv = buildSanitizedEnvironment(process.env, isolatedConfigDirectory);
  const emulatorEnv = {
    ...baseEnv,
    FIRESTORE_EMULATOR_HOST: hostPort,
    GCLOUD_PROJECT: 'demo-northwind-crm',
    GOOGLE_CLOUD_PROJECT: 'demo-northwind-crm',
  };

  removeGeneratedEmulatorLogs(projectRoot);
  let emulator;
  const testArgs = [
    'vitest',
    'run',
    'apps/api/src/repositories/firestore-emulator.test.ts',
    'apps/api/src/services/firestore-backup-restore.test.ts',
  ];
  const fallbackScript =
    process.platform === 'win32'
      ? path.join(fallbackFirebaseDirectory, 'run-firestore-tests.cmd')
      : path.join(fallbackFirebaseDirectory, 'run-firestore-tests.sh');
  writeFileSync(
    path.join(fallbackFirebaseDirectory, 'firebase.json'),
    `${JSON.stringify({ emulators: { firestore: { host: '127.0.0.1', port } } }, null, 2)}\n`,
  );
  if (process.platform === 'win32') {
    writeFileSync(
      fallbackScript,
      `@echo off\r\ncd /d "${projectRoot}"\r\nnpx ${testArgs.map(quoteCommandPart).join(' ')}\r\n`,
    );
  } else {
    writeFileSync(
      fallbackScript,
      `#!/usr/bin/env sh\ncd ${quoteCommandPart(projectRoot)}\nnpx ${testArgs.map(quoteCommandPart).join(' ')}\n`,
    );
    chmodSync(fallbackScript, 0o700);
  }
  try {
    const gcloudVersion = spawnSyncCommand('gcloud', ['--version'], {
      cwd: projectRoot,
      env: baseEnv,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (gcloudVersion.error || gcloudVersion.status !== 0) {
      console.error('Google Cloud SDK is required for Firestore emulator tests, but `gcloud --version` failed.');
      return 2;
    }

    emulator = spawnCommand(
      'gcloud',
      ['emulators', 'firestore', 'start', `--host-port=${hostPort}`, '--project=demo-northwind-crm', '--quiet'],
      {
        cwd: projectRoot,
        env: baseEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    emulator.stdout.on('data', (chunk) => process.stdout.write(chunk));
    emulator.stderr.on('data', (chunk) => process.stderr.write(chunk));

    if (!(await waitForPort(port, emulator))) {
      console.error(
        'Firestore emulator did not become ready through Google Cloud SDK; using pinned ephemeral Firebase CLI fallback.',
      );
      if (emulator.exitCode === null) emulator.kill();
      const fallback = spawnSyncCommand(
        'npx',
        [
          '--yes',
          '--package',
          'firebase-tools@15.24.0',
          'firebase',
          '--project',
          'demo-northwind-crm',
          'emulators:exec',
          '--only',
          'firestore',
          fallbackScript,
        ],
        {
          cwd: fallbackFirebaseDirectory,
          env: baseEnv,
          stdio: 'inherit',
          windowsHide: true,
        },
      );
      if (fallback.error) {
        console.error(`Ephemeral Firebase CLI fallback could not start: ${fallback.error.message}`);
        return 2;
      }
      return fallback.status ?? 1;
    }

    const result = spawnSyncCommand('npx', testArgs, {
      cwd: projectRoot,
      env: emulatorEnv,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) {
      console.error(`Firestore emulator tests could not start: ${result.error.message}`);
      return 2;
    }
    return result.status ?? 1;
  } finally {
    if (emulator && emulator.exitCode === null) {
      emulator.kill();
      wait(500);
      if (emulator.exitCode === null) emulator.kill('SIGKILL');
    }
    removeGeneratedEmulatorLogs(projectRoot);
    rmSync(isolatedConfigDirectory, { recursive: true, force: true });
    rmSync(fallbackFirebaseDirectory, { recursive: true, force: true });
  }
}

export function runFirestoreEmulatorTests(root = process.cwd()) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child-runner', root], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  return result.status ?? 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  if (process.argv[2] === '--child-runner') {
    process.exitCode = await runFirestoreEmulatorTestsAsync(process.argv[3] ?? process.cwd());
  } else {
    process.exitCode = runFirestoreEmulatorTests();
  }
}
