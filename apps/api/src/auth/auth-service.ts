import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestContext } from '@northwind/domain';

const scrypt = promisify(scryptCallback);
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;

type StoredSession = {
  tokenHash: string;
  csrfHash: string;
  actor: string;
  workspaceId: string;
  createdAt: string;
  expiresAt: string;
};

type SessionRepository = {
  list(): Promise<Array<Record<string, unknown>>>;
  replace(sessions: StoredSession[]): Promise<void>;
};

type AuthContext = RequestContext & { csrfHash: string; sessionTokenHash: string; expiresAt: string };

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function hashPassword(password: string) {
  if (password.length < 12) throw new Error('Password must contain at least 12 characters');
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, , , , salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return safeEqual(derived.toString('hex'), expected);
}

export function createAuthService(options: {
  username: string;
  passwordHash: string;
  sessionRepository: SessionRepository;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());

  async function validSessions() {
    const current = now().getTime();
    const sessions = (await options.sessionRepository.list()) as unknown as StoredSession[];
    return sessions.filter((session) => Date.parse(session.expiresAt) > current);
  }

  return {
    async login(username: string, password: string) {
      const usernameMatches = safeEqual(username, options.username);
      const passwordMatches = await verifyPassword(password, options.passwordHash);
      if (!usernameMatches || !passwordMatches) return null;
      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(24).toString('base64url');
      const createdAt = now();
      const session: StoredSession = {
        tokenHash: digest(token),
        csrfHash: digest(csrfToken),
        actor: options.username,
        workspaceId: 'default',
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + SESSION_IDLE_MS).toISOString(),
      };
      await options.sessionRepository.replace([...(await validSessions()), session]);
      return { token, csrfToken, actor: session.actor, expiresAt: session.expiresAt };
    },

    async authenticateSession(token: string): Promise<AuthContext | null> {
      const tokenHash = digest(token);
      const session = (await validSessions()).find((candidate) => safeEqual(candidate.tokenHash, tokenHash));
      if (!session) return null;
      return {
        actor: session.actor,
        authType: 'session',
        workspaceId: session.workspaceId,
        requestId: '',
        csrfHash: session.csrfHash,
        sessionTokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
      };
    },

    validateCsrf(context: AuthContext, csrfToken: string) {
      return safeEqual(context.csrfHash, digest(csrfToken));
    },

    async logout(token: string) {
      const tokenHash = digest(token);
      await options.sessionRepository.replace(
        (await validSessions()).filter((session) => !safeEqual(session.tokenHash, tokenHash)),
      );
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
