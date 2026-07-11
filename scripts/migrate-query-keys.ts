import 'dotenv/config';
import { createMaintenanceRepository } from './lib/maintenance-repository.js';
import { migrateQueryKeys } from '../apps/api/src/services/query-key-migration.js';

const workspaceId = process.env.CRM_WORKSPACE_ID || 'default';
const { repository, repositoryType } = createMaintenanceRepository();
const result = await migrateQueryKeys(repository, workspaceId);
console.log(JSON.stringify({ ok: true, repositoryType, workspaceId, ...result }));
