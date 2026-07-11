import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const wrapper = resolve('scripts/hostinger-backup-cron.sh');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('Hostinger backup cron wrapper', () => {
  it('contains no trigger token and accepts no arbitrary environment branch', () => {
    const source = readFileSync(wrapper, 'utf8');
    expect(source).not.toContain('x-backup-token');
    expect(source).not.toMatch(/[A-Za-z0-9_-]{43,128}/);
    expect(source).toContain('app_root="$HOME/domains/crm-staging.globalapps.world/nodejs"');
    expect(source).toContain('app_root="$HOME/domains/crm.globalapps.world/nodejs"');
    expect(source).toContain('token_file="$HOME/northwind-crm-private/staging/secrets/backup-trigger.token"');
    expect(source).toContain('token_file="$HOME/northwind-crm-private/production/secrets/backup-trigger.token"');
    expect(source).toContain("node_bin='/opt/alt/alt-nodejs22/root/usr/bin/node'");
    expect(source).toContain('exec "$node_bin" scripts/backup-hostinger-run.mjs');
    expect(source).not.toContain('exec npm');
    expect(source).toContain('*) usage ;;');
  });

  if (process.platform === 'win32') {
    it.skip('exercises POSIX branches on non-Windows CI', () => undefined);
  } else {
    for (const environment of ['staging', 'production'] as const) {
      it(`maps ${environment} to its fixed application, URL and token path`, () => {
        const home = mkdtempSync(join(tmpdir(), 'northwind-hostinger-cron-'));
        temporaryDirectories.push(home);
        const domain = environment === 'staging' ? 'crm-staging.globalapps.world' : 'crm.globalapps.world';
        const appRoot = join(home, 'domains', domain, 'nodejs');
        const tokenFile = join(home, 'northwind-crm-private', environment, 'secrets', 'backup-trigger.token');
        const binDirectory = join(home, 'bin');
        const captureFile = join(home, 'capture.txt');
        mkdirSync(appRoot, { recursive: true });
        mkdirSync(join(home, 'northwind-crm-private', environment, 'secrets'), { recursive: true });
        mkdirSync(binDirectory, { recursive: true });
        writeFileSync(tokenFile, 'not-read-by-wrapper\n', { mode: 0o600 });
        const fakeNode = join(binDirectory, 'node');
        writeFileSync(
          fakeNode,
          '#!/bin/sh\nprintf "%s\\n%s\\n%s\\n%s\\n" "$PWD" "$CRM_BACKUP_URL" "$CRM_BACKUP_TRIGGER_TOKEN_FILE" "$*" > "$CAPTURE_FILE"\n',
        );
        chmodSync(fakeNode, 0o700);
        const testWrapper = join(home, 'hostinger-backup-cron.sh');
        writeFileSync(
          testWrapper,
          readFileSync(wrapper, 'utf8').replace(
            "node_bin='/opt/alt/alt-nodejs22/root/usr/bin/node'",
            `node_bin='${fakeNode}'`,
          ),
          { mode: 0o700 },
        );

        const result = spawnSync('sh', [testWrapper, environment], {
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: home,
            CAPTURE_FILE: captureFile,
          },
        });

        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(captureFile, 'utf8').trim().split('\n')).toEqual([
          appRoot,
          `https://${domain}`,
          tokenFile,
          'scripts/backup-hostinger-run.mjs',
        ]);
      });
    }

    it('rejects unsupported environments before invoking the runtime', () => {
      const home = mkdtempSync(join(tmpdir(), 'northwind-hostinger-cron-'));
      temporaryDirectories.push(home);
      const result = spawnSync('sh', [wrapper, 'development'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: home },
      });
      expect(result.status).toBe(64);
      expect(result.stderr).toContain('staging|production');
    });
  }
});
