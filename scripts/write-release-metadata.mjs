import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { stdout } from 'node:process';

const runGit = (...arguments_) => execFileSync('git', arguments_, { encoding: 'utf8', windowsHide: true }).trim();
const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'));
const commitSha = runGit('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error('Git did not return a full commit SHA');
const treeState = runGit('status', '--porcelain', '--untracked-files=no') ? 'dirty' : 'clean';
const metadata = {
  schemaVersion: 1,
  version: String(packageMetadata.version),
  commitSha,
  buildTime: new Date().toISOString(),
  treeState,
};
await writeFile('release-metadata.json', `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
stdout.write(`${JSON.stringify({ ok: true, ...metadata })}\n`);
