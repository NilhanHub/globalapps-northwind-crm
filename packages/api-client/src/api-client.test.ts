import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './index';

describe('typed API client', () => {
  it('adds the csrf token to browser mutations', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const client = createApiClient({ fetcher, getCsrfToken: () => 'csrf-value' });
    await client.request('/api/routes/r1', { method: 'PATCH', body: { nextAction: 'Call' } });
    expect(fetcher).toHaveBeenCalledWith(
      '/api/routes/r1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-value' }),
      }),
    );
  });

  it('surfaces structured conflict errors', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'Refresh first', requestId: 'req-1' } }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const client = createApiClient({ fetcher });
    await expect(client.request('/api/routes/r1')).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      requestId: 'req-1',
    } satisfies Partial<ApiError>);
  });

  it('passes the structured session failure code to the unauthorized handler', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'SESSION_IDLE_TIMEOUT', message: 'Sign in again' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const client = createApiClient({ fetcher, onUnauthorized });
    await expect(client.request('/api/bootstrap')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledWith('SESSION_IDLE_TIMEOUT');
  });
});
