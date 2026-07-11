import 'dotenv/config';
import { createMaintenanceRepository } from './lib/maintenance-repository.js';
import { migrateOwnerProfiles } from '../apps/api/src/services/owner-migration.js';

const workspaceId = process.env.CRM_WORKSPACE_ID || 'default';
const { repository, repositoryType } = createMaintenanceRepository();
const result = await migrateOwnerProfiles(repository, workspaceId);
console.log(JSON.stringify({ ok: true, repositoryType, workspaceId, ...result }));
