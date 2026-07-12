// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { useCompanyPages } from './queries';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('paginated queries', () => {
  it('sends the company search term to the server-backed page endpoint', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    renderHook(() => useCompanyPages(true, 'Zed & Sons'), { wrapper });

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/companies/page?limit=50&q=Zed%20%26%20Sons'));
    client.clear();
  });
});
