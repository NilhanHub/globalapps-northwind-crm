import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { BootstrapData } from './types';

export const queryKeys = {
  all: ['northwind'] as const,
  bootstrap: () => [...queryKeys.all, 'bootstrap'] as const,
  revision: () => [...queryKeys.all, 'workspace-revision'] as const,
};

export function useBootstrapQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.bootstrap(),
    queryFn: () => api.request<BootstrapData>('/api/bootstrap'),
    enabled,
  });
}

export function useWorkspaceRevisionQuery(enabled: boolean, bootstrapRevision = '') {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.revision(),
    queryFn: () => api.request<{ workspaceId: string; revision: string; updatedAt: string }>('/api/workspace/revision'),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: () => (typeof document === 'undefined' || document.visibilityState === 'visible' ? 30_000 : false),
  });
  useEffect(() => {
    if (query.data?.revision && bootstrapRevision && query.data.revision !== bootstrapRevision) {
      void client.invalidateQueries({ queryKey: queryKeys.bootstrap() });
    }
  }, [bootstrapRevision, client, query.data?.revision]);
  return query;
}
