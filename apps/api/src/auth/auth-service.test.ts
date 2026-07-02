import { describe, expect, it } from 'vitest';
import { createAuthService, hashPassword, verifyPassword } from './auth-service.js';

describe('authentication service', () => {
  it('creates salted scrypt hashes and verifies without storing the password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('stores only a token hash and requires the matching csrf token', async () => {
    const stored: Array<Record<string, unknown>> = [];
    const sessionRepository = {
      find: async (tokenHash: string) => stored.find((item) => item.tokenHash === tokenHash),
      create: async (session: Record<string, unknown>) => {
        const index = stored.findIndex((item) => item.tokenHash === session.tokenHash);
        if (index < 0) stored.push(session);
        else stored[index] = session;
      },
      touch: async (tokenHash: string, updates: Record<string, string>) => {
        const index = stored.findIndex((item) => item.tokenHash === tokenHash);
        if (index < 0) return undefined;
        stored[index] = { ...stored[index], ...updates };
        return stored[index];
      },
      delete: async (tokenHash: string) => {
        const index = stored.findIndex((item) => item.tokenHash === tokenHash);
        if (index >= 0) stored.splice(index, 1);
      },
    };
    const auth = createAuthService({
      username: 'northwind',
      passwordHash: await hashPassword('secret-value'),
      sessionRepository,
      now: () => new Date('2026-07-02T10:00:00Z'),
    });
    const session = await auth.login('northwind', 'secret-value');
    if (!session) throw new Error('Expected valid credentials to create a session');
    expect(stored[0]).not.toHaveProperty('token', session.token);
    expect(stored[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const context = await auth.authenticateSession(session.token);
    expect(context?.actor).toBe('northwind');
    expect(auth.validateCsrf(context!, session.csrfToken)).toBe(true);
    expect(auth.validateCsrf(context!, 'wrong')).toBe(false);
  });

  it('slides active sessions to 16 hours and reports idle expiry separately from invalid sessions', async () => {
    const stored: Array<Record<string, unknown>> = [];
    const sessionRepository = {
      find: async (tokenHash: string) => stored.find((item) => item.tokenHash === tokenHash),
      create: async (session: Record<string, unknown>) => {
        const index = stored.findIndex((item) => item.tokenHash === session.tokenHash);
        if (index < 0) stored.push(session);
        else stored[index] = session;
      },
      touch: async (tokenHash: string, updates: Record<string, string>) => {
        const index = stored.findIndex((item) => item.tokenHash === tokenHash);
        if (index < 0) return undefined;
        stored[index] = { ...stored[index], ...updates };
        return stored[index];
      },
      delete: async (tokenHash: string) => {
        const index = stored.findIndex((item) => item.tokenHash === tokenHash);
        if (index >= 0) stored.splice(index, 1);
      },
    };
    let current = new Date('2026-07-02T10:00:00Z');
    const auth = createAuthService({
      username: 'northwind',
      passwordHash: await hashPassword('secret-value'),
      sessionRepository,
      now: () => current,
    });
    const session = await auth.login('northwind', 'secret-value');
    if (!session) throw new Error('Expected login');
    expect(session.expiresAt).toBe('2026-07-03T02:00:00.000Z');

    current = new Date('2026-07-02T16:00:00Z');
    const active = await auth.authenticateSessionDetailed(session.token);
    expect(active).toMatchObject({ authenticated: true });
    expect(stored[0]?.expiresAt).toBe('2026-07-03T08:00:00.000Z');

    current = new Date('2026-07-03T08:00:00.001Z');
    await expect(auth.authenticateSessionDetailed(session.token)).resolves.toEqual({
      authenticated: false,
      reason: 'idle_timeout',
    });
    await expect(auth.authenticateSessionDetailed('unknown-token')).resolves.toEqual({
      authenticated: false,
      reason: 'invalid_session',
    });
  });

  it('does not recreate a session that is logged out while an activity touch is in flight', async () => {
    let stored: Record<string, unknown> | undefined;
    let current = new Date('2026-07-02T10:00:00Z');
    const auth = createAuthService({
      username: 'northwind',
      passwordHash: await hashPassword('secret-value'),
      sessionRepository: {
        find: async () => stored,
        create: async (session) => {
          stored = session;
        },
        touch: async () => {
          stored = undefined;
          return undefined;
        },
        delete: async () => {
          stored = undefined;
        },
      },
      now: () => current,
    });
    const session = await auth.login('northwind', 'secret-value');
    if (!session) throw new Error('Expected login');
    current = new Date('2026-07-02T16:00:00Z');
    await expect(auth.authenticateSessionDetailed(session.token)).resolves.toEqual({
      authenticated: false,
      reason: 'invalid_session',
    });
    expect(stored).toBeUndefined();
  });
});
