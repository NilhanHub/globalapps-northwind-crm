import { lazy, Suspense, useState } from 'react';
import { Skeleton, Button, Alert } from '@northwind/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app-shell';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import type { BootstrapData } from './types';
import { LoginPage } from './pages/login-page';
import { EntityDialog, type EntityDialogKind } from './components/entity-dialog';
import { ApiError } from '@northwind/api-client';
import { queryClient } from './query-client';
import { useBootstrapQuery, queryKeys } from './queries';

const CompaniesPage = lazy(() =>
  import('./pages/companies-page').then((module) => ({ default: module.CompaniesPage })),
);
const CompanyDetailPage = lazy(() =>
  import('./pages/company-detail-page').then((module) => ({ default: module.CompanyDetailPage })),
);
const PeoplePage = lazy(() => import('./pages/people-page').then((module) => ({ default: module.PeoplePage })));
const RoutesPage = lazy(() => import('./pages/routes-page').then((module) => ({ default: module.RoutesPage })));
const RouteDetailPage = lazy(() =>
  import('./pages/route-detail-page').then((module) => ({ default: module.RouteDetailPage })),
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);
const ProcessPage = lazy(() => import('./pages/process-page').then((module) => ({ default: module.ProcessPage })));
const ArchivedPage = lazy(() => import('./pages/archived-page').then((module) => ({ default: module.ArchivedPage })));

function WorkspaceLoading() {
  return (
    <div className="skeleton-page" role="status" aria-label="Loading workspace view">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-4 w-96 max-w-full mb-8" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ProtectedApp() {
  const auth = useAuth();
  const bootstrap = useBootstrapQuery(Boolean(auth.session));
  if (auth.loading)
    return (
      <div className="app-loading" role="status">
        <span className="brand-mark">N</span>
        <p>Opening the relationship desk…</p>
      </div>
    );
  if (!auth.session) return <LoginPage />;
  if (bootstrap.isPending)
    return (
      <AppShell>
        <div className="skeleton-page" role="status" aria-label="Loading workspace">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </AppShell>
    );
  if (bootstrap.isError || !bootstrap.data)
    return (
      <AppShell>
        <div className="error-panel" role="alert">
          <Alert variant="danger" title="Northwind could not load">
            The workspace data is currently unavailable.
          </Alert>
          <Button variant="secondary" className="mt-4" onClick={() => bootstrap.refetch()}>
            Try again
          </Button>
        </div>
      </AppShell>
    );
  const data = bootstrap.data;
  return <Workspace data={data} />;
}

function Workspace({ data }: { data: BootstrapData }) {
  const [dialog, setDialog] = useState<EntityDialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(kind: Exclude<EntityDialogKind, null>, values: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api.request(`/api/${kind === 'company' ? 'companies' : kind === 'person' ? 'people' : 'routes'}`, {
        method: 'POST',
        body: values,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.all });
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The record could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.all });
  return (
    <AppShell>
      <Suspense fallback={<WorkspaceLoading />}>
        <Routes>
          <Route
            path="/companies"
            element={
              <CompaniesPage companies={data.companies} routes={data.routes} onCreate={() => setDialog('company')} />
            }
          />
          <Route path="/companies/:id" element={<CompanyDetailPage {...data} onRefresh={refresh} />} />
          <Route
            path="/people"
            element={
              <PeoplePage
                people={data.people}
                companies={data.companies}
                routes={data.routes}
                onCreate={() => setDialog('person')}
                onRefresh={refresh}
              />
            }
          />
          <Route
            path="/routes"
            element={
              <RoutesPage
                companies={data.companies}
                people={data.people}
                routes={data.routes}
                onCreate={() => setDialog('route')}
                onRefresh={refresh}
              />
            }
          />
          <Route path="/routes/:id" element={<RouteDetailPage data={data} onRefresh={refresh} />} />
          <Route
            path="/dashboard"
            element={
              <DashboardPage companies={data.companies} people={data.people} routes={data.routes} onRefresh={refresh} />
            }
          />
          <Route path="/process" element={<ProcessPage />} />
          <Route path="/archived" element={<ArchivedPage {...data} onRefresh={refresh} />} />
          <Route path="*" element={<Navigate to="/companies" replace />} />
        </Routes>
      </Suspense>
      <EntityDialog
        kind={dialog}
        data={data}
        busy={busy}
        error={error}
        onClose={() => setDialog(null)}
        onSubmit={create}
      />
    </AppShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}
