# Changelog

## Unreleased - Operational maturity

- Added a canonical AI-maintainer handbook, documentation map, resolved-lessons registry, symptom-led troubleshooting, curated incident reports and ADR governance.
- Added a zero-dependency documentation gate that validates local links and anchors, canonical-source routing, lesson/incident/ADR contracts and independence from ignored evidence.
- Added permanent staging promotion controls, exact release metadata and deployment-artifact verification.
- Added configurable owner profiles with idempotent route migration, protected Unassigned handling and atomic reassignment.
- Added server-derived shared reminders, audited snooze/clear/complete/reschedule actions and a responsive reminder centre.
- Added opaque cursor pagination, server-derived route metrics, normalized prefix search and query-key migration.
- Added RSA-OAEP/AES-GCM Hostinger recovery archives with authenticated version-2 metadata, validated manifests, recoverable locking, whole-run deadlines and two-copy retention.
- Added a dependency-free Hostinger cron runner, non-printing 256-bit trigger generator and sanitized backup-freshness diagnostics.
- Added guarded, resumable restore into an explicit named temporary Firestore database and runtime support for isolated named-database verification.
- Hardened responsive evidence capture to wait for real workspaces, cover every primary page and breakpoint, run accessibility checks and fail on console, network or overflow defects.
- Fixed People table assistive text escaping its scroll container at tablet and mobile widths.
- Fixed populated-dashboard contrast and made horizontally scrollable metric summaries keyboard accessible.
- Added normalized identity integrity checks, focused owner/page/reminder API modules and expanded emulator/browser coverage.
- Fixed Companies search so it queries the complete paginated directory instead of only the records already loaded in the browser, with authoritative global metrics and loading feedback.
- Fixed People search and summary metrics so later-page records remain discoverable and totals stay workspace-wide.
- Fixed route stage menus so keyboard users can open both cluster and individual-path controls with Enter or Space.
- Hardened release promotion to require the exact successful staging push, verify the live staging and production assets, and derive health metadata from the clean deployment commit.

## 2.1.0 - 2026-07-10

- Added company-scoped target selection and linked-mutual filtering to route creation, with inline email, URL and date validation.
- Added recoverable bulk-action and stage-move failures, terminal outcome/archive confirmation, archive error handling and automatic 30-second Undo expiry.
- Split workspace pages into lazy-loaded production chunks, reducing the initial JavaScript payload and removing the oversized-chunk build warning.
- Enforced full automated WCAG AA color-contrast checks and corrected low-contrast login, card, tab, board, dashboard and process labels.
- Added permanent accessibility, visual-regression and workflow coverage, including terminal confirmation and error recovery.
- Removed stale agent-round files, prompt packs, duplicate evidence and generated browser/test debris from the repository root.

## 2.0.0 - 2026-07-02

- Rebuilt Northwind as React, Vite and TypeScript workspaces with a modular Fastify API.
- Added domain and repository boundaries, workspace scope, optimistic versions, journaled JSON transactions, backups and idempotent migration.
- Replaced raw password hashing with salted `scrypt`, hashed sessions, CSRF, strict cookies, scoped agent tokens, throttling and structured errors.
- Added deep-linked Companies, People, Routes, Dashboard, Process and Archived workspaces with premium responsive UI.
- Added audited route actions, undo, drag and keyboard stage movement, bulk scheduling, People linking/merge/archive and recovery workflows.
