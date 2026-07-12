import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkDocumentation } from '../scripts/docs-check.mjs';

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}

function lesson(id = 'NW-LL-001') {
  return `## ${id}\n\n**Title**\n\n- **Area:** Test\n- **Status:** Resolved\n- **Observable symptom:** Symptom\n- **Root cause:** Cause\n- **Resolution:** Fix\n- **Permanent regression protection:** Test\n- **Read-only verification:** Inspect\n- **References:** File\n- **Last reviewed:** 2026-07-12\n`;
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'northwind-docs-check-'));
  await put(
    root,
    'README.md',
    '# Root\n\n[Docs](docs/README.md) [Known](docs/KNOWN_ISSUES.md) [Deps](docs/DEPENDENCY_EXCEPTIONS.md)\n',
  );
  await put(root, 'AGENTS.md', '# Agents\n\n[Docs](docs/README.md)\n');
  await put(root, 'HOSTINGER_DEPLOYMENT.md', '# Pointer\n\n[Canonical](docs/HOSTINGER_DEPLOYMENT.md)\n');
  await put(
    root,
    'docs/README.md',
    '# Docs\n\n[Known](KNOWN_ISSUES.md) [Deps](DEPENDENCY_EXCEPTIONS.md) [Host](HOSTINGER_DEPLOYMENT.md)\n',
  );
  await put(root, 'docs/HOSTINGER_DEPLOYMENT.md', '# Hostinger deployment runbook\n');
  await put(root, 'docs/KNOWN_ISSUES.md', '# Known issues\n');
  await put(root, 'docs/DEPENDENCY_EXCEPTIONS.md', '# Dependency exceptions\n');
  await put(root, 'docs/LESSONS_LEARNED.md', `# Lessons\n\n${lesson()}`);
  await put(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n');
  await put(root, 'docs/incidents/README.md', '# Incidents\n');
  await put(
    root,
    'docs/incidents/INC-001-test.md',
    '# INC-001: Test\n\nDate: 2026-07-12\nStatus: Resolved\n\n## Impact\n\n## Detection\n\n## Timeline\n\n## Root cause\n\n## Resolution\n\n## Guardrails\n\n## Verification\n\n## References\n',
  );
  await put(root, 'docs/adr/README.md', '# ADRs\n');
  await put(
    root,
    'docs/adr/0001-test.md',
    '# ADR 0001: Test\n\n## Status\n\n## Context\n\n## Decision\n\n## Consequences\n\n## Verification\n\n## References\n',
  );
  return root;
}

async function withFixture(run) {
  const root = await fixture();
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('documentation checker accepts the canonical fixture and valid anchor', async () => {
  await withFixture(async (root) => {
    await put(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n[Known](KNOWN_ISSUES.md#known-issues)\n');
    assert.deepEqual(checkDocumentation(root).errors, []);
  });
});

test('documentation checker rejects broken links and anchors', async () => {
  await withFixture(async (root) => {
    await put(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n[Missing](missing.md) [Anchor](KNOWN_ISSUES.md#absent)\n');
    const errors = checkDocumentation(root).errors.join('\n');
    assert.match(errors, /broken local link/);
    assert.match(errors, /missing Markdown anchor/);
  });
});

test('documentation checker rejects links into ignored Evidence', async () => {
  await withFixture(async (root) => {
    await put(root, 'docs/TROUBLESHOOTING.md', '# Troubleshooting\n\n[Transient](../Evidence/report.md)\n');
    assert.match(checkDocumentation(root).errors.join('\n'), /must not link into ignored Evidence/);
  });
});

test('documentation checker rejects duplicate lesson IDs', async () => {
  await withFixture(async (root) => {
    await put(root, 'docs/LESSONS_LEARNED.md', `# Lessons\n\n${lesson()}\n${lesson()}`);
    assert.match(checkDocumentation(root).errors.join('\n'), /duplicate lesson ID NW-LL-001/);
  });
});

test('documentation checker rejects a lesson with missing required fields', async () => {
  await withFixture(async (root) => {
    await put(root, 'docs/LESSONS_LEARNED.md', `# Lessons\n\n${lesson().replace('- **Root cause:** Cause\n', '')}`);
    assert.match(checkDocumentation(root).errors.join('\n'), /NW-LL-001 is missing Root cause/);
  });
});

test('documentation checker rejects a second canonical Hostinger runbook', async () => {
  await withFixture(async (root) => {
    await put(root, 'duplicate.md', '# Hostinger deployment runbook\n');
    assert.match(checkDocumentation(root).errors.join('\n'), /Exactly one canonical Hostinger runbook/);
  });
});

test('documentation checker rejects missing incident and ADR sections', async () => {
  await withFixture(async (root) => {
    await put(
      root,
      'docs/incidents/INC-001-test.md',
      '# INC-001: Test\n\nDate: 2026-07-12\nStatus: Resolved\n\n## Impact\n\n## Detection\n\n## Timeline\n\n## Root cause\n\n## Resolution\n\n## Guardrails\n\n## References\n',
    );
    await put(
      root,
      'docs/adr/0001-test.md',
      '# ADR 0001: Test\n\n## Status\n\n## Context\n\n## Decision\n\n## Consequences\n\n## References\n',
    );
    const errors = checkDocumentation(root).errors.join('\n');
    assert.match(errors, /INC-001-test\.md: missing ## Verification/);
    assert.match(errors, /0001-test\.md: missing ## Verification/);
  });
});
