import { useEffect } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { OwnerProfile } from '@northwind/domain';
import type { Company, Person, Route } from '@northwind/domain';
import type { BootstrapData, Page, ReminderResponse, WorkspaceSearchItem } from './types';

export const queryKeys = {
  all: ['northwind'] as const,
  bootstrap: () => [...queryKeys.all, 'bootstrap'] as const,
  revision: () => [...queryKeys.all, 'workspace-revision'] as const,
  reminders: () => [...queryKeys.all, 'reminders'] as const,
  owners: () => [...queryKeys.all, 'owners'] as const,
  search: (query: string) => [...queryKeys.all, 'search', query] as const,
  companyPages: () => [...queryKeys.all, 'companies', 'pages'] as const,
  companyPageQuery: (query: string) => [...queryKeys.companyPages(), query.trim()] as const,
  personPages: () => [...queryKeys.all, 'people', 'pages'] as const,
  personPageQuery: (query: string) => [...queryKeys.personPages(), query.trim()] as const,
  routePages: () => [...queryKeys.all, 'routes', 'pages'] as const,
  routeMetrics: () => [...queryKeys.all, 'routes', 'metrics'] as const,
};

export function useBootstrapQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.bootstrap(),
    queryFn: () => api.request<BootstrapData>('/api/bootstrap'),
    enabled,
  });
}

export function useCompanyPages(enabled: boolean, query = '') {
  const search = query.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.companyPageQuery(search),
    queryFn: ({ pageParam }) =>
      api.request<Page<Company>>(
        `/api/companies/page?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useRoutePages(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.routePages(),
    queryFn: ({ pageParam }) =>
      api.request<Page<Route>>(
        `/api/routes/page?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function usePersonPages(enabled: boolean, query = '') {
  const search = query.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.personPageQuery(search),
    queryFn: ({ pageParam }) =>
      api.request<Page<Person>>(
        `/api/people/page?limit=50${search ? `&q=${encodeURIComponent(search)}` : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}

export function useRouteMetrics(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.routeMetrics(),
    queryFn: () =>
      api.request<{ active: number; overdue: number; dueToday: number; unassigned: number; awaitingReply: number }>(
        '/api/routes/metrics',
      ),
    enabled,
  });
}

export function useRemindersQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reminders(),
    queryFn: () => api.request<ReminderResponse>('/api/reminders'),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
  });
}

export function useOwnersQuery(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.owners(),
    queryFn: () => api.request<OwnerProfile[]>('/api/owners'),
    enabled,
  });
}

export function useWorkspaceSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => api.request<{ items: WorkspaceSearchItem[] }>(`/api/search?q=${encodeURIComponent(query)}`),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000,
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
      for (const key of [
        queryKeys.bootstrap(),
        queryKeys.reminders(),
        queryKeys.owners(),
        queryKeys.companyPages(),
        queryKeys.personPages(),
        queryKeys.routePages(),
        queryKeys.routeMetrics(),
      ])
        void client.invalidateQueries({ queryKey: key });
    }
  }, [bootstrapRevision, client, query.data?.revision]);
  return query;
}
