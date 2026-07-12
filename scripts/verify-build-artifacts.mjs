import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { env, stdout } from 'node:process';

const required = ['app.js', 'apps/api/dist/index.js', 'apps/web/dist/index.html', 'release-metadata.json'];
for (const path of required) await access(path, constants.R_OK);

const html = await readFile('apps/web/dist/index.html', 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => `apps/web/dist${match[1]}`);
if (!assets.length) throw new Error('Production web build has no fingerprinted assets');
for (const path of assets) await access(path, constants.R_OK);

const release = JSON.parse(await readFile('release-metadata.json', 'utf8'));
if (
  release.schemaVersion !== 1 ||
  !/^[a-f0-9]{40}$/i.test(String(release.commitSha ?? '')) ||
  Number.isNaN(Date.parse(String(release.buildTime ?? ''))) ||
  !['clean', 'dirty'].includes(release.treeState)
)
  throw new Error('Generated release metadata is invalid');
if (env.CI && release.treeState !== 'clean') throw new Error('CI release metadata must come from a clean tree');

stdout.write(
  `${JSON.stringify({ ok: true, required, assetCount: assets.length, release: { commitSha: release.commitSha, buildTime: release.buildTime, treeState: release.treeState } })}\n`,
);
