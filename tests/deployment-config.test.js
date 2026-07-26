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

  assert.match(ci, /release-discipline:/);
  assert.match(ci, /github\.event_name == 'pull_request' && github\.base_ref == 'main'/);
  assert.match(ci, /Pull requests must target staging/);
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
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const dependencyWatch = workflows[2];

  for (const workflow of workflows) {
    for (const reference of workflow.matchAll(/^\s*- uses:\s*([^\s#]+)/gm))
      assert.match(reference[1], /@[a-f0-9]{40}$/, `action must use an immutable SHA: ${reference[1]}`);
  }

  assert.match(dependencyWatch, /cron: ['"]0 6 \* \* 1['"]/);
  assert.match(dependencyWatch, /node-version: 22/);
  assert.match(dependencyWatch, /npm ci/);
  assert.match(dependencyWatch, /npm ls --all/);
  assert.match(dependencyWatch, /npm run audit:dependencies/);
  assert.match(dependencyWatch, /Firebase CLI is not installed/);
  assert.doesNotMatch(dependencyWatch, /npm view firebase-tools version/);
  assert.equal(packageJson.devDependencies?.['firebase-tools'], undefined);
  assert.match(dependabot, /exclude-patterns:\s*\n\s*- ['"]@fastify\/static['"]/);
  assert.match(dependabot, /dependency-name: typescript[\s\S]*versions:[\s\S]*>=7\.0\.0 <8\.0\.0/);
});

test('Firestore emulator tests use Google Cloud SDK instead of Firebase CLI', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const emulatorRunner = await readFile(new URL('../scripts/run-firestore-emulator-tests.mjs', import.meta.url), 'utf8');

  assert.equal(packageJson.devDependencies?.['firebase-tools'], undefined);
  assert.match(emulatorRunner, /gcloud/);
  assert.match(emulatorRunner, /emulators/);
  assert.match(emulatorRunner, /firestore/);
  assert.match(emulatorRunner, /firebase-tools@15\.24\.0/);
});

test('reviewed package manifests pin every external dependency exactly', async () => {
  const manifests = [
    '../package.json',
    '../apps/api/package.json',
    '../apps/web/package.json',
    '../packages/api-client/package.json',
    '../packages/domain/package.json',
    '../packages/ui/package.json',
    '../infra/functions/backup-verifier/package.json',
  ];

  for (const manifest of manifests) {
    const packageJson = JSON.parse(await readFile(new URL(manifest, import.meta.url), 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'overrides']) {
      for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
        if (name.startsWith('@northwind/') && version === '*') continue;
        assert.match(
          version,
          /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
          `${manifest} must pin ${name} exactly instead of ${version}`,
        );
      }
    }
  }
});

test('repository reuse policy remains consistently all-rights-reserved', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const rights = await readFile(new URL('../RIGHTS.md', import.meta.url), 'utf8');
  const unlicensed = await readFile(new URL('../UNLICENSED', import.meta.url), 'utf8');
  const portfolioWorkflow = await readFile(
    new URL('../.github/workflows/portfolio-integrity.yml', import.meta.url),
    'utf8',
  );

  assert.equal(packageJson.license, 'UNLICENSED');
  assert.match(unlicensed, /All rights reserved/i);
  assert.match(readme, /remains unlicensed/i);
  assert.match(rights, /\[UNLICENSED\]\(UNLICENSED\)/);
  assert.match(portfolioWorkflow, /test -s UNLICENSED/);
  await assert.rejects(readFile(new URL('../LICENSE', import.meta.url), 'utf8'), { code: 'ENOENT' });
});

test('troubleshooting documents recovery from a blocked GitHub-hosted staging runner', async () => {
  const troubleshooting = await readFile(new URL('../docs/TROUBLESHOOTING.md', import.meta.url), 'utf8');
  assert.match(troubleshooting, /GitHub staging check receives `403`/);
  assert.match(troubleshooting, /fresh GitHub runner/);
});
