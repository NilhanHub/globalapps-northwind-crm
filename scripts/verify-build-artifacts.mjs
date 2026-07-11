import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { stdout } from 'node:process';

const required = ['app.js', 'apps/api/dist/index.js', 'apps/web/dist/index.html'];
for (const path of required) await access(path, constants.R_OK);

const html = await readFile('apps/web/dist/index.html', 'utf8');
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map((match) => `apps/web/dist${match[1]}`);
if (!assets.length) throw new Error('Production web build has no fingerprinted assets');
for (const path of assets) await access(path, constants.R_OK);

stdout.write(`${JSON.stringify({ ok: true, required, assetCount: assets.length })}\n`);
