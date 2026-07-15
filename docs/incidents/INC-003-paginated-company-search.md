# INC-003: Paginated directory search and global metrics

Date: 2026-07-12
Status: Resolved

## Impact

A valid company or person outside the first loaded page could appear to be missing from the CRM. Directory summary metrics could also describe the visible page rather than the whole workspace, reducing trust in search and reporting.

## Detection

A staging browser search for a deterministic company beyond the initial page failed to return it without loading more records. Code inspection showed that the Companies page filtered its local query result and derived summary values from that slice.

## Timeline

- A regression fixture was placed beyond the first unfiltered page.
- Companies search state moved to the workspace and began sending `q` to the paginated API.
- TanStack Query keys became query-specific, and loading feedback stopped stale all-company flashes.
- Company summary metrics moved to authenticated workspace-wide state.
- API tests rejected a cursor reused with another query, and browser tests proved the later-page company was discoverable directly.
- A later staging release audit reproduced the same class in People; People search and query keys were moved to the server-backed page endpoint, and its summary metrics were separated from visible rows.

## Root cause

Pagination was introduced at the repository/API boundary, but the Companies UI retained an older client-side filtering assumption. The same page-local data was incorrectly reused for global summary values.

## Resolution

Search the authoritative server dataset, scope cached pages by query, and derive global metrics independently from the rendered page.

## Guardrails

- API tests cover prefix search beyond the first page and filter-bound opaque cursors.
- Component tests use server-returned results absent from the initial page.
- Companies and People workspace metrics are supplied independently of paginated rows.
- Loading states are announced without rendering stale results.

## Verification

Run `npm run verify` and the Playwright smoke journey. Search for a deterministic record beyond page one without selecting Load more, then confirm summary values do not change merely by paging.

## References

- Commit `06f026f`
- [`apps/web/src/queries.test.tsx`](../../apps/web/src/queries.test.tsx)
- [`apps/web/src/pages/workspaces.test.tsx`](../../apps/web/src/pages/workspaces.test.tsx)
- [`apps/api/src/server.test.ts`](../../apps/api/src/server.test.ts)
- [`e2e/smoke.spec.ts`](../../e2e/smoke.spec.ts)
