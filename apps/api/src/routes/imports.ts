import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { importJobSchema, type ImportJob } from '@northwind/domain';
import type { CrmRepository, StoreChanges, StoreName } from '../repositories/repository.js';
import {
  buildResearchImportChanges,
  parseResearchRequest,
  previewResearchImport,
  researchRowSchema,
} from '../services/research-import.js';

async function currentData(repository: CrmRepository, workspaceId: string) {
  const [companies, people, routes, activities] = await Promise.all([
    repository.list('companies', workspaceId),
    repository.list('people', workspaceId),
    repository.list('routes', workspaceId),
    repository.list('activities', workspaceId),
  ]);
  return { companies, people, routes, activities };
}

function chunks(changes: StoreChanges, size = 400) {
  const entries = (Object.entries(changes) as [StoreName, Array<Record<string, unknown>>][]).flatMap(
    ([store, records]) => records.map((record) => ({ store, record })),
  );
  const result: StoreChanges[] = [];
  for (let index = 0; index < entries.length; index += size) {
    const chunk: StoreChanges = {};
    for (const entry of entries.slice(index, index + size)) {
      const records = (chunk[entry.store] ?? []) as Array<Record<string, unknown>>;
      records.push(entry.record);
      Object.assign(chunk, { [entry.store]: records });
    }
    result.push(chunk);
  }
  return result;
}

async function executeJob(repository: CrmRepository, job: ImportJob) {
  const rows = job.rows.map((row) => researchRowSchema.parse(row));
  const data = await currentData(repository, job.workspaceId);
  const now = new Date().toISOString();
  const built = buildResearchImportChanges({
    rows,
    ...data,
    workspaceId: job.workspaceId,
    actor: job.actor,
    importJobId: job.id,
    now,
  });
  const batches = chunks(built.changes);
  let processed = 0;
  try {
    for (const batch of batches) {
      await repository.upsertTransaction(batch);
      processed += Object.values(batch).reduce((sum, records) => sum + (records?.length ?? 0), 0);
    }
    return await repository.update(
      'importJobs',
      job.id,
      {
        status: 'completed',
        progress: { processed: rows.length, total: rows.length },
        summary: built.summary,
        resultIds: built.resultIds,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      job.version,
      job.workspaceId,
    );
  } catch (error) {
    await repository.update(
      'importJobs',
      job.id,
      {
        status: 'interrupted',
        progress: { processed: Math.min(rows.length, processed), total: rows.length },
        error: error instanceof Error ? error.message.slice(0, 500) : 'Import interrupted',
        updatedAt: new Date().toISOString(),
      },
      job.version,
      job.workspaceId,
    );
    throw error;
  }
}

export function registerImportRoutes(app: FastifyInstance, repository: CrmRepository) {
  app.post('/api/imports/research/preview', { bodyLimit: 5 * 1024 * 1024 }, async (request) => {
    const context = request.requestContext!;
    const parsed = parseResearchRequest(request.body);
    const data = await currentData(repository, context.workspaceId);
    return {
      preview: previewResearchImport(parsed.rows, data),
      rows: parsed.rows,
      omissions: parsed.omissions,
    };
  });

  app.post('/api/imports/research', { bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const context = request.requestContext!;
    const parsed = parseResearchRequest(request.body);
    if (!parsed.rows.length)
      return reply.status(400).send({
        error: {
          code: 'IMPORT_EMPTY',
          message: 'No complete research rows were found. Review the preview omissions.',
          requestId: request.id,
        },
      });
    const now = new Date().toISOString();
    const job = importJobSchema.parse({
      id: `import-${randomUUID()}`,
      kind: 'research',
      status: 'running',
      sourceHashes: [...new Set(parsed.rows.map((row) => row.sourceHash))],
      rows: parsed.rows,
      progress: { processed: 0, total: parsed.rows.length },
      summary: {},
      createdAt: now,
      updatedAt: now,
      actor: context.actor,
      workspaceId: context.workspaceId,
      version: 1,
    });
    await repository.create('importJobs', job, context.workspaceId);
    return reply.status(201).send(await executeJob(repository, job));
  });

  app.get('/api/imports/:id', async (request) => {
    const context = request.requestContext!;
    const job = (await repository.list('importJobs', context.workspaceId)).find(
      (item) => item.id === (request.params as { id: string }).id,
    );
    if (!job) throw Object.assign(new Error('Import job was not found'), { statusCode: 404, code: 'NOT_FOUND' });
    return job;
  });

  app.post('/api/imports/:id/resume', async (request) => {
    const context = request.requestContext!;
    const job = (await repository.list('importJobs', context.workspaceId)).find(
      (item) => item.id === (request.params as { id: string }).id,
    );
    if (!job) throw Object.assign(new Error('Import job was not found'), { statusCode: 404, code: 'NOT_FOUND' });
    if (!['interrupted', 'failed'].includes(job.status))
      throw Object.assign(new Error('Only an interrupted import can be resumed'), {
        statusCode: 409,
        code: 'IMPORT_NOT_RESUMABLE',
      });
    const running = await repository.update(
      'importJobs',
      job.id,
      { status: 'running', error: undefined, updatedAt: new Date().toISOString() },
      job.version,
      context.workspaceId,
    );
    return executeJob(repository, running);
  });
}
