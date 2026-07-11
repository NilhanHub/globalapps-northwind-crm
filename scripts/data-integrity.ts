import 'dotenv/config';
import { auditWorkspaceData } from '@northwind/domain';
import { createMaintenanceRepository } from './lib/maintenance-repository.js';

const workspaceId = process.env.CRM_WORKSPACE_ID || 'default';
const { repository, repositoryType } = createMaintenanceRepository();
const [companies, people, routes, activities, importJobs] = await Promise.all([
  repository.list('companies', workspaceId),
  repository.list('people', workspaceId),
  repository.list('routes', workspaceId),
  repository.list('activities', workspaceId),
  repository.list('importJobs', workspaceId),
]);
const report = auditWorkspaceData({ companies, people, routes, activities, workspaceId });
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      repositoryType,
      ...report,
      counts: { ...report.counts, importJobs: importJobs.length },
    },
    null,
    2,
  ),
);
if (!report.ok) process.exitCode = 2;
