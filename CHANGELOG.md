# Changelog

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
