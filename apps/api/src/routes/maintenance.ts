import type { FastifyInstance } from 'fastify';
import type { CrmRepository } from '../repositories/repository.js';
import { createOpenApiDocument } from '@northwind/api-client';

export type ReleaseMetadata = {
  version: string;
  commitSha: string;
  buildTime: string;
  repositoryType: 'json' | 'firestore';
};

export function registerMaintenanceRoutes(
  app: FastifyInstance,
  options: { repository: CrmRepository; release?: ReleaseMetadata },
) {
  const ready = async () => {
    await options.repository.healthCheck();
    return {
      status: 'ok',
      readiness: 'ready',
      service: 'northwind-api',
      repository: 'available',
      time: new Date().toISOString(),
      version: options.release?.version ?? 'development',
      commitSha: options.release?.commitSha ?? 'unknown',
      buildTime: options.release?.buildTime ?? 'unknown',
      repositoryType: options.release?.repositoryType ?? 'unknown',
    };
  };
  app.get('/api/live', async () => ({ status: 'ok', liveness: 'alive', time: new Date().toISOString() }));
  app.get('/api/ready', ready);
  app.get('/api/health', ready);
  app.get('/api/workspace/revision', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    return { workspaceId, ...(await options.repository.getWorkspaceRevision(workspaceId)) };
  });
  app.get('/api/diagnostics', async (request) => {
    const workspaceId = request.requestContext!.workspaceId;
    const started = performance.now();
    await options.repository.healthCheck();
    const [companies, people, routes, activities, importJobs, revision] = await Promise.all([
      options.repository.list('companies', workspaceId),
      options.repository.list('people', workspaceId),
      options.repository.list('routes', workspaceId),
      options.repository.list('activities', workspaceId),
      options.repository.list('importJobs', workspaceId),
      options.repository.getWorkspaceRevision(workspaceId),
    ]);
    return {
      status: 'ok',
      workspaceId,
      revision,
      release: options.release ?? null,
      repositoryLatencyMs: Math.round((performance.now() - started) * 100) / 100,
      counts: {
        companies: companies.length,
        people: people.length,
        routes: routes.length,
        activities: activities.length,
        importJobs: importJobs.length,
      },
      configuration: {
        repository: options.release?.repositoryType ?? 'unknown',
        cloudOwnerPolicy: 'nilhan.dev@gmail.com',
        secrets: 'redacted',
      },
    };
  });
  app.get('/api/openapi.json', async () => createOpenApiDocument());
}
