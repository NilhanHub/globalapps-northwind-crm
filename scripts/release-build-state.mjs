const allowedHostingerDriftPaths = new Set(['package-lock.json']);

export function classifyBuildTreeState(paths) {
  const unexpectedDirtyPaths = [...new Set(paths.map((value) => String(value).trim()).filter(Boolean))]
    .filter((path) => !allowedHostingerDriftPaths.has(path))
    .sort();
  return { treeState: unexpectedDirtyPaths.length ? 'dirty' : 'clean', unexpectedDirtyPaths };
}
