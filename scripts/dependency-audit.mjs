/* global console, process */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEVERITY = Object.freeze({ info: 0, low: 1, moderate: 2, high: 3, critical: 4 });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditConfigurationError extends Error {}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left, right) {
  return JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right));
}

function advisoryId(value) {
  const text = JSON.stringify(value);
  return text.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i)?.[0]?.toUpperCase() ?? null;
}

function vulnerabilitiesFrom(audit) {
  return audit && typeof audit.vulnerabilities === 'object' && audit.vulnerabilities !== null
    ? audit.vulnerabilities
    : {};
}

function observedViaForGroup(audit, group, allowedPackages) {
  const allowed = new Set(allowedPackages);
  const edges = [];
  for (const [from, vulnerability] of Object.entries(vulnerabilitiesFrom(audit))) {
    if (!allowed.has(from)) continue;
    for (const via of vulnerability.via ?? []) {
      const to = typeof via === 'string' ? via : (advisoryId(via) ?? `UNRESOLVED:${from}`);
      if (allowed.has(to) || to === group.advisoryId) edges.push(`${from}->${to}`);
    }
  }
  return sortedUnique(edges);
}

export function groupAuditFindings(audit) {
  const vulnerabilities = vulnerabilitiesFrom(audit);
  const rootsByPackage = new Map();

  function rootsFor(packageName, trail = new Set()) {
    if (rootsByPackage.has(packageName)) return rootsByPackage.get(packageName);
    if (trail.has(packageName)) return new Set([`UNRESOLVED:${packageName}`]);

    const vulnerability = vulnerabilities[packageName];
    if (!vulnerability) return new Set([`UNRESOLVED:${packageName}`]);

    const nextTrail = new Set(trail).add(packageName);
    const roots = new Set();
    for (const via of vulnerability.via ?? []) {
      if (typeof via === 'string') {
        for (const root of rootsFor(via, nextTrail)) roots.add(root);
      } else {
        roots.add(advisoryId(via) ?? `UNRESOLVED:${packageName}`);
      }
    }
    if (roots.size === 0) roots.add(`UNRESOLVED:${packageName}`);
    rootsByPackage.set(packageName, roots);
    return roots;
  }

  const groups = new Map();
  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    for (const root of rootsFor(packageName)) {
      const group = groups.get(root) ?? {
        advisoryId: root,
        packages: new Set(),
        severities: new Set(),
      };
      group.packages.add(packageName);
      group.severities.add(vulnerability.severity);
      groups.set(root, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      advisoryId: group.advisoryId,
      packages: sortedUnique(group.packages),
      severities: sortedUnique(group.severities),
    }))
    .sort((left, right) => left.advisoryId.localeCompare(right.advisoryId));
}

export function validatePolicyShape(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['Policy must be a JSON object.'];
  if (policy.schemaVersion !== 1) errors.push('Policy schemaVersion must be 1.');
  if (!Number.isInteger(policy.reviewCadenceDays) || policy.reviewCadenceDays < 1) {
    errors.push('Policy reviewCadenceDays must be a positive integer.');
  }
  if (!Array.isArray(policy.exceptions)) return [...errors, 'Policy exceptions must be an array.'];

  const ids = new Set();
  for (const [index, exception] of policy.exceptions.entries()) {
    const prefix = `Exception ${index + 1}`;
    if (!/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(exception.advisoryId ?? '')) {
      errors.push(`${prefix} must have a valid advisoryId.`);
    } else if (ids.has(exception.advisoryId.toUpperCase())) {
      errors.push(`${prefix} duplicates advisoryId ${exception.advisoryId}.`);
    } else {
      ids.add(exception.advisoryId.toUpperCase());
    }
    if (!['low', 'moderate'].includes(exception.severity)) {
      errors.push(`${prefix} severity must be low or moderate.`);
    }
    for (const field of ['reviewedAt', 'expiresOn']) {
      if (!ISO_DATE.test(exception[field] ?? '') || Number.isNaN(Date.parse(`${exception[field]}T00:00:00Z`))) {
        errors.push(`${prefix} ${field} must be a valid ISO date.`);
      }
    }
    if (
      ISO_DATE.test(exception.reviewedAt ?? '') &&
      ISO_DATE.test(exception.expiresOn ?? '') &&
      exception.reviewedAt > exception.expiresOn
    ) {
      errors.push(`${prefix} expiresOn must not precede reviewedAt.`);
    }
    if (!exception.directDependency?.name || !exception.directDependency?.version) {
      errors.push(`${prefix} must identify the exact direct development dependency.`);
    }
    if (!Array.isArray(exception.allowedPackages) || exception.allowedPackages.length === 0) {
      errors.push(`${prefix} allowedPackages must be a non-empty array.`);
    } else if (sortedUnique(exception.allowedPackages).length !== exception.allowedPackages.length) {
      errors.push(`${prefix} allowedPackages must not contain duplicates.`);
    }
    if (!Array.isArray(exception.expectedVia) || exception.expectedVia.length === 0) {
      errors.push(`${prefix} expectedVia must be a non-empty array.`);
    } else if (exception.expectedVia.some((edge) => !edge?.from || !edge?.to)) {
      errors.push(`${prefix} expectedVia entries require from and to values.`);
    }
    if (!Array.isArray(exception.expectedNodes) || exception.expectedNodes.length === 0) {
      errors.push(`${prefix} expectedNodes must be a non-empty array.`);
    } else {
      for (const node of exception.expectedNodes) {
        if (!node?.path?.startsWith('node_modules/') || !node?.version) {
          errors.push(`${prefix} expectedNodes require node_modules paths and exact versions.`);
          break;
        }
      }
    }
    if (!exception.rationale || typeof exception.rationale !== 'string') {
      errors.push(`${prefix} must include a rationale.`);
    }
  }
  return errors;
}

function maximumSeverity(severities) {
  return severities.reduce(
    (maximum, severity) => (SEVERITY[severity] > SEVERITY[maximum] ? severity : maximum),
    'info',
  );
}

export function validateAuditData({
  policy,
  productionAudit,
  fullAudit,
  packageJson,
  lockfile,
  npmLsValid = true,
  now = new Date(),
}) {
  const policyErrors = validatePolicyShape(policy);
  const errors = [...policyErrors];
  const groups = groupAuditFindings(fullAudit);
  const productionPackages = Object.keys(vulnerabilitiesFrom(productionAudit)).sort();
  const today = now.toISOString().slice(0, 10);

  if (!npmLsValid) errors.push('npm ls reports an invalid dependency tree.');
  if (productionPackages.length > 0) {
    errors.push(`Production dependencies contain vulnerabilities: ${productionPackages.join(', ')}.`);
  }
  if (policyErrors.length > 0) {
    return { ok: false, errors, groups, productionPackages };
  }

  const exceptions = new Map((policy?.exceptions ?? []).map((entry) => [entry.advisoryId.toUpperCase(), entry]));
  const seen = new Set();

  for (const group of groups) {
    if (group.advisoryId.startsWith('UNRESOLVED:')) {
      errors.push(`Could not resolve an advisory root for ${group.advisoryId.slice(11)}.`);
      continue;
    }
    const exception = exceptions.get(group.advisoryId);
    if (!exception) {
      errors.push(`Unapproved advisory ${group.advisoryId} affects ${group.packages.join(', ')}.`);
      continue;
    }
    seen.add(group.advisoryId);

    const observedSeverity = maximumSeverity(group.severities);
    if (SEVERITY[observedSeverity] >= SEVERITY.high) {
      errors.push(`${group.advisoryId} is ${observedSeverity}; high and critical findings cannot be excepted.`);
    } else if (observedSeverity !== exception.severity) {
      errors.push(`${group.advisoryId} severity drifted from ${exception.severity} to ${observedSeverity}.`);
    }
    if (!sameStrings(group.packages, exception.allowedPackages)) {
      errors.push(
        `${group.advisoryId} package chain drifted; expected ${sortedUnique(exception.allowedPackages).join(', ')}, observed ${group.packages.join(', ')}.`,
      );
    }
    const expectedVia = exception.expectedVia.map(
      (edge) => `${edge.from}->${edge.to.toUpperCase().startsWith('GHSA-') ? edge.to.toUpperCase() : edge.to}`,
    );
    const observedVia = observedViaForGroup(fullAudit, group, exception.allowedPackages);
    if (!sameStrings(observedVia, expectedVia)) {
      errors.push(
        `${group.advisoryId} dependency relationships drifted; expected ${sortedUnique(expectedVia).join(', ')}, observed ${observedVia.join(', ')}.`,
      );
    }
    if (today > exception.expiresOn) {
      errors.push(`${group.advisoryId} exception expired on ${exception.expiresOn}.`);
    }

    const declaredVersion = packageJson?.devDependencies?.[exception.directDependency.name];
    if (declaredVersion !== exception.directDependency.version) {
      errors.push(
        `${group.advisoryId} direct dependency drifted; expected ${exception.directDependency.name}@${exception.directDependency.version}.`,
      );
    }
    for (const expected of exception.expectedNodes) {
      const observed = lockfile?.packages?.[expected.path];
      if (!observed || observed.version !== expected.version) {
        errors.push(`${group.advisoryId} dependency node drifted at ${expected.path}; expected ${expected.version}.`);
      } else if (observed.dev !== true) {
        errors.push(`${group.advisoryId} dependency node is no longer development-only: ${expected.path}.`);
      }
    }
  }

  for (const exception of policy?.exceptions ?? []) {
    if (!seen.has(exception.advisoryId.toUpperCase())) {
      errors.push(`${exception.advisoryId} is no longer reported; remove its stale exception.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    groups,
    productionPackages,
    propagatedWarningCount: Object.keys(vulnerabilitiesFrom(fullAudit)).length,
    advisoryCount: groups.length,
  };
}

function parseJsonOutput(result, label) {
  if (!result.stdout?.trim()) {
    throw new AuditConfigurationError(`${label} produced no JSON output.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new AuditConfigurationError(`${label} produced malformed JSON output.`);
  }
}

function runNpm(args, cwd) {
  if (process.env.npm_execpath) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
  }
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
    });
  }
  return spawnSync('npm', args, { cwd, encoding: 'utf8' });
}

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runAudit(args, cwd, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = runNpm(['audit', ...args, '--json'], cwd);
    try {
      if (result.error) throw new AuditConfigurationError(`${label} could not start: ${result.error.message}`);
      const audit = parseJsonOutput(result, label);
      if (
        audit.error ||
        typeof audit.vulnerabilities !== 'object' ||
        audit.vulnerabilities === null ||
        typeof audit.metadata?.vulnerabilities !== 'object'
      ) {
        throw new AuditConfigurationError(`${label} returned an incomplete registry response.`);
      }
      return audit;
    } catch (error) {
      lastError = error;
      if (attempt < 3) wait(attempt * 500);
    }
  }
  throw lastError;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new AuditConfigurationError(`${label} is unavailable or invalid: ${error.message}`);
  }
}

export function runAuditGate({
  project = process.cwd(),
  policyPath = 'config/dependency-audit-exceptions.json',
  now = new Date(),
} = {}) {
  const root = path.resolve(project);
  const policy = readJson(path.resolve(root, policyPath), 'Dependency audit policy');
  const packageJson = readJson(path.join(root, 'package.json'), 'package.json');
  const lockfile = readJson(path.join(root, 'package-lock.json'), 'package-lock.json');
  const productionAudit = runAudit(['--omit=dev'], root, 'Production dependency audit');
  const fullAudit = runAudit([], root, 'Full dependency audit');
  const npmLs = runNpm(['ls', '--all', '--json'], root);

  return validateAuditData({
    policy,
    productionAudit,
    fullAudit,
    packageJson,
    lockfile,
    npmLsValid: npmLs.status === 0,
    now,
  });
}

function parseArguments(argv) {
  const options = { project: process.cwd(), policyPath: 'config/dependency-audit-exceptions.json', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project') options.project = argv[++index];
    else if (argument === '--policy') options.policyPath = argv[++index];
    else if (argument === '--json') options.json = true;
    else throw new AuditConfigurationError(`Unknown argument: ${argument}`);
  }
  return options;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.ok) {
    console.log(
      `Dependency audit passed: production clean; ${result.propagatedWarningCount} development package warnings resolve to ${result.advisoryCount} reviewed advisories.`,
    );
    for (const group of result.groups) {
      console.log(`- ${group.advisoryId}: ${group.packages.join(', ')}`);
    }
  } else {
    console.error('Dependency audit failed:');
    for (const error of result.errors) console.error(`- ${error}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = runAuditGate(options);
    printResult(result, options.json);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`Dependency audit could not run: ${error.message}`);
    process.exitCode = error instanceof AuditConfigurationError ? 2 : 1;
  }
}
