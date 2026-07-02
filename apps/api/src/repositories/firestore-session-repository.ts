import type { Firestore } from '@google-cloud/firestore';
import type { SessionRepository, StoredSession } from '../auth/auth-service.js';

export function createFirestoreSessionRepository(db: Firestore, workspaceId = 'default'): SessionRepository {
  const collection = db.collection(`workspaces/${workspaceId}/sessions`);
  return {
    async find(tokenHash: string) {
      const snapshot = await collection.doc(tokenHash).get();
      return snapshot.exists ? snapshot.data() : undefined;
    },
    async create(session: StoredSession) {
      await collection.doc(session.tokenHash).create(session);
    },
    async touch(tokenHash: string, updates: { lastSeenAt: string; expiresAt: string }) {
      return db.runTransaction(async (transaction) => {
        const reference = collection.doc(tokenHash);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return undefined;
        transaction.update(reference, updates);
        return { ...snapshot.data(), ...updates };
      });
    },
    async delete(tokenHash: string) {
      await collection.doc(tokenHash).delete();
    },
  };
}
