import { resolveFirestoreDatabaseId } from './firebase.js';

const APPROVED_CLOUD_OWNER = 'nilhan.dev@gmail.com';

export function resolveRepositoryConfig(
  env: Record<string, string | undefined>,
): { mode: 'json' } | { mode: 'firestore'; projectId: string; databaseId: string; serviceAccountBase64?: string } {
  const production = env.NODE_ENV === 'production';
  const mode = env.CRM_REPOSITORY?.trim() || (production ? 'firestore' : 'json');
  if (!['json', 'firestore'].includes(mode)) throw new Error('CRM_REPOSITORY must be json or firestore');
  if (production && mode !== 'firestore') throw new Error('Production must use the Firestore repository');
  if (mode === 'json') return { mode: 'json' };

  const owner = env.CRM_CLOUD_OWNER_EMAIL?.trim().toLowerCase();
  if (owner !== APPROVED_CLOUD_OWNER)
    throw new Error(`CRM_CLOUD_OWNER_EMAIL must be ${APPROVED_CLOUD_OWNER}; no other human identity is approved`);
  const projectId = env.FIREBASE_PROJECT_ID?.trim() ?? '';
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required for Firestore');
  const databaseId = resolveFirestoreDatabaseId(env.CRM_FIRESTORE_DATABASE_ID);
  const serviceAccountBase64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (production && !serviceAccountBase64)
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is required for Hostinger production');
  return {
    mode: 'firestore',
    projectId,
    databaseId,
    ...(serviceAccountBase64 ? { serviceAccountBase64 } : {}),
  };
}
