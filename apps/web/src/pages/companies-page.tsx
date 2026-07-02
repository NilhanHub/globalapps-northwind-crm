import { useMemo, useState } from 'react';
import { Archive, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { Badge, Button } from '@northwind/ui';
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
            <Plus size={16} aria-hidden /> Add company
          </Button>
        }
      />
      <div className="workspace-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden />
          <span className="sr-only">Search companies</span>
          <input
            type="search"
            aria-label="Search companies"
            placeholder="Search companies, sectors, contacts…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="view-switch" role="group" aria-label="Company view">
          <button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="Grid view">
            <LayoutGrid size={17} />
          </button>
          <button
            className={view === 'table' ? 'is-active' : ''}
            onClick={() => setView('table')}
            aria-label="Table view"
          >
            <List size={17} />
          </button>
        </div>
        <Link to="/archived" className="toolbar-link">
          <Archive size={16} /> Archived
        </Link>
      </div>
      {visible.length ? (
        view === 'grid' ? (
          <div className="company-grid">
            {visible.map((company) => (
              <Link className="company-card" to={`/companies/${company.id}`} key={company.id}>
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
        <div className="empty-state">
          <div className="empty-state__mark">N</div>
          <h2>{query ? 'No matching companies' : 'Your company desk is clear'}</h2>
          <p>
            {query ? 'Try another name, sector or contact.' : 'Add the first account to start building warm routes.'}
          </p>
          {!query ? <Button onClick={onCreate}>Add company</Button> : null}
        </div>
      )}
    </section>
  );
}
