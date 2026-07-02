import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production installs build the workspace before Hostinger starts the API entry file', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const hostingerEntry = await readFile(new URL('../hostinger-entry.js', import.meta.url), 'utf8');

  assert.equal(packageJson.scripts.postinstall, 'npm run build');
  assert.equal(packageJson.scripts.start, 'npm run start -w @northwind/api');
  assert.match(hostingerEntry, /import ['"]\.\/apps\/api\/dist\/index\.js['"]/);
});
