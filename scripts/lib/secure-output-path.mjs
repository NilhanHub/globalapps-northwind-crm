import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, parse, relative, resolve, sep } from 'node:path';

function isWithin(candidate, parent) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent))
  );
}

function resolveThroughExistingAncestor(candidate) {
  let ancestor = candidate;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) return candidate;
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), relative(ancestor, candidate));
}

export function requireExternalAbsoluteOutputPath(argument, repositoryRoot) {
  const supplied = typeof argument === 'string' ? argument.trim() : '';
  if (!supplied) throw new Error('Provide an explicit absolute path outside the repository');
  if (!isAbsolute(supplied)) throw new Error('The output path must be an explicit absolute path outside the repository');

  const output = resolve(supplied);
  if (output === parse(output).root) throw new Error('The output path cannot be a filesystem root');
  const root = realpathSync(resolve(repositoryRoot));
  if (isWithin(output, root) || isWithin(resolveThroughExistingAncestor(output), root))
    throw new Error('The output path must be outside the repository, including Evidence');
  return output;
}
