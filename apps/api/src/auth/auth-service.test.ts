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
    const auth = createAuthService({
      username: 'northwind',
      passwordHash: await hashPassword('secret-value'),
      sessionRepository: {
        list: async () => stored,
        replace: async (sessions) => {
          stored.splice(0, stored.length, ...sessions);
        },
      },
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
});
