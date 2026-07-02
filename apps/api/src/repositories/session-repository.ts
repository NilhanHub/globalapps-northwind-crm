import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SessionRepository, StoredSession } from '../auth/auth-service.js';

export function createFileSessionRepository(file: string): SessionRepository {
  let mutationTail: Promise<unknown> = Promise.resolve();
  const read = (): StoredSession[] => {
    if (!existsSync(file)) return [];
    try {
      const value = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      return Array.isArray(value) ? (value as StoredSession[]) : [];
    } catch {
      return [];
    }
  };
  const write = (sessions: StoredSession[]) => {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(sessions, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, file);
  };
  const serialize = <T>(operation: () => T | Promise<T>): Promise<T> => {
    const next = mutationTail.then(operation, operation);
    mutationTail = next.catch(() => undefined);
    return next;
  };
  return {
    async find(tokenHash: string) {
      return read().find((session) => session.tokenHash === tokenHash);
    },
    async create(session: StoredSession) {
      await serialize(() => {
        const sessions = read();
        if (sessions.some((candidate) => candidate.tokenHash === session.tokenHash))
          throw new Error('Duplicate session token');
        sessions.push(session);
        write(sessions);
      });
    },
    async touch(tokenHash: string, updates: { lastSeenAt: string; expiresAt: string }) {
      return serialize(() => {
        const sessions = read();
        const index = sessions.findIndex((candidate) => candidate.tokenHash === tokenHash);
        if (index < 0) return undefined;
        sessions[index] = { ...sessions[index]!, ...updates };
        write(sessions);
        return sessions[index];
      });
    },
    async delete(tokenHash: string) {
      await serialize(() => write(read().filter((session) => session.tokenHash !== tokenHash)));
    },
  };
}
