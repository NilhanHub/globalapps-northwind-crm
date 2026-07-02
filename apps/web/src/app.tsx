import { useState } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './app-shell';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import type { BootstrapData } from './types';
import { LoginPage } from './pages/login-page';
import { CompaniesPage } from './pages/companies-page';
import { CompanyDetailPage } from './pages/company-detail-page';
import { PeoplePage } from './pages/people-page';
import { RoutesPage } from './pages/routes-page';
import { DashboardPage } from './pages/dashboard-page';
import { ProcessPage } from './pages/process-page';
import { ArchivedPage } from './pages/archived-page';
import { EntityDialog, type EntityDialogKind } from './components/entity-dialog';
import { ApiError } from '@northwind/api-client';
import { RouteDetailPage } from './pages/route-detail-page';
import { queryClient } from './query-client';

function ProtectedApp() {
  const auth = useAuth();
  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => api.request<BootstrapData>('/api/bootstrap'),
    enabled: Boolean(auth.session),
  });
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
          <div />
          <div />
          <div />
        </div>
      </AppShell>
    );
  if (bootstrap.isError || !bootstrap.data)
    return (
      <AppShell>
        <div className="error-panel" role="alert">
          <h1>Northwind could not load</h1>
          <p>The workspace data is currently unavailable.</p>
          <button onClick={() => bootstrap.refetch()}>Try again</button>
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
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
      setDialog(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The record could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['bootstrap'] });
  return (
    <AppShell>
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
