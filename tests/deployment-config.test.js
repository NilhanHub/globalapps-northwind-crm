import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Hostinger builds once behind an explicit install flag before starting the API entry file', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const hostingerEntry = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const conditionalBuild = await readFile(new URL('../scripts/conditional-postinstall.mjs', import.meta.url), 'utf8');

  assert.equal(packageJson.scripts.postinstall, 'node scripts/conditional-postinstall.mjs');
  assert.match(conditionalBuild, /CRM_BUILD_ON_INSTALL/);
  assert.match(conditionalBuild, /npm['"], \[['"]run['"], ['"]build['"]\]/);
  assert.equal(packageJson.scripts.start, 'npm run start -w @northwind/api');
  assert.match(hostingerEntry, /import\(['"]\.\/apps\/api\/dist\/index\.js['"]\)/);
});
