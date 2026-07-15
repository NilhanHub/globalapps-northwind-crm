# Lessons learned

This append-only registry records resolved engineering problems that are likely to recur or mislead a future maintainer. Current limitations belong in [Known issues](./KNOWN_ISSUES.md), not here. Never renumber or reuse an ID; update `Last reviewed` when a guardrail is revalidated.

Each lesson must remain safe for a fresh clone: cite tracked code, tests, scripts or commits, and do not include credentials, key identifiers, production record counts or transient operational output.

## NW-LL-001

**Authoritative workspace code versus legacy compatibility files**

- **Area:** Architecture
- **Status:** Resolved
- **Observable symptom:** An agent starts changing the root static frontend or legacy server and cannot find the current React behavior, typed contracts or Firestore repository rules.
- **Root cause:** The repository retains the original root application for compatibility while the authoritative product moved into npm workspaces.
- **Resolution:** Treat `apps/` and `packages/` as the application source of truth. Keep `server.js`, root stores and legacy assets only as explicitly approved compatibility surfaces; the Hostinger entry loads the compiled workspace API.
- **Permanent regression protection:** Workspace boundaries are described in [Architecture](./ARCHITECTURE.md), while the root launch contract is asserted by [`tests/deployment-config.test.js`](../tests/deployment-config.test.js).
- **Read-only verification:** Run `git status --short`, inspect `package.json`, then inspect `apps/api`, `apps/web` and `packages/domain` before proposing a change.
- **References:** Commit `d8982ff`; [`app.js`](../app.js); [`apps/web/src/app-shell.test.tsx`](../apps/web/src/app-shell.test.tsx).
- **Last reviewed:** 2026-07-12

## NW-LL-002

**Search the server dataset, not only loaded browser pages**

- **Area:** Companies, People and pagination
- **Status:** Resolved
- **Observable symptom:** A company or person known to exist does not appear in search until additional pages have been loaded.
- **Root cause:** The browser filtered the records already in memory instead of sending the search term to the paginated API.
- **Resolution:** Companies and People queries send normalized `q` input to their paginated endpoints; query-specific cache keys keep one search from displaying another search's results.
- **Permanent regression protection:** Component, API and browser coverage proves that a server-returned result outside the initial page is discoverable and that a cursor cannot be reused with a different query.
- **Read-only verification:** Inspect the browser request for `/api/companies/page?limit=50&q=...` or `/api/people/page?limit=50&q=...`; do not infer search correctness from the visible first page.
- **References:** Commit `06f026f`; [`apps/web/src/queries.test.tsx`](../apps/web/src/queries.test.tsx); [`apps/api/src/server.test.ts`](../apps/api/src/server.test.ts); [`e2e/smoke.spec.ts`](../e2e/smoke.spec.ts).
- **Last reviewed:** 2026-07-15

## NW-LL-003

**Workspace metrics must not depend on the loaded page**

- **Area:** Pagination and reporting
- **Status:** Resolved
- **Observable symptom:** Active, awaiting-response or route totals change when the user loads another page or applies a client-side filter.
- **Root cause:** Metrics were derived from the current browser slice rather than the full workspace.
- **Resolution:** Route metrics are server-derived, and Companies and People workspace summary values come from authoritative workspace-wide state rather than the current paginated page.
- **Permanent regression protection:** Pagination endpoints and `/api/routes/metrics` are covered together in the modular API tests; workspace component tests supply totals independently of their visible rows.
- **Read-only verification:** Compare the authenticated `/api/routes/metrics` response with the UI summary while changing pages; a page change must not redefine the workspace total.
- **References:** Commits `8730221` and `06f026f`; [`apps/api/src/routes/pages.ts`](../apps/api/src/routes/pages.ts); [`apps/web/src/pages/workspaces.test.tsx`](../apps/web/src/pages/workspaces.test.tsx).
- **Last reviewed:** 2026-07-15

## NW-LL-004

**Route selectors must preserve company and relationship scope**

- **Area:** Relationship creation
- **Status:** Resolved
- **Observable symptom:** The route dialog offers a target from another company or a mutual contact that is not linked to the selected target.
- **Root cause:** The target and mutual selectors were populated from broad people collections without applying each preceding selection as a constraint.
- **Resolution:** Selecting a company limits targets to that company; selecting a target limits mutual contacts to that target's explicit relationship links.
- **Permanent regression protection:** The entity-dialog component test includes two companies and unrelated mutual paths and asserts that cross-company options never appear.
- **Read-only verification:** Open a route dialog in local or staging data and inspect each selector after changing company and target; do not create a route merely to test option scope.
- **References:** Commit `2254a22`; [`apps/web/src/components/entity-dialog.test.tsx`](../apps/web/src/components/entity-dialog.test.tsx).
- **Last reviewed:** 2026-07-12

## NW-LL-005

**Route movement and terminal outcomes need explicit recovery boundaries**

- **Area:** Route board
- **Status:** Resolved
- **Observable symptom:** Clicking a card begins a drag, a keyboard user cannot open a stage menu, a failed bulk mutation loses the selection, a stage appears changed after a failed save, or Won/Dead is recorded without deliberate confirmation.
- **Root cause:** Navigation, drag activation, optimistic state and destructive business outcomes shared insufficiently separated interaction paths.
- **Resolution:** Use a dedicated drag handle and overlay, make stage menus explicitly respond to Enter and Space, preserve selection on failed bulk writes, roll back failed optimistic movement, require a reason plus confirmation for terminal outcomes, and derive a five-minute Undo from the latest eligible activity so it survives refresh and expires accurately.
- **Permanent regression protection:** UI tests cover keyboard stage-menu activation, failed bulk selection and terminal confirmation; API tests require terminal reasons and prove auditable movement plus Undo.
- **Read-only verification:** Run the related component/API tests and inspect activity history after a reversible staging move; never test Won or Dead on production data.
- **References:** Commits `ff55c0b` and `2254a22`; [`apps/web/src/pages/routes-page.test.tsx`](../apps/web/src/pages/routes-page.test.tsx); [`apps/web/src/pages/workspaces.test.tsx`](../apps/web/src/pages/workspaces.test.tsx); [`apps/web/src/pages/route-detail-page.test.tsx`](../apps/web/src/pages/route-detail-page.test.tsx); [`tests/hardening-api.test.js`](../tests/hardening-api.test.js).
- **Last reviewed:** 2026-07-15

## NW-LL-006

**Visual quality gates must cover accessibility, overflow and payload shape**

- **Area:** Frontend quality
- **Status:** Resolved
- **Observable symptom:** Text contrast fails, controls clip at narrow widths, long content escapes a table or dialog, console errors appear only on one route, or the production build warns about an oversized initial chunk.
- **Root cause:** Spot checks at one viewport and route did not exercise the product's full responsive and accessibility surface; eagerly loaded workspaces inflated the initial bundle.
- **Resolution:** Add route-level lazy loading, repeatable breakpoint checks, Axe coverage, console and failed-request capture, overflow detection, visual snapshots and focused CSS contrast assertions.
- **Permanent regression protection:** Playwright exercises every primary workspace and the release breakpoint matrix; the capture script fails on console errors, failed responses, overflow or accessibility violations.
- **Read-only verification:** Run `npm run build` and `npm run test:e2e`, then inspect build chunk output and Playwright results rather than relying on a single screenshot.
- **References:** Commits `2254a22`, `13f1c3e` and `ce42e14`; [`scripts/capture-evidence.ts`](../scripts/capture-evidence.ts); [`e2e/accessibility.spec.ts`](../e2e/accessibility.spec.ts); [`apps/web/src/styles.accessibility.test.ts`](../apps/web/src/styles.accessibility.test.ts).
- **Last reviewed:** 2026-07-12

## NW-LL-007

**Verify current Firestore data instead of comparing it with historical seeds**

- **Area:** Data integrity and recovery
- **Status:** Resolved
- **Observable symptom:** A production verification fails because a live record differs from an old JSON seed even though the change is legitimate.
- **Root cause:** A one-time JSON-to-Firestore migration comparison was being treated as a continuing production-integrity check.
- **Resolution:** Keep migration commands migration-only. Routine checks audit current Firestore references, identities, versions and duplicates, then create a canonical export with IDs and hashes that can be independently verified.
- **Permanent regression protection:** Domain tests inject broken references and duplicates; current-data scripts fail when integrity or export validation fails.
- **Read-only verification:** Run `npm run data:integrity`, followed by `npm run data:verify-export -- <export-directory>` for an already created export. Do not run a migration command as a health check.
- **References:** Commit `ec79104`; [`scripts/data-integrity.ts`](../scripts/data-integrity.ts); [`scripts/export-firestore.ts`](../scripts/export-firestore.ts); [`scripts/verify-export.ts`](../scripts/verify-export.ts); [`packages/domain/src/domain.test.ts`](../packages/domain/src/domain.test.ts).
- **Last reviewed:** 2026-07-12

## NW-LL-008

**Research imports require deterministic identity and provenance**

- **Area:** Research import
- **Status:** Resolved
- **Observable symptom:** Re-importing the same email creates duplicate companies, people, routes or contact activities, or historical notes incorrectly advance the sales stage.
- **Root cause:** Unstructured inputs lacked stable source identity, normalized entity matching and a resumable job boundary.
- **Resolution:** Derive source hashes and deterministic identities, preview before commit, persist import jobs, transact only affected records, and record imported contact history without silently moving the route.
- **Permanent regression protection:** Service and API tests prove deterministic preview, interruption-safe changes and a second identical import with no unnecessary writes.
- **Read-only verification:** Use the import preview and inspect creates, updates, conflicts and omissions before applying; re-previewing the same source should be unchanged.
- **References:** Commit `ec79104`; [`apps/api/src/services/research-import.test.ts`](../apps/api/src/services/research-import.test.ts); [`apps/api/src/server.test.ts`](../apps/api/src/server.test.ts); [ADR 0004](./adr/0004-import-identity.md).
- **Last reviewed:** 2026-07-12

## NW-LL-009

**Firestore quota failures must use one recoverable API contract**

- **Area:** Cloud persistence
- **Status:** Resolved
- **Observable symptom:** Some Firestore quota or availability failures surface as generic server errors while session operations report something different.
- **Root cause:** Firestore SDK error classification was not shared consistently by record and session repository adapters.
- **Resolution:** Map recognized Firestore resource-exhaustion and unavailability failures to `503 FIRESTORE_UNAVAILABLE` with a sanitized message that states no change was saved; do not classify unrelated numeric errors as Firestore outages.
- **Permanent regression protection:** Repository and session-repository tests cover quota mapping, and health tests refuse to claim readiness when the repository is unavailable.
- **Read-only verification:** Inspect `/api/health` and sanitized application logs; never trigger writes merely to reproduce a suspected quota incident.
- **References:** Commit `91fb28c`; [`apps/api/src/repositories/firestore-repository.test.ts`](../apps/api/src/repositories/firestore-repository.test.ts); [`apps/api/src/repositories/firestore-session-repository.test.ts`](../apps/api/src/repositories/firestore-session-repository.test.ts); [`apps/api/src/server.test.ts`](../apps/api/src/server.test.ts).
- **Last reviewed:** 2026-07-12

## NW-LL-010

**Managed Hostinger deployment needs an explicit monorepo entry and build contract**

- **Area:** Hosting
- **Status:** Resolved
- **Observable symptom:** The domain shows Hostinger's placeholder, the Node app cannot find the compiled API, or the install/start sequence builds the wrong workspace.
- **Root cause:** Hostinger's managed Node defaults did not understand the monorepo's workspace build and legacy-compatible launch boundaries.
- **Resolution:** Use root `app.js` to import the compiled API, build workspaces behind the Hostinger-only install flag, verify artifacts before activation, run on Node 22, and use hosting-safe encoded password configuration.
- **Permanent regression protection:** The deployment configuration test asserts the launch entry, conditional build and required artifacts.
- **Read-only verification:** Inspect the configured entry file, Node version and deployment log; confirm the compiled API and web assets exist before restarting anything.
- **References:** Commits `0e8ec14`, `7b81b5c`, `8e5fa9d` and `9ee328c`; [`tests/deployment-config.test.js`](../tests/deployment-config.test.js); [`scripts/verify-build-artifacts.mjs`](../scripts/verify-build-artifacts.mjs).
- **Last reviewed:** 2026-07-12

## NW-LL-011

**Release identity must be embedded and build drift narrowly classified**

- **Area:** Release engineering
- **Status:** Resolved
- **Observable symptom:** A staging build has no trustworthy commit identity, or a clean Hostinger deployment is rejected as dirty solely because the managed installer normalized the lockfile.
- **Root cause:** Hostinger deploys tracked Git content and omitted an untracked release sidecar; its managed install also changes `package-lock.json` before the build.
- **Resolution:** Derive release metadata from Git, embed it into the API bundle, fail closed in production without valid clean metadata, and tolerate only the observed `package-lock.json` normalization. Any other tracked drift remains fatal.
- **Permanent regression protection:** Artifact verification finds the expected SHA in the compiled API; release tests reject dirty metadata and deployment tests reject every unexpected changed path.
- **Read-only verification:** Compare the full expected Git SHA with `/api/health`, then use `git status --short` and `git diff --name-only` to classify local drift without changing files.
- **References:** Commits `5833e0b`, `e23e78e` and `3bbedf5`; [`apps/api/src/release-metadata.test.ts`](../apps/api/src/release-metadata.test.ts); [`scripts/release-build-state.mjs`](../scripts/release-build-state.mjs); [`scripts/verify-build-artifacts.mjs`](../scripts/verify-build-artifacts.mjs).
- **Last reviewed:** 2026-07-12

## NW-LL-012

**Production must receive the exact staging-approved SHA**

- **Area:** Release promotion
- **Status:** Resolved
- **Observable symptom:** A release can be promoted after staging verification even though a branch moved between validation and push, or production serves a different commit from the approved staging build.
- **Root cause:** Separate validation and promotion steps leave a time-of-check/time-of-use gap unless branch heads and the final push are constrained together.
- **Resolution:** Require the requested SHA to equal the current staging head with successful `secrets`, `verify` and `staging-live` jobs; re-fetch both heads immediately before an atomic, lease-protected fast-forward and verify production serves the same SHA.
- **Permanent regression protection:** The checked promotion workflow contains exact-run lookup, ancestry checks, atomic push and force-with-lease assertions covered by the deployment test.
- **Read-only verification:** Inspect the staging CI run and compare `origin/main`, `origin/staging` and the health-reported SHA. Stop if any value differs.
- **References:** Commit `06f026f`; [promotion workflow](../.github/workflows/promote-production.yml); [CI workflow](../.github/workflows/ci.yml); [`tests/deployment-config.test.js`](../tests/deployment-config.test.js); [ADR 0006](./adr/0006-exact-sha-release-promotion.md).
- **Last reviewed:** 2026-07-12

## NW-LL-013

**Backup publication and restore are separate fail-closed operations**

- **Area:** Backup and recovery
- **Status:** Resolved
- **Observable symptom:** Concurrent backup triggers race, a live workspace changes while stores are read, an old lock blocks future backups, cron cannot find Node, a failed run displaces a valid copy, or restore tooling can target production too easily.
- **Root cause:** A reliable encrypted archive spans filesystem locking, a consistent multi-store snapshot, cryptography, retention, hosting runtime discovery and a separate database restore boundary.
- **Resolution:** Use a dedicated trigger, exclusive recoverable lock, whole-run deadline, revision-before/after snapshot with one retry, validated authenticated encryption, temporary-file publication plus atomic rename, post-success retention, an explicit Hostinger Node 22 path and restore only to a confirmed non-default temporary Firestore database.
- **Permanent regression protection:** Tests cover token shape, concurrent and stale locks, changed revisions, deadlines, corruption, authenticated metadata, retention, fixed cron mappings, safe targets, resumability and restore conflicts.
- **Read-only verification:** Run `npm run backup:hostinger:status` and `npm run backup:verify -- <archive>`; use `npm run backup:restore:validate -- <archive>` only with the temporary private-key file supplied from the password manager. None of these commands writes to Firestore.
- **References:** Commits `8730221`, `ac17e62`, `ce42e14` and `f320f30`; [`apps/api/src/services/hostinger-backup.test.ts`](../apps/api/src/services/hostinger-backup.test.ts); [`apps/api/src/services/firestore-backup-restore.test.ts`](../apps/api/src/services/firestore-backup-restore.test.ts); [`apps/api/src/hostinger-backup-cron.test.ts`](../apps/api/src/hostinger-backup-cron.test.ts); [ADR 0007](./adr/0007-encrypted-hostinger-recovery.md).
- **Last reviewed:** 2026-07-12

## NW-LL-014

**Security exceptions must be narrow, attributable and time-bounded**

- **Area:** Supply chain and secret scanning
- **Status:** Resolved
- **Observable symptom:** A full-history secret scan blocks on a non-secret historical identifier, or a forced dependency remediation would downgrade and destabilize development tooling.
- **Root cause:** Automated scanners intentionally trade context for coverage, while transitive development advisories may not yet have a compatible upstream fix.
- **Resolution:** Allow only a fingerprint-specific false-positive entry, retain full-history scanning everywhere else, keep production dependencies at zero known vulnerabilities, and record development-only exceptions with scope, controls and a review date. Never use `npm audit fix --force` as a shortcut.
- **Permanent regression protection:** CI performs full-history secret scanning and separate production/full-tree audits; [Dependency exceptions](./DEPENDENCY_EXCEPTIONS.md) requires periodic review.
- **Read-only verification:** Run the repository's secret scan and both `npm audit --omit=dev` and `npm audit`; inspect any finding before proposing an exception.
- **References:** Commit `06f026f`; [CI workflow](../.github/workflows/ci.yml); [`.gitleaksignore`](../.gitleaksignore); [Dependency exceptions](./DEPENDENCY_EXCEPTIONS.md).
- **Last reviewed:** 2026-07-12

## NW-LL-015

**A Git UI change count can reflect stale comparison refs, not a dirty worktree**

- **Area:** Local Git operations
- **Status:** Resolved
- **Observable symptom:** The desktop UI reports hundreds of additions or deletions while `git status` reports no modified, staged or untracked files.
- **Root cause:** The UI compared the current branch with a stale locally cached remote reference rather than reporting uncommitted work.
- **Resolution:** Separate worktree state from branch divergence. Refresh remote references, then compare local and remote SHAs and left/right commit counts before interpreting the UI badge.
- **Permanent regression protection:** Use the read-only Git checks below whenever the UI and command line disagree; no application-code change is appropriate for stale local metadata.
- **Read-only verification:** Run `git fetch --prune`, `git status --short`, `git rev-parse HEAD`, `git rev-parse origin/staging` and `git rev-list --left-right --count origin/main...staging`.
- **References:** Operational Git state only; there is intentionally no application commit or test for a stale local remote-tracking reference.
- **Last reviewed:** 2026-07-12

## NW-LL-016

**Firebase emulator tests must not inherit the workstation's complete environment**

- **Area:** Development security and test reliability
- **Status:** Resolved
- **Observable symptom:** Firestore emulator tests pass, but Firebase CLI exits after an analytics timeout; its retained debug log also contains every inherited environment variable, including unrelated secret-bearing values.
- **Root cause:** `firebase emulators:exec` forwards its complete environment to the test command and writes that environment at debug level. A user-level Firebase analytics preference can also introduce a five-second shutdown dependency.
- **Resolution:** Launch the local Firebase CLI through a repository wrapper that passes only an explicit non-secret environment allowlist, uses an isolated temporary Firebase config directory with telemetry disabled, and removes generated emulator logs after every run.
- **Permanent regression protection:** Unit tests inject representative credential variables and prove they are excluded, while the release gate runs the real Firestore emulator through the wrapper.
- **Read-only verification:** Run `npm run test:firestore-emulator`, confirm it exits successfully, and confirm no `firebase-debug*.log` or `firestore-debug.log` remains in the project root.
- **References:** [`scripts/run-firestore-emulator-tests.mjs`](../scripts/run-firestore-emulator-tests.mjs); [`tests/firestore-emulator-runner.test.js`](../tests/firestore-emulator-runner.test.js); [`package.json`](../package.json).
- **Last reviewed:** 2026-07-14
