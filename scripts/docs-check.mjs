import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const LESSON_FIELDS = [
  'Area',
  'Status',
  'Observable symptom',
  'Root cause',
  'Resolution',
  'Permanent regression protection',
  'Read-only verification',
  'References',
  'Last reviewed',
];

const INCIDENT_SECTIONS = [
  'Impact',
  'Detection',
  'Timeline',
  'Root cause',
  'Resolution',
  'Guardrails',
  'Verification',
  'References',
];

const ADR_SECTIONS = ['Status', 'Context', 'Decision', 'Consequences', 'Verification', 'References'];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function walkMarkdown(directory, root, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'Evidence', 'playwright-report', 'test-results'].includes(entry.name)) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(absolute, root, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      output.push(toPosix(path.relative(root, absolute)));
    }
  }
}

export function collectMarkdownFiles(root) {
  const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.md'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (git.status === 0) {
    return [...new Set(git.stdout.split(/\r?\n/).filter((file) => file.toLowerCase().endsWith('.md')))].sort();
  }

  const files = [];
  walkMarkdown(root, root, files);
  return files.sort();
}

function withoutFencedCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, '');
}

function githubSlug(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function headingAnchors(markdown) {
  const counts = new Map();
  const anchors = new Set();
  const source = withoutFencedCode(markdown);
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const base = githubSlug(match[1]);
    const count = counts.get(base) ?? 0;
    anchors.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  return anchors;
}

function extractLinks(markdown) {
  const links = [];
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) {
    links.push(match[1]);
  }
  for (const match of markdown.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)) {
    links.push(match[1]);
  }
  return links.map((link) => (link.startsWith('<') && link.endsWith('>') ? link.slice(1, -1) : link));
}

function isExternalLink(link) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link);
}

function hasHeading(markdown, level, heading) {
  return new RegExp(`^#{${level}}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(markdown);
}

function requireFile(files, relative, errors) {
  if (!files.has(relative)) {
    errors.push(`Missing required documentation file: ${relative}`);
    return false;
  }
  return true;
}

function validateLinks(root, documents, errors) {
  let linkCount = 0;
  for (const [relative, markdown] of documents) {
    for (const rawLink of extractLinks(withoutFencedCode(markdown))) {
      if (isExternalLink(rawLink)) continue;
      linkCount += 1;

      const [rawTarget, fragment = ''] = rawLink.split('#', 2);
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(rawTarget);
      } catch {
        errors.push(`${relative}: link is not valid URI encoding: ${rawLink}`);
        continue;
      }

      const targetAbsolute = rawTarget
        ? path.resolve(root, path.dirname(relative), decodedTarget)
        : path.resolve(root, relative);
      const targetRelative = toPosix(path.relative(root, targetAbsolute));

      if (targetRelative === 'Evidence' || targetRelative.startsWith('Evidence/')) {
        errors.push(`${relative}: permanent documentation must not link into ignored Evidence/: ${rawLink}`);
        continue;
      }
      if (targetRelative.startsWith('../') || path.isAbsolute(targetRelative)) {
        errors.push(`${relative}: local link escapes the repository: ${rawLink}`);
        continue;
      }
      if (!existsSync(targetAbsolute)) {
        errors.push(`${relative}: broken local link: ${rawLink}`);
        continue;
      }
      if (fragment && statSync(targetAbsolute).isFile() && path.extname(targetAbsolute).toLowerCase() === '.md') {
        const targetMarkdown = readFileSync(targetAbsolute, 'utf8');
        if (!headingAnchors(targetMarkdown).has(fragment.toLowerCase())) {
          errors.push(`${relative}: missing Markdown anchor #${fragment} in ${targetRelative}`);
        }
      }
    }
  }
  return linkCount;
}

function validateEntrypoints(documents, errors) {
  const required = [
    'README.md',
    'AGENTS.md',
    'HOSTINGER_DEPLOYMENT.md',
    'docs/README.md',
    'docs/HOSTINGER_DEPLOYMENT.md',
    'docs/KNOWN_ISSUES.md',
    'docs/DEPENDENCY_EXCEPTIONS.md',
    'docs/LESSONS_LEARNED.md',
    'docs/TROUBLESHOOTING.md',
    'docs/incidents/README.md',
    'docs/adr/README.md',
  ];
  for (const relative of required) requireFile(documents, relative, errors);
  if (errors.some((error) => error.startsWith('Missing required documentation file:'))) return;

  for (const entrypoint of ['README.md', 'AGENTS.md']) {
    if (!documents.get(entrypoint).includes('docs/README.md')) {
      errors.push(`${entrypoint}: must link to docs/README.md`);
    }
  }
  for (const entrypoint of ['README.md', 'docs/README.md']) {
    const content = documents.get(entrypoint);
    if (!content.includes('KNOWN_ISSUES.md')) errors.push(`${entrypoint}: must link to KNOWN_ISSUES.md`);
    if (!content.includes('DEPENDENCY_EXCEPTIONS.md')) {
      errors.push(`${entrypoint}: must link to DEPENDENCY_EXCEPTIONS.md`);
    }
  }

  const canonical = [...documents.entries()].filter(([, content]) =>
    /^# Hostinger deployment runbook\s*$/m.test(content),
  );
  if (canonical.length !== 1 || canonical[0]?.[0] !== 'docs/HOSTINGER_DEPLOYMENT.md') {
    errors.push(
      `Exactly one canonical Hostinger runbook is required at docs/HOSTINGER_DEPLOYMENT.md; found: ${canonical.map(([file]) => file).join(', ') || 'none'}`,
    );
  }
  if (!documents.get('HOSTINGER_DEPLOYMENT.md').includes('docs/HOSTINGER_DEPLOYMENT.md')) {
    errors.push('HOSTINGER_DEPLOYMENT.md: root compatibility pointer must link to the canonical runbook');
  }
}

function validateLessons(documents, errors) {
  const relative = 'docs/LESSONS_LEARNED.md';
  const markdown = documents.get(relative);
  if (!markdown) return 0;

  const matches = [...markdown.matchAll(/^##\s+(NW-LL-\d{3})\s*$/gm)];
  const ids = new Set();
  for (let index = 0; index < matches.length; index += 1) {
    const id = matches[index][1];
    if (ids.has(id)) errors.push(`${relative}: duplicate lesson ID ${id}`);
    ids.add(id);
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end);
    for (const field of LESSON_FIELDS) {
      if (!section.includes(`- **${field}:**`)) errors.push(`${relative}: ${id} is missing ${field}`);
    }
    if (!/- \*\*Status:\*\*\s+Resolved\b/.test(section)) {
      errors.push(`${relative}: ${id} status must be Resolved`);
    }
  }
  if (matches.length === 0) errors.push(`${relative}: at least one NW-LL-### lesson is required`);
  return matches.length;
}

function validateIncidents(documents, errors) {
  const incidentFiles = [...documents.keys()].filter((file) => /^docs\/incidents\/INC-\d{3}-.*\.md$/.test(file));
  const ids = new Set();
  for (const relative of incidentFiles) {
    const markdown = documents.get(relative);
    const heading = markdown.match(/^#\s+(INC-\d{3}):\s+.+$/m);
    if (!heading) {
      errors.push(`${relative}: missing '# INC-###: Title' heading`);
      continue;
    }
    const id = heading[1];
    if (!path.basename(relative).startsWith(id)) errors.push(`${relative}: filename and heading ID differ`);
    if (ids.has(id)) errors.push(`${relative}: duplicate incident ID ${id}`);
    ids.add(id);
    if (!/^Date:\s+\S+/m.test(markdown)) errors.push(`${relative}: missing Date metadata`);
    if (!/^Status:\s+(?:Resolved|Monitoring|Open)\s*$/m.test(markdown)) {
      errors.push(`${relative}: missing or invalid Status metadata`);
    }
    for (const section of INCIDENT_SECTIONS) {
      if (!hasHeading(markdown, 2, section)) errors.push(`${relative}: missing ## ${section}`);
    }
  }
  if (incidentFiles.length === 0) errors.push('docs/incidents: at least one INC-### report is required');
  return incidentFiles.length;
}

function validateAdrs(documents, errors) {
  const adrFiles = [...documents.keys()].filter((file) => /^docs\/adr\/\d{4}-.*\.md$/.test(file));
  const ids = new Set();
  for (const relative of adrFiles) {
    const markdown = documents.get(relative);
    const heading = markdown.match(/^#\s+ADR\s+(\d{4}):\s+.+$/m);
    if (!heading) {
      errors.push(`${relative}: missing '# ADR NNNN: Title' heading`);
      continue;
    }
    const id = heading[1];
    if (!path.basename(relative).startsWith(`${id}-`)) errors.push(`${relative}: filename and ADR number differ`);
    if (ids.has(id)) errors.push(`${relative}: duplicate ADR number ${id}`);
    ids.add(id);
    for (const section of ADR_SECTIONS) {
      if (!hasHeading(markdown, 2, section)) errors.push(`${relative}: missing ## ${section}`);
    }
  }
  if (adrFiles.length === 0) errors.push('docs/adr: at least one numbered ADR is required');
  return adrFiles.length;
}

export function checkDocumentation(root, options = {}) {
  const absoluteRoot = path.resolve(root);
  const files = options.files ?? collectMarkdownFiles(absoluteRoot);
  const documents = new Map(
    files.map((relative) => [toPosix(relative), readFileSync(path.resolve(absoluteRoot, relative), 'utf8')]),
  );
  const errors = [];
  const linkCount = validateLinks(absoluteRoot, documents, errors);
  validateEntrypoints(documents, errors);
  const lessons = validateLessons(documents, errors);
  const incidents = validateIncidents(documents, errors);
  const adrs = validateAdrs(documents, errors);
  return { errors, stats: { files: documents.size, links: linkCount, lessons, incidents, adrs } };
}

function runCli() {
  const root = process.cwd();
  const result = checkDocumentation(root);
  if (result.errors.length > 0) {
    process.stderr.write(`Documentation check failed with ${result.errors.length} error(s):\n`);
    for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    process.exitCode = 1;
    return;
  }
  const { files, links, lessons, incidents, adrs } = result.stats;
  process.stdout.write(
    `Documentation check passed: ${files} Markdown files, ${links} local links, ${lessons} lessons, ${incidents} incidents, ${adrs} ADRs.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCli();
