import { useMemo, useState } from 'react';
import { Archive, ArrowUpRight, LayoutGrid, List, Plus } from 'lucide-react';
import { Badge, Button, Toolbar, SearchField, EmptyState, Card, IconButton, Skeleton } from '@northwind/ui';
import type { Company, Route } from '@northwind/domain';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/page-header';

const statusTone = (status: string) =>
  status === 'Won' ? 'sage' : status === 'Awaiting reply' ? 'copper' : status === 'Contacted' ? 'burgundy' : 'neutral';

export function CompaniesPage({
  companies,
  routes,
  query,
  onQueryChange,
  searching = false,
  metrics,
  onCreate,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  companies: Company[];
  routes: Route[];
  query: string;
  onQueryChange: (query: string) => void;
  searching?: boolean;
  metrics: { activeAccounts: number; awaitingReply: number };
  onCreate?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const visible = useMemo(() => companies.filter((company) => !company.archivedAt), [companies]);

  const activeRoutes = routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage));

  return (
    <section className="workspace" aria-busy={searching}>
      <PageHeader
        eyebrow="Account intelligence"
        title="Companies"
        description="Signals, conversations and warm paths—prioritised for the next useful move."
        metrics={[
          { label: 'Active accounts', value: metrics.activeAccounts },
          { label: 'Warm routes', value: activeRoutes.length },
          { label: 'Awaiting reply', value: metrics.awaitingReply },
        ]}
        actions={
          <Button onClick={onCreate}>
            <Plus size={16} className="mr-2" aria-hidden /> Add company
          </Button>
        }
      />

      <Toolbar className="workspace-toolbar mb-6">
        <SearchField
          aria-label="Search companies"
          placeholder="Search company names…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="flex items-center gap-4">
          <div className="view-switch" role="group" aria-label="Company view">
            <IconButton
              variant={view === 'grid' ? 'primary' : 'ghost'}
              onClick={() => setView('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid size={17} />
            </IconButton>
            <IconButton
              variant={view === 'table' ? 'primary' : 'ghost'}
              onClick={() => setView('table')}
              aria-label="Table view"
            >
              <List size={17} />
            </IconButton>
          </div>
          <Link to="/archived" className="toolbar-link">
            <Archive size={16} className="mr-1.5" /> Archived
          </Link>
        </div>
      </Toolbar>

      <div className="sr-only" role="status" aria-live="polite">
        {searching ? 'Searching all company records…' : query ? `${visible.length} matching companies loaded.` : ''}
      </div>

      {searching && !visible.length ? (
        <div className="company-grid" aria-label="Searching companies">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : visible.length ? (
        view === 'grid' ? (
          <div className="company-grid">
            {visible.map((company) => (
              <Card key={company.id} className="company-card">
                <Link
                  className="company-card__link"
                  to={`/companies/${company.id}`}
                  aria-label={`Open ${company.name} account`}
                >
                  <div className="company-card__top">
                    <div className="company-monogram" aria-hidden="true">
                      {company.name.slice(0, 1)}
                    </div>
                    <Badge tone={statusTone(company.status)}>{company.status}</Badge>
                  </div>
                  <div className="company-card__identity">
                    <h2>{company.name}</h2>
                    <p>
                      {company.sector || company.industry || 'Sector not set'}
                      {company.country ? ` · ${company.country}` : ''}
                    </p>
                  </div>
                  <div className="company-card__route">
                    <span>Relationship paths</span>
                    <strong>{activeRoutes.filter((route) => route.companyId === company.id).length}</strong>
                  </div>
                  <footer>
                    <span className="company-card__contact">
                      <span className="company-card__contact-label">Primary contact</span>
                      <span className="company-card__contact-name">{company.contactName || 'Contact not set'}</span>
                    </span>
                    <span className="company-card__action" aria-hidden="true">
                      Open account <ArrowUpRight size={15} strokeWidth={1.8} />
                    </span>
                  </footer>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Sector</th>
                  <th>Country</th>
                  <th>Routes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((company) => (
                  <tr key={company.id}>
                    <td>
                      <Link to={`/companies/${company.id}`}>{company.name}</Link>
                    </td>
                    <td>
                      <Badge tone={statusTone(company.status)}>{company.status}</Badge>
                    </td>
                    <td>{company.sector || company.industry || '—'}</td>
                    <td>{company.country || '—'}</td>
                    <td>{activeRoutes.filter((route) => route.companyId === company.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <EmptyState
          title={query ? 'No matching companies' : 'Your company desk is clear'}
          description={query ? 'Try another company name.' : 'Add the first account to start building warm routes.'}
          icon={<LayoutGrid size={24} />}
          action={!query ? <Button onClick={onCreate}>Add company</Button> : null}
        />
      )}
      {hasMore && !searching ? (
        <div className="page-load-more">
          <Button variant="secondary" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load more companies'}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
