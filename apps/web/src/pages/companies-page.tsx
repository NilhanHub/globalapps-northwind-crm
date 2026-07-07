import { useMemo, useState } from 'react';
import { Archive, LayoutGrid, List, Plus } from 'lucide-react';
import { Badge, Button, Toolbar, SearchField, EmptyState, Card, IconButton } from '@northwind/ui';
import type { Company, Route } from '@northwind/domain';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/page-header';

const statusTone = (status: string) =>
  status === 'Won' ? 'sage' : status === 'Awaiting reply' ? 'copper' : status === 'Contacted' ? 'burgundy' : 'neutral';

export function CompaniesPage({
  companies,
  routes,
  onCreate,
}: {
  companies: Company[];
  routes: Route[];
  onCreate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const visible = useMemo(
    () =>
      companies.filter(
        (company) =>
          !company.archivedAt &&
          [company.name, company.sector, company.country, company.contactName]
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [companies, query],
  );

  const activeRoutes = routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage));

  return (
    <section className="workspace">
      <PageHeader
        eyebrow="Account intelligence"
        title="Companies"
        description="Signals, conversations and warm paths—prioritised for the next useful move."
        metrics={[
          { label: 'Active accounts', value: visible.length },
          { label: 'Warm routes', value: activeRoutes.length },
          { label: 'Awaiting reply', value: companies.filter((company) => company.status === 'Awaiting reply').length },
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
          placeholder="Search companies, sectors, contacts…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
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

      {visible.length ? (
        view === 'grid' ? (
          <div className="company-grid">
            {visible.map((company) => (
              <Card
                key={company.id}
                className="company-card hover:shadow-md hover:-translate-y-0.5 transition-all p-0 overflow-hidden"
              >
                <Link className="block p-6 h-full" to={`/companies/${company.id}`}>
                  <div className="company-card__top">
                    <div className="company-monogram">{company.name.slice(0, 1)}</div>
                    <Badge tone={statusTone(company.status)}>{company.status}</Badge>
                  </div>
                  <h2>{company.name}</h2>
                  <p>
                    {company.sector || company.industry || 'Sector not set'}
                    {company.country ? ` · ${company.country}` : ''}
                  </p>
                  <div className="company-card__route">
                    <span>Relationship paths</span>
                    <strong>{activeRoutes.filter((route) => route.companyId === company.id).length}</strong>
                  </div>
                  <footer>
                    <span>{company.contactName || 'Contact not set'}</span>
                    <span>Open account →</span>
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
          description={
            query ? 'Try another name, sector or contact.' : 'Add the first account to start building warm routes.'
          }
          icon={<LayoutGrid size={24} />}
          action={!query ? <Button onClick={onCreate}>Add company</Button> : null}
        />
      )}
    </section>
  );
}
