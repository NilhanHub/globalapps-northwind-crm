import type { Firestore } from '@google-cloud/firestore';
import type { SessionRepository, StoredSession } from '../auth/auth-service.js';
import { translateFirestoreError } from './firestore-repository.js';

export function createFirestoreSessionRepository(db: Firestore, workspaceId = 'default'): SessionRepository {
  const collection = db.collection(`workspaces/${workspaceId}/sessions`);
  return {
    async find(tokenHash: string) {
      try {
        const snapshot = await collection.doc(tokenHash).get();
        return snapshot.exists ? snapshot.data() : undefined;
      } catch (error) {
        return translateFirestoreError(error);
      }
    },
    async create(session: StoredSession) {
      try {
        await collection.doc(session.tokenHash).create(session);
      } catch (error) {
        translateFirestoreError(error);
      }
    },
    async touch(tokenHash: string, updates: { lastSeenAt: string; expiresAt: string }) {
      try {
        return await db.runTransaction(async (transaction) => {
          const reference = collection.doc(tokenHash);
          const snapshot = await transaction.get(reference);
          if (!snapshot.exists) return undefined;
          transaction.update(reference, updates);
          return { ...snapshot.data(), ...updates };
        });
      } catch (error) {
        return translateFirestoreError(error);
      }
    },
    async delete(tokenHash: string) {
      try {
        await collection.doc(tokenHash).delete();
      } catch (error) {
        translateFirestoreError(error);
      }
    },
  };
}
