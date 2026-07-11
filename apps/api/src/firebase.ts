import { Firestore } from '@google-cloud/firestore';

const FIRESTORE_DATABASE_ID_PATTERN = /^\(default\)$|^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;

export function resolveFirestoreDatabaseId(value?: string) {
  const databaseId = value?.trim() || '(default)';
  if (!FIRESTORE_DATABASE_ID_PATTERN.test(databaseId))
    throw new Error('CRM_FIRESTORE_DATABASE_ID must be (default) or a 4-63 character lowercase Firestore database ID');
  return databaseId;
}

export function parseServiceAccountBase64(encoded: string, expectedProjectId: string) {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Record<string, unknown>;
    const projectId = String(parsed.project_id ?? '');
    const clientEmail = String(parsed.client_email ?? '');
    const privateKey = String(parsed.private_key ?? '');
    if (!projectId || !clientEmail || !privateKey || projectId !== expectedProjectId) throw new Error('invalid');
    return { projectId, clientEmail, privateKey };
  } catch {
    throw new Error('Firebase service-account configuration is invalid or belongs to a different project');
  }
}

export function createFirebaseFirestore(options: {
  projectId: string;
  databaseId?: string;
  serviceAccountBase64?: string;
  appName?: string;
}) {
  if (!options.projectId.trim()) throw new Error('FIREBASE_PROJECT_ID is required for the Firestore repository');
  const databaseId = resolveFirestoreDatabaseId(options.databaseId);
  const parsed = options.serviceAccountBase64
    ? parseServiceAccountBase64(options.serviceAccountBase64, options.projectId)
    : null;
  return new Firestore({
    projectId: options.projectId,
    databaseId,
    ignoreUndefinedProperties: true,
    ...(parsed ? { credentials: { client_email: parsed.clientEmail, private_key: parsed.privateKey } } : {}),
  });
}
