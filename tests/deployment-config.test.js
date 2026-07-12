import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifyBuildTreeState } from '../scripts/release-build-state.mjs';

test('release builds tolerate only Hostinger lockfile normalization', () => {
  assert.deepEqual(classifyBuildTreeState([]), { treeState: 'clean', unexpectedDirtyPaths: [] });
  assert.deepEqual(classifyBuildTreeState(['package-lock.json']), { treeState: 'clean', unexpectedDirtyPaths: [] });
  assert.deepEqual(classifyBuildTreeState(['package-lock.json', 'apps/api/src/index.ts']), {
    treeState: 'dirty',
    unexpectedDirtyPaths: ['apps/api/src/index.ts'],
  });
});

test('Hostinger builds once behind an explicit install flag before starting the API entry file', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const hostingerEntry = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const conditionalBuild = await readFile(new URL('../scripts/conditional-postinstall.mjs', import.meta.url), 'utf8');

  assert.equal(packageJson.scripts.postinstall, 'node scripts/conditional-postinstall.mjs');
  assert.match(conditionalBuild, /CRM_BUILD_ON_INSTALL/);
  assert.match(conditionalBuild, /npm['"], \[['"]run['"], ['"]build['"]\]/);
  assert.match(conditionalBuild, /verify:artifacts/);
  assert.equal(packageJson.scripts['verify:artifacts'], 'node scripts/verify-build-artifacts.mjs');
  assert.equal(packageJson.scripts.start, 'npm run start -w @northwind/api');
  assert.match(hostingerEntry, /import\(['"]\.\/apps\/api\/dist\/index\.js['"]\)/);
});

test('release automation proves the exact staging build before and after promotion', async () => {
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const promotion = await readFile(new URL('../.github/workflows/promote-production.yml', import.meta.url), 'utf8');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.match(ci, /staging-live:/);
  assert.match(ci, /verify-live-release\.mjs.*crm-staging\.globalapps\.world/);
  assert.match(promotion, /actions\/workflows\/ci\.yml\/runs/);
  assert.match(promotion, /event=push/);
  assert.match(promotion, /staging-live/);
  assert.match(promotion, /git push --atomic/);
  assert.match(promotion, /--force-with-lease=refs\/heads\/main:/);
  assert.match(promotion, /--force-with-lease=refs\/heads\/staging:/);
  assert.match(promotion, /verify-live-release\.mjs.*crm\.globalapps\.world/);
  assert.match(packageJson.scripts.build, /write-release-metadata\.mjs/);
});
