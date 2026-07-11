import { describe, expect, it } from 'vitest';
import { FASTIFY_LOG_REDACT_PATHS } from './server.js';

describe('Fastify request logging', () => {
  it('redacts the dedicated backup trigger header', () => {
    expect(FASTIFY_LOG_REDACT_PATHS).toContain('req.headers.x-backup-token');
  });
});
