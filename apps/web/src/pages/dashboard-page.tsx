import { useState } from 'react';
import { ArrowUpRight, CalendarClock, Check, CircleAlert, UserRoundCheck } from 'lucide-react';
import { Badge, Button } from '@northwind/ui';
import type { Company, Person, Route } from '@northwind/domain';
import { PageHeader } from '../components/page-header';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

export function DashboardPage({
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
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const active = routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage));
  const overdue = active.filter((route) => route.dueDate && route.dueDate < today);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const owners = ['Paul', 'Jeremy', 'Nilhan'] as const;
  async function updateRoute(route: Route, changes: Record<string, unknown>, message: string) {
    setError('');
    try {
      await api.request(`/api/routes/${route.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': String(route.version) },
        body: changes,
      });
      setStatus(message);
      await onRefresh?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The route could not be updated.');
    }
  }
  return (
    <section className="workspace">
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>
      {error ? (
        <div className="form-alert" role="alert">
          {error}
        </div>
      ) : null}
      <PageHeader
        eyebrow="Daily command"
        title="Owner dashboard"
        description="A quiet operating view for what needs ownership, attention or a deliberate next move."
        metrics={[
          { label: 'Active', value: active.length },
          { label: 'Due today', value: active.filter((route) => route.dueDate === today).length },
          { label: 'Overdue', value: overdue.length },
          { label: 'Accounts', value: companies.filter((company) => !company.archivedAt).length },
        ]}
      />
      <div className="dashboard-grid">
        <section className="dashboard-panel dashboard-panel--owners">
          <header>
            <div>
              <span className="panel-eyebrow">Ownership</span>
              <h2>Route coverage</h2>
            </div>
            <UserRoundCheck />
          </header>
          <div className="owner-list">
            {owners.map((owner) => {
              const owned = active.filter((route) => route.owner === owner);
              return (
                <button key={owner} onClick={() => navigate('/routes')}>
                  <div className="owner-avatar">{owner.slice(0, 1)}</div>
                  <div>
                    <h3>{owner}</h3>
                    <p>{owned.length} active routes</p>
                  </div>
                  <strong>
                    {owned.filter((route) => route.dueDate === today).length}
                    <small>due today</small>
                  </strong>
                </button>
              );
            })}
          </div>
        </section>
        <section className="dashboard-panel">
          <header>
            <div>
              <span className="panel-eyebrow">Work queue</span>
              <h2>Needs attention</h2>
            </div>
            <CircleAlert />
          </header>
          <div className="attention-list">
            {(overdue.length ? overdue : active.slice(0, 5)).map((route) => (
              <article key={route.id}>
                <div>
                  <strong>{route.companyName}</strong>
                  <span>{peopleById.get(route.targetPersonId)?.name}</span>
                </div>
                {route.owner === 'unassigned' ? (
                  <select
                    aria-label={`Assign ${route.companyName}`}
                    value={route.owner}
                    onChange={(event) =>
                      updateRoute(route, { owner: event.target.value }, `${route.companyName} assigned.`)
                    }
                  >
                    <option value="unassigned">Assign…</option>
                    <option>Paul</option>
                    <option>Jeremy</option>
                    <option>Nilhan</option>
                    <option value="other">Other</option>
                  </select>
                ) : (
                  <Badge tone={route.dueDate && route.dueDate < today ? 'copper' : 'neutral'}>{route.owner}</Badge>
                )}
                <button aria-label={`Open ${route.companyName}`} onClick={() => navigate(`/routes/${route.id}`)}>
                  <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
        <section className="dashboard-panel dashboard-panel--wide">
          <header>
            <div>
              <span className="panel-eyebrow">Next actions</span>
              <h2>Upcoming relationship moves</h2>
            </div>
            <CalendarClock />
          </header>
          <div className="next-action-grid">
            {active
              .filter((route) => route.nextAction)
              .slice(0, 6)
              .map((route) => (
                <article key={route.id}>
                  <label className="inline-date">
                    <span className="sr-only">Reschedule {route.companyName}</span>
                    <input
                      type="date"
                      aria-label={`Reschedule ${route.companyName}`}
                      value={route.dueDate}
                      onChange={(event) =>
                        updateRoute(route, { dueDate: event.target.value }, `${route.companyName} rescheduled.`)
                      }
                    />
                  </label>
                  <h3>{route.nextAction}</h3>
                  <p>
                    {route.companyName} · {peopleById.get(route.targetPersonId)?.name}
                  </p>
                  <div className="inline-actions">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        updateRoute(route, { nextAction: '', dueDate: '' }, `${route.companyName} action completed.`)
                      }
                    >
                      <Check size={14} /> Complete
                    </Button>
                    <Button variant="ghost" onClick={() => navigate(`/routes/${route.id}`)}>
                      Open <ArrowUpRight size={14} />
                    </Button>
                  </div>
                </article>
              ))}
          </div>
        </section>
      </div>
    </section>
  );
}
