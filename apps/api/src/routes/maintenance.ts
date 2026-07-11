import type { FastifyInstance } from 'fastify';
import type { CrmRepository } from '../repositories/repository.js';
import { createOpenApiDocument } from '@northwind/api-client';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  getHostingerBackupStatus,
  isStrongBackupTriggerToken,
  runHostingerBackup,
} from '../services/hostinger-backup.js';

const BACKUP_STALE_AFTER_HOURS = 30;

export type ReleaseMetadata = {
  version: string;
  commitSha: string;
  buildTime: string;
  repositoryType: 'json' | 'firestore';
  repositoryDatabaseId?: string | null;
};

export function registerMaintenanceRoutes(
  app: FastifyInstance,
  options: {
    repository: CrmRepository;
    release?: ReleaseMetadata;
    backup?: { directory: string; publicKeyPem: string; triggerTokenHash: string };
  },
) {
  const backupReadiness = () => {
    if (!options.backup)
      return { enabled: false, state: 'not_configured' as const, ready: false, count: 0, ageHours: null };
    try {
      const status = getHostingerBackupStatus(options.backup.directory);
      const state =
        status.count === 0
          ? ('missing' as const)
          : status.ageHours !== null && status.ageHours > BACKUP_STALE_AFTER_HOURS
            ? ('stale' as const)
            : ('healthy' as const);
      return {
        enabled: true,
        state,
        ready: state === 'healthy',
        count: status.count,
        ageHours: status.ageHours,
      };
    } catch {
      return { enabled: true, state: 'invalid' as const, ready: false, count: 0, ageHours: null };
    }
  };
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
      repositoryDatabaseId: options.release?.repositoryDatabaseId ?? null,
      backup: backupReadiness(),
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
        databaseId: options.release?.repositoryDatabaseId ?? null,
        cloudOwnerPolicy: 'nilhan.dev@gmail.com',
        backup: backupReadiness(),
        secrets: 'redacted',
      },
    };
  });
  app.get('/api/openapi.json', async () => createOpenApiDocument());
  app.get('/api/diagnostics/backups', async () => {
    if (!options.backup) return { ...backupReadiness(), latest: null, files: [] };
    try {
      return { ...backupReadiness(), ...getHostingerBackupStatus(options.backup.directory) };
    } catch {
      return { ...backupReadiness(), latest: null, files: [] };
    }
  });
  app.post(
    '/api/maintenance/backups/run',
    { config: { rateLimit: { max: 2, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!options.backup)
        return reply.status(503).send({
          error: {
            code: 'BACKUP_NOT_CONFIGURED',
            message: 'Hostinger backup is not configured.',
            requestId: request.id,
          },
        });
      const token = String(request.headers['x-backup-token'] ?? '');
      if (!isStrongBackupTriggerToken(token))
        return reply.status(401).send({
          error: { code: 'BACKUP_TOKEN_INVALID', message: 'Backup authorization failed.', requestId: request.id },
        });
      const presented = createHash('sha256').update(token).digest();
      const expected = Buffer.from(options.backup.triggerTokenHash, 'hex');
      if (!token || presented.length !== expected.length || !timingSafeEqual(presented, expected))
        return reply.status(401).send({
          error: { code: 'BACKUP_TOKEN_INVALID', message: 'Backup authorization failed.', requestId: request.id },
        });
      const result = await runHostingerBackup({
        repository: options.repository,
        directory: options.backup.directory,
        publicKeyPem: options.backup.publicKeyPem,
      });
      return {
        ok: result.ok,
        createdAt: result.createdAt,
        bytes: result.bytes,
        retained: result.retained,
        counts: result.counts,
      };
    },
  );
}
