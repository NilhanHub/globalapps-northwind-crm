import { describe, expect, it } from 'vitest';
import { createFirebaseFirestore, parseServiceAccountBase64 } from './firebase.js';

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

describe('Firebase server configuration', () => {
  it('accepts a credential only for the configured project', () => {
    const encoded = encode({
      project_id: 'globalapps-northwind-crm',
      client_email: 'runtime@globalapps-northwind-crm.iam.gserviceaccount.com',
      private_key: 'test-only-placeholder',
    });
    expect(parseServiceAccountBase64(encoded, 'globalapps-northwind-crm')).toMatchObject({
      projectId: 'globalapps-northwind-crm',
    });
    expect(() => parseServiceAccountBase64(encoded, 'another-project')).toThrow(/project/i);
  });

  it('rejects malformed or incomplete credentials without echoing their contents', () => {
    expect(() => parseServiceAccountBase64('not-base64', 'expected-project')).toThrow(
      'Firebase service-account configuration is invalid',
    );
  });
});

describe('Firebase Firestore construction', () => {
  it('selects the default Firestore database when no database ID is supplied', () => {
    const firestore = createFirebaseFirestore({ projectId: 'demo-northwind-crm' });
    expect(firestore.databaseId).toBe('(default)');
  });

  it('selects an explicit named Firestore database without making a cloud request', () => {
    const firestore = createFirebaseFirestore({
      projectId: 'demo-northwind-crm',
      databaseId: 'restore-verification',
    });
    expect(firestore.databaseId).toBe('restore-verification');
  });
});
