import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { BootstrapData } from './types';

export const queryKeys = {
  all: ['northwind'] as const,
  bootstrap: () => [...queryKeys.all, 'bootstrap'] as const,
};

export function useBootstrapQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.bootstrap(),
    queryFn: () => api.request<BootstrapData>('/api/bootstrap'),
    enabled,
  });
}
