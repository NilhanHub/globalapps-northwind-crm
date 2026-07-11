import type { Firestore } from '@google-cloud/firestore';
import { describe, expect, it } from 'vitest';
import { createFirestoreSessionRepository } from './firestore-session-repository.js';
import { FirestoreUnavailableError } from './repository.js';

describe('Firestore session repository failures', () => {
  it('maps quota exhaustion to the recoverable Firestore-unavailable contract', async () => {
    const quotaError = Object.assign(new Error('Quota exceeded'), { code: 8 });
    const document = {
      get: async () => Promise.reject(quotaError),
      create: async () => Promise.reject(quotaError),
      delete: async () => Promise.reject(quotaError),
    };
    const firestore = {
      collection: () => ({ doc: () => document }),
      runTransaction: async () => Promise.reject(quotaError),
    } as unknown as Firestore;
    const repository = createFirestoreSessionRepository(firestore);
    const session = {
      tokenHash: 'a'.repeat(64),
      csrfHash: 'b'.repeat(64),
      actor: 'northwind',
      workspaceId: 'default',
      createdAt: '2026-07-11T00:00:00.000Z',
      lastSeenAt: '2026-07-11T00:00:00.000Z',
      expiresAt: '2026-07-11T16:00:00.000Z',
    };

    await expect(repository.find(session.tokenHash)).rejects.toBeInstanceOf(FirestoreUnavailableError);
    await expect(repository.create(session)).rejects.toBeInstanceOf(FirestoreUnavailableError);
    await expect(repository.touch(session.tokenHash, session)).rejects.toBeInstanceOf(FirestoreUnavailableError);
    await expect(repository.delete(session.tokenHash)).rejects.toBeInstanceOf(FirestoreUnavailableError);
  });
});
