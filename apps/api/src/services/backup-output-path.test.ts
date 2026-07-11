import { spawnSync } from 'node:child_process';
import { parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { requireExternalAbsoluteOutputPath } from '../../../../scripts/lib/secure-output-path.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

describe('backup generator output paths', () => {
  it('requires an explicit absolute path', () => {
    expect(() => requireExternalAbsoluteOutputPath(undefined, repositoryRoot)).toThrow(/explicit absolute path/i);
    expect(() => requireExternalAbsoluteOutputPath('', repositoryRoot)).toThrow(/explicit absolute path/i);
    expect(() => requireExternalAbsoluteOutputPath('Evidence/backup-key-transfer', repositoryRoot)).toThrow(
      /absolute path/i,
    );
  });

  it('rejects the repository root and every path beneath it, including Evidence', () => {
    expect(() => requireExternalAbsoluteOutputPath(parse(repositoryRoot).root, repositoryRoot)).toThrow(
      /filesystem root/i,
    );
    expect(() => requireExternalAbsoluteOutputPath(repositoryRoot, repositoryRoot)).toThrow(/outside the repository/i);
    expect(() => requireExternalAbsoluteOutputPath(resolve(repositoryRoot, 'Evidence'), repositoryRoot)).toThrow(
      /outside the repository/i,
    );
    expect(() =>
      requireExternalAbsoluteOutputPath(
        resolve(repositoryRoot, 'Evidence', 'backup-key-transfer', 'backup-trigger.token'),
        repositoryRoot,
      ),
    ).toThrow(/outside the repository/i);
  });

  it('accepts an absolute path outside the repository without creating it', () => {
    const external = resolve(repositoryRoot, '..', 'northwind-private-test', 'backup-trigger.token');
    expect(requireExternalAbsoluteOutputPath(external, repositoryRoot)).toBe(external);
  });

  it.each([
    {
      name: 'RSA key generator',
      command: [
        resolve(repositoryRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        resolve(repositoryRoot, 'scripts', 'backup-generate-keys.ts'),
      ],
    },
    { name: 'trigger-token generator', command: [resolve(repositoryRoot, 'scripts', 'backup-generate-trigger.mjs')] },
  ])('$name fails closed without writing secret material to stdout', ({ command }) => {
    for (const argument of [undefined, 'relative-output', repositoryRoot, resolve(repositoryRoot, 'Evidence')]) {
      const result = spawnSync(process.execPath, argument ? [...command, argument] : command, {
        cwd: repositoryRoot,
        encoding: 'utf8',
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/outside the repository|absolute path/i);
    }
  });
});
