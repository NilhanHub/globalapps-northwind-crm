import { describe, expect, it } from 'vitest';
import { resolveRepositoryConfig } from './runtime-config.js';

describe('repository runtime configuration', () => {
  it('uses JSON only for local development by default', () => {
    expect(resolveRepositoryConfig({ NODE_ENV: 'development' })).toEqual({ mode: 'json' });
  });

  it('requires Firestore and the sole approved human owner in production', () => {
    expect(() => resolveRepositoryConfig({ NODE_ENV: 'production', CRM_REPOSITORY: 'json' })).toThrow(/Firestore/i);
    expect(() =>
      resolveRepositoryConfig({
        NODE_ENV: 'production',
        CRM_REPOSITORY: 'firestore',
        CRM_CLOUD_OWNER_EMAIL: 'someone@example.com',
        FIREBASE_PROJECT_ID: 'globalapps-northwind-crm',
        FIREBASE_SERVICE_ACCOUNT_BASE64: 'configured',
      }),
    ).toThrow(/nilhan.dev@gmail.com/i);
    expect(
      resolveRepositoryConfig({
        NODE_ENV: 'production',
        CRM_REPOSITORY: 'firestore',
        CRM_CLOUD_OWNER_EMAIL: 'nilhan.dev@gmail.com',
        FIREBASE_PROJECT_ID: 'globalapps-northwind-crm',
        FIREBASE_SERVICE_ACCOUNT_BASE64: 'configured',
      }),
    ).toMatchObject({ mode: 'firestore', projectId: 'globalapps-northwind-crm' });
  });
});
