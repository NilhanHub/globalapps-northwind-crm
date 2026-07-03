import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RequestContext } from '@northwind/domain';

const scrypt = promisify(scryptCallback);
const SESSION_IDLE_MS = 16 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type StoredSession = {
  tokenHash: string;
  csrfHash: string;
  actor: string;
  workspaceId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type SessionRepository = {
  find(tokenHash: string): Promise<Record<string, unknown> | undefined>;
  create(session: StoredSession): Promise<void>;
  touch(
    tokenHash: string,
    updates: { lastSeenAt: string; expiresAt: string },
  ): Promise<Record<string, unknown> | undefined>;
  delete(tokenHash: string): Promise<void>;
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

export function resolvePasswordHash(env: { CRM_PASSWORD_SCRYPT?: string; CRM_PASSWORD_SCRYPT_BASE64?: string }) {
  const encoded = env.CRM_PASSWORD_SCRYPT_BASE64?.trim();
  if (encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').trim();
    if (!decoded.startsWith('scrypt$')) throw new Error('CRM_PASSWORD_SCRYPT_BASE64 is not a valid scrypt hash');
    return decoded;
  }
  return env.CRM_PASSWORD_SCRYPT?.trim() ?? '';
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
        lastSeenAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + SESSION_IDLE_MS).toISOString(),
      };
      await options.sessionRepository.create(session);
      return { token, csrfToken, actor: session.actor, expiresAt: session.expiresAt };
    },

    async authenticateSessionDetailed(
      token: string,
    ): Promise<
      | { authenticated: true; context: AuthContext }
      | { authenticated: false; reason: 'idle_timeout' | 'invalid_session' }
    > {
      const tokenHash = digest(token);
      const stored = await options.sessionRepository.find(tokenHash);
      if (!stored) return { authenticated: false, reason: 'invalid_session' };
      const session = stored as StoredSession;
      if (!safeEqual(session.tokenHash, tokenHash)) return { authenticated: false, reason: 'invalid_session' };
      const current = now();
      if (Date.parse(session.expiresAt) <= current.getTime()) {
        await options.sessionRepository.delete(tokenHash);
        return { authenticated: false, reason: 'idle_timeout' };
      }
      let active = session;
      if (current.getTime() - Date.parse(session.lastSeenAt || session.createdAt) >= SESSION_TOUCH_INTERVAL_MS) {
        active = {
          ...session,
          lastSeenAt: current.toISOString(),
          expiresAt: new Date(current.getTime() + SESSION_IDLE_MS).toISOString(),
        };
        const touched = await options.sessionRepository.touch(tokenHash, {
          lastSeenAt: active.lastSeenAt,
          expiresAt: active.expiresAt,
        });
        if (!touched) return { authenticated: false, reason: 'invalid_session' };
        active = touched as StoredSession;
      }
      return {
        authenticated: true,
        context: {
          actor: session.actor,
          authType: 'session',
          workspaceId: session.workspaceId,
          requestId: '',
          csrfHash: session.csrfHash,
          sessionTokenHash: session.tokenHash,
          expiresAt: active.expiresAt,
        },
      };
    },

    async authenticateSession(token: string): Promise<AuthContext | null> {
      const result = await this.authenticateSessionDetailed(token);
      return result.authenticated ? result.context : null;
    },

    validateCsrf(context: AuthContext, csrfToken: string) {
      return safeEqual(context.csrfHash, digest(csrfToken));
    },

    async logout(token: string) {
      const tokenHash = digest(token);
      await options.sessionRepository.delete(tokenHash);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
