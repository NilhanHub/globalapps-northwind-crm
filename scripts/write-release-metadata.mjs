import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { env, exit, platform, stdout } from 'node:process';
import { classifyBuildTreeState } from './release-build-state.mjs';

const runGit = (...arguments_) => execFileSync('git', arguments_, { encoding: 'utf8', windowsHide: true }).trim();
const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'));
const commitSha = runGit('rev-parse', 'HEAD');
if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error('Git did not return a full commit SHA');
const dirtyPaths = [
  runGit('diff', '--name-only', 'HEAD', '--'),
  runGit('diff', '--cached', '--name-only', 'HEAD', '--'),
]
  .flatMap((value) => value.split(/\r?\n/))
  .map((value) => value.trim())
  .filter(Boolean)
  .filter((value, index, values) => values.indexOf(value) === index)
  .sort();
const { treeState, unexpectedDirtyPaths } = classifyBuildTreeState(dirtyPaths);
const metadata = {
  schemaVersion: 1,
  version: String(packageMetadata.version),
  commitSha,
  buildTime: new Date().toISOString(),
  treeState,
  dirtyPaths,
  unexpectedDirtyPaths,
};
await writeFile('release-metadata.json', `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
stdout.write(`${JSON.stringify({ ok: true, ...metadata })}\n`);
const build = spawnSync('npm', ['run', 'build', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  shell: platform === 'win32',
  env: {
    ...env,
    NORTHWIND_BUILD_VERSION: metadata.version,
    NORTHWIND_BUILD_COMMIT_SHA: metadata.commitSha,
    NORTHWIND_BUILD_TIME: metadata.buildTime,
    NORTHWIND_BUILD_TREE_STATE: metadata.treeState,
  },
});
if (build.status !== 0) exit(build.status ?? 1);
