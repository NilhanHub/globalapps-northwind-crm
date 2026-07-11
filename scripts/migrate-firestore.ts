import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { migrateRepositoryData } from '../apps/api/src/cloud-migration.js';
import { createFirebaseFirestore } from '../apps/api/src/firebase.js';
import { migrateDataStores } from '../apps/api/src/migration.js';
import { createFirestoreRepository } from '../apps/api/src/repositories/firestore-repository.js';
import { createFirestoreRestMigrationRepository } from '../apps/api/src/repositories/firestore-rest-migration-repository.js';
import { createJsonRepository } from '../apps/api/src/repositories/json-repository.js';
import { resolveRepositoryConfig } from '../apps/api/src/runtime-config.js';

const apply = process.argv.includes('--apply');
const useGcloudUser = process.argv.includes('--gcloud-user');
if (
  process.argv.some(
    (argument) => !['--apply', '--dry-run', '--gcloud-user'].includes(argument) && argument.startsWith('--'),
  )
)
  throw new Error('Supported flags are --dry-run, --apply and --gcloud-user');

const root = resolve(process.cwd());
const dataDir = resolve(process.env.CRM_DATA_DIR || resolve(root, 'data'));
if (!['companies', 'people', 'routes', 'activities'].every((store) => existsSync(resolve(dataDir, `${store}.json`))))
  migrateDataStores(root, dataDir);

const approvedAccount = 'nilhan.dev@gmail.com';
const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || 'globalapps-northwind-crm';
const databaseId = process.env.CRM_FIRESTORE_DATABASE_ID?.trim() || '(default)';
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) throw new Error('FIREBASE_PROJECT_ID is invalid');
const run = promisify(execFile);
const gcloud = 'gcloud';
const commandOptions = { windowsHide: true, shell: process.platform === 'win32' } as const;
let destination;
if (useGcloudUser) {
  const { stdout: accountOutput } = await run(
    gcloud,
    ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
    commandOptions,
  );
  if (accountOutput.trim().toLowerCase() !== approvedAccount)
    throw new Error(`Active gcloud identity must be ${approvedAccount}; migration was not started`);
  destination = createFirestoreRestMigrationRepository({
    projectId,
    databaseId,
    tokenProvider: async () => {
      const { stdout } = await run(
        gcloud,
        ['auth', 'print-access-token', `--account=${approvedAccount}`, `--project=${projectId}`],
        { ...commandOptions, maxBuffer: 1024 * 1024 },
      );
      const token = stdout.trim();
      if (!token) throw new Error('The approved gcloud identity did not return an access token');
      return token;
    },
  });
} else {
  const config = resolveRepositoryConfig({ ...process.env, CRM_REPOSITORY: 'firestore' });
  if (config.mode !== 'firestore') throw new Error('Firestore configuration was not selected');
  const db = createFirebaseFirestore({
    projectId: config.projectId,
    databaseId: config.databaseId,
    ...(config.serviceAccountBase64 ? { serviceAccountBase64: config.serviceAccountBase64 } : {}),
  });
  destination = createFirestoreRepository(db);
}
const report = await migrateRepositoryData(createJsonRepository(dataDir), destination, {
  workspaceId: 'default',
  dryRun: !apply,
});
console.log(
  JSON.stringify(
    {
      ...report,
      databaseId,
      mode: apply ? 'applied-and-verified' : 'dry-run',
      credential: useGcloudUser ? approvedAccount : 'server',
    },
    null,
    2,
  ),
);
