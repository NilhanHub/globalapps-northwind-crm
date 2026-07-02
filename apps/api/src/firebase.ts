import { Firestore } from '@google-cloud/firestore';

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
  serviceAccountBase64?: string;
  appName?: string;
}) {
  if (!options.projectId.trim()) throw new Error('FIREBASE_PROJECT_ID is required for the Firestore repository');
  const parsed = options.serviceAccountBase64
    ? parseServiceAccountBase64(options.serviceAccountBase64, options.projectId)
    : null;
  return new Firestore({
    projectId: options.projectId,
    ignoreUndefinedProperties: true,
    ...(parsed ? { credentials: { client_email: parsed.clientEmail, private_key: parsed.privateKey } } : {}),
  });
}
