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

test('dependency automation pins actions, separates the static major and holds only TypeScript 7', async () => {
  const workflows = await Promise.all(
    ['ci.yml', 'promote-production.yml', 'dependency-watch.yml'].map((name) =>
      readFile(new URL(`../.github/workflows/${name}`, import.meta.url), 'utf8'),
    ),
  );
  const dependabot = await readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  const dependencyWatch = workflows[2];

  for (const workflow of workflows) {
    for (const reference of workflow.matchAll(/^\s*- uses:\s*([^\s#]+)/gm))
      assert.match(reference[1], /@[a-f0-9]{40}$/, `action must use an immutable SHA: ${reference[1]}`);
  }

  assert.match(dependencyWatch, /cron: ['"]0 6 \* \* 1['"]/);
  assert.match(dependencyWatch, /node-version: 22/);
  assert.match(dependencyWatch, /npm ci/);
  assert.match(dependencyWatch, /npm ls --all/);
  assert.match(dependencyWatch, /npm audit --omit=dev --audit-level=low/);
  assert.match(dependencyWatch, /npm run audit:dependencies/);
  assert.match(dependencyWatch, /npm view firebase-tools version/);
  assert.match(dependabot, /exclude-patterns:\s*\n\s*- ['"]@fastify\/static['"]/);
  assert.match(dependabot, /dependency-name: typescript[\s\S]*versions:[\s\S]*>=7\.0\.0 <8\.0\.0/);
});

test('troubleshooting documents recovery from a blocked GitHub-hosted staging runner', async () => {
  const troubleshooting = await readFile(new URL('../docs/TROUBLESHOOTING.md', import.meta.url), 'utf8');
  assert.match(troubleshooting, /GitHub staging check receives `403`/);
  assert.match(troubleshooting, /fresh GitHub runner/);
});
