export type ApiContract = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  operationId: string;
  summary: string;
  authenticated: boolean;
  csrf: boolean;
};

export const apiContracts = [
  ['GET', '/api/live', 'getLiveness', 'Check process liveness', false, false],
  ['GET', '/api/ready', 'getReadiness', 'Check repository readiness', false, false],
  ['GET', '/api/health', 'getHealth', 'Read release and readiness metadata', false, false],
  ['GET', '/api/auth/session', 'getSession', 'Read the current browser session', true, false],
  ['POST', '/api/auth/login', 'login', 'Create a browser session', false, false],
  ['POST', '/api/auth/logout', 'logout', 'Revoke the current session', true, true],
  ['GET', '/api/bootstrap', 'getBootstrap', 'Load initial workspace data', true, false],
  ['GET', '/api/workspace/revision', 'getWorkspaceRevision', 'Read lightweight workspace revision', true, false],
  ['GET', '/api/diagnostics', 'getDiagnostics', 'Read sanitized operational diagnostics', true, false],
  ['GET', '/api/companies', 'listCompanies', 'List companies', true, false],
  ['POST', '/api/companies', 'createCompany', 'Create a company', true, true],
  ['PATCH', '/api/companies/{id}', 'updateCompany', 'Update or transactionally rename a company', true, true],
  ['POST', '/api/companies/{id}/archive', 'archiveCompany', 'Archive a company cascade', true, true],
  ['POST', '/api/companies/{id}/restore', 'restoreCompany', 'Restore a company cascade', true, true],
  ['DELETE', '/api/companies/{id}', 'deleteCompany', 'Permanently delete an eligible archived company', true, true],
  ['GET', '/api/people', 'listPeople', 'List people with relationship metrics', true, false],
  ['POST', '/api/people', 'createPerson', 'Create a person', true, true],
  ['PATCH', '/api/people/{id}', 'updatePerson', 'Update a person and mutual links', true, true],
  ['POST', '/api/people/{id}/archive', 'archivePerson', 'Archive a person cascade', true, true],
  ['POST', '/api/people/{id}/restore', 'restorePerson', 'Restore a person cascade', true, true],
  ['POST', '/api/people/merge', 'mergePeople', 'Merge duplicate people', true, true],
  ['DELETE', '/api/people/{id}', 'deletePerson', 'Permanently delete an eligible archived person', true, true],
  ['GET', '/api/routes', 'listRoutes', 'List relationship paths', true, false],
  ['POST', '/api/routes', 'createRoute', 'Create a relationship path', true, true],
  ['PATCH', '/api/routes/{id}', 'updateRoute', 'Update non-stage route fields', true, true],
  ['POST', '/api/routes/{id}/actions', 'performRouteAction', 'Perform an audited route action', true, true],
  [
    'POST',
    '/api/routes/{id}/actions/{activityId}/undo',
    'undoRouteAction',
    'Undo the latest reversible action',
    true,
    true,
  ],
  ['POST', '/api/routes/bulk/actions', 'bulkRouteAction', 'Assign, schedule or reset routes atomically', true, true],
  ['POST', '/api/routes/{id}/archive', 'archiveRoute', 'Archive a route', true, true],
  ['POST', '/api/routes/{id}/restore', 'restoreRoute', 'Restore a route', true, true],
  ['DELETE', '/api/routes/{id}', 'deleteRoute', 'Permanently delete an eligible archived route', true, true],
  ['GET', '/api/activities', 'listActivities', 'List append-only activity', true, false],
  ['POST', '/api/activities', 'createActivity', 'Append company or route activity', true, true],
  ['POST', '/api/imports/research/preview', 'previewResearchImport', 'Dry-run research import', true, true],
  ['POST', '/api/imports/research', 'commitResearchImport', 'Commit resumable research import', true, true],
  ['GET', '/api/imports/{id}', 'getImportJob', 'Read import progress and results', true, false],
  ['POST', '/api/imports/{id}/resume', 'resumeImportJob', 'Resume an interrupted import', true, true],
].map(([method, path, operationId, summary, authenticated, csrf]) => ({
  method,
  path,
  operationId,
  summary,
  authenticated,
  csrf,
})) as ApiContract[];

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const contract of apiContracts) {
    const entry = paths[contract.path] ?? {};
    entry[contract.method.toLowerCase()] = {
      operationId: contract.operationId,
      summary: contract.summary,
      security: contract.authenticated ? [{ sessionCookie: [] }, { bearerAuth: [] }] : [],
      responses: {
        '200': { description: 'Successful response' },
        '400': { description: 'Validation error' },
        '401': { description: 'Authentication required' },
        '409': { description: 'Conflict' },
      },
      ...(contract.csrf
        ? { parameters: [{ in: 'header', name: 'X-CSRF-Token', required: false, schema: { type: 'string' } }] }
        : {}),
    };
    paths[contract.path] = entry;
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Northwind CRM API', version: '2.1.0' },
    paths,
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'northwind_session' },
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}
