import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Firestore } from '@google-cloud/firestore';
import { parseServiceAccountBase64 } from '../apps/api/src/firebase.js';
import { decryptBackup } from '../apps/api/src/services/hostinger-backup.js';
import {
  restoreValidatedBackupToFirestore,
  type RestoreTarget,
} from '../apps/api/src/services/firestore-backup-restore.js';

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

const supported = new Set([
  '--apply',
  '--archive',
  '--target-project',
  '--target-database',
  '--source-database',
  '--production-database',
  '--workspace',
  '--confirm',
]);
for (const argument of process.argv.slice(2)) {
  const name = argument.includes('=') ? argument.slice(0, argument.indexOf('=')) : argument;
  if (!supported.has(name)) throw new Error(`Unsupported restore option: ${name}`);
}
if (!process.argv.includes('--apply'))
  throw new Error('Restore is write-protected. Re-run with --apply and the exact --confirm phrase');

const archive = option('archive');
const targetProject = option('target-project');
const targetDatabaseId = option('target-database');
const sourceDatabaseId = option('source-database');
const productionDatabaseId = option('production-database') || '(default)';
const confirmation = option('confirm');
const privateKeyFile = process.env.CRM_BACKUP_PRIVATE_KEY_FILE?.trim();
if (!archive || !targetProject || !targetDatabaseId || !sourceDatabaseId || !confirmation || !privateKeyFile)
  throw new Error(
    'Required: --archive, --target-project, --target-database, --source-database, --confirm and CRM_BACKUP_PRIVATE_KEY_FILE',
  );

const envelope = JSON.parse(readFileSync(resolve(archive), 'utf8')) as unknown;
const privateKey = readFileSync(resolve(privateKeyFile), 'utf8');
const bundle = decryptBackup(envelope, privateKey);
const workspaceId = option('workspace') || bundle.workspaceId;
const target: RestoreTarget = {
  projectId: targetProject,
  targetDatabaseId,
  sourceDatabaseId,
  productionDatabaseId,
  workspaceId,
  confirmation,
};

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
const parsed = serviceAccountBase64 ? parseServiceAccountBase64(serviceAccountBase64, targetProject) : null;
const db = new Firestore({
  projectId: targetProject,
  databaseId: targetDatabaseId,
  ignoreUndefinedProperties: true,
  ...(parsed ? { credentials: { client_email: parsed.clientEmail, private_key: parsed.privateKey } } : {}),
});

try {
  const report = await restoreValidatedBackupToFirestore({ db, bundle, target });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.terminate();
}
