import 'dotenv/config';
import { resolve } from 'node:path';
import { createFirebaseFirestore } from '../../apps/api/src/firebase.js';
import { createFirestoreRepository } from '../../apps/api/src/repositories/firestore-repository.js';
import { createJsonRepository } from '../../apps/api/src/repositories/json-repository.js';
import { resolveRepositoryConfig } from '../../apps/api/src/runtime-config.js';

export function createMaintenanceRepository() {
  const config = resolveRepositoryConfig(process.env);
  if (config.mode === 'json') {
    return {
      repository: createJsonRepository(resolve(process.env.CRM_DATA_DIR || resolve(process.cwd(), 'data'))),
      repositoryType: 'json' as const,
    };
  }
  const firestore = createFirebaseFirestore({
    projectId: config.projectId,
    databaseId: config.databaseId,
    ...(config.serviceAccountBase64 ? { serviceAccountBase64: config.serviceAccountBase64 } : {}),
  });
  return { repository: createFirestoreRepository(firestore), repositoryType: 'firestore' as const };
}
