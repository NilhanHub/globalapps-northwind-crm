import { useState } from 'react';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { Badge, Button, Dialog } from '@northwind/ui';
import type { Company, Person, Route } from '@northwind/domain';
import { PageHeader } from '../components/page-header';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

type ArchivedRecord = (Company | Person | Route) & { kind: 'Company' | 'Person' | 'Route'; name: string };

export function ArchivedPage({
  companies,
  people,
  routes,
  onRefresh,
}: {
  companies: Company[];
  people: Person[];
  routes: Route[];
  onRefresh?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<ArchivedRecord | null>(null);
  const records: ArchivedRecord[] = [
    ...companies.filter((item) => item.archivedAt).map((item) => ({ ...item, kind: 'Company' as const })),
    ...people.filter((item) => item.archivedAt).map((item) => ({ ...item, kind: 'Person' as const })),
    ...routes
      .filter((item) => item.archivedAt)
      .map((item) => ({ ...item, name: item.companyName, kind: 'Route' as const })),
  ];
  async function restore(record: ArchivedRecord) {
    setBusy(record.id);
    setError('');
    try {
      const collection = record.kind === 'Company' ? 'companies' : record.kind === 'Person' ? 'people' : 'routes';
      await api.request(`/api/${collection}/${record.id}/restore`, { method: 'POST', body: {} });
      await onRefresh?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The record could not be restored.');
    } finally {
      setBusy('');
    }
  }
  async function purge(record: ArchivedRecord) {
    setBusy(record.id);
    setError('');
    try {
      const collection = record.kind === 'Company' ? 'companies' : record.kind === 'Person' ? 'people' : 'routes';
      await api.request(`/api/${collection}/${record.id}`, { method: 'DELETE' });
      setPurgeTarget(null);
      await onRefresh?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The record could not be deleted.');
      setPurgeTarget(null);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="workspace">
      <PageHeader
        eyebrow="Recovery desk"
        title="Archived records"
        description="Restore deliberate removals without losing relationship history or audit context."
        metrics={[{ label: 'Archived', value: records.length }]}
      />
      {error ? (
        <div className="error-panel" role="alert">
          {error}
        </div>
      ) : null}
      {records.length ? (
        <div className="archive-list">
          {records.map((record) => (
            <article key={`${record.kind}-${record.id}`}>
              <ArchiveRestore />
              <div>
                <Badge tone="neutral">{record.kind}</Badge>
                <h2>{record.name}</h2>
                <p>{record.archiveReason || 'No archive reason recorded'}</p>
              </div>
              <div className="archive-actions">
                <Button
                  aria-label={`Restore ${record.name}`}
                  variant="secondary"
                  disabled={busy === record.id}
                  onClick={() => restore(record)}
                >
                  {busy === record.id ? 'Restoring…' : 'Restore'}
                </Button>
                <Button
                  aria-label={`Delete ${record.name} permanently`}
                  variant="ghost"
                  disabled={busy === record.id}
                  onClick={() => setPurgeTarget(record)}
                >
                  <Trash2 size={15} /> Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state__mark">✓</div>
          <h2>Nothing is archived</h2>
          <p>Removed records will remain recoverable here.</p>
        </div>
      )}
      {purgeTarget ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPurgeTarget(null);
          }}
          title="Delete permanently?"
          description="This is only allowed when no people, routes, relationships or activity history depend on the record."
          footer={
            <>
              <Button variant="ghost" onClick={() => setPurgeTarget(null)}>
                Cancel
              </Button>
              <Button onClick={() => purge(purgeTarget)} disabled={Boolean(busy)}>
                Delete {purgeTarget.name}
              </Button>
            </>
          }
        >
          <div className="form-alert" role="alert">
            Permanent deletion cannot be undone. Restore is safer when you may need this history later.
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}
