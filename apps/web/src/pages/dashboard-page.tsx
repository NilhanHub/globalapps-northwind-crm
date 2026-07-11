import { useState } from 'react';
import { ArrowUpRight, CalendarClock, Check, CircleAlert, UserRoundCheck } from 'lucide-react';
import { Badge, Button, Card, Select, Alert, IconButton, Input } from '@northwind/ui';
import type { Company, OwnerProfile, Person, Route } from '@northwind/domain';
import { PageHeader } from '../components/page-header';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

export function DashboardPage({
  companies,
  people,
  routes,
  owners = [],
  onRefresh,
}: {
  companies: Company[];
  people: Person[];
  routes: Route[];
  owners?: OwnerProfile[];
  onRefresh?: () => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const active = routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage));
  const overdue = active.filter((route) => route.dueDate && route.dueDate < today);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const activeOwners = owners.filter((owner) => owner.active && owner.id !== 'owner-unassigned');

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

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

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
        <Card className="dashboard-panel dashboard-panel--owners">
          <header className="flex justify-between items-start mb-5 text-burgundy">
            <div>
              <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
                Ownership
              </span>
              <h2 className="m-0 text-xl font-display font-semibold text-ink">Route coverage</h2>
            </div>
            <UserRoundCheck />
          </header>
          <div className="owner-list">
            {activeOwners.map((owner) => {
              const owned = active.filter((route) => route.ownerId === owner.id);
              return (
                <button key={owner.id} onClick={() => navigate('/routes')}>
                  <div className="owner-avatar">{owner.displayName.slice(0, 1)}</div>
                  <div>
                    <h3>{owner.displayName}</h3>
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
        </Card>

        <Card className="dashboard-panel">
          <header className="flex justify-between items-start mb-5 text-burgundy">
            <div>
              <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
                Work queue
              </span>
              <h2 className="m-0 text-xl font-display font-semibold text-ink">Needs attention</h2>
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
                {route.ownerId === 'owner-unassigned' ? (
                  <Select
                    aria-label={`Assign ${route.companyName}`}
                    value={route.ownerId}
                    onChange={(event) =>
                      updateRoute(route, { ownerId: event.target.value }, `${route.companyName} assigned.`)
                    }
                    className="max-w-[120px] h-8 py-0.5"
                  >
                    <option value="owner-unassigned">Assign…</option>
                    {activeOwners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.displayName}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={route.dueDate && route.dueDate < today ? 'copper' : 'neutral'}>{route.owner}</Badge>
                )}
                <IconButton
                  variant="ghost"
                  aria-label={`Open ${route.companyName}`}
                  onClick={() => navigate(`/routes/${route.id}`)}
                >
                  <ArrowUpRight size={16} />
                </IconButton>
              </article>
            ))}
          </div>
        </Card>

        <Card className="dashboard-panel dashboard-panel--wide">
          <header className="flex justify-between items-start mb-5 text-burgundy">
            <div>
              <span className="panel-eyebrow text-xs uppercase font-data font-bold tracking-wider text-copper">
                Next actions
              </span>
              <h2 className="m-0 text-xl font-display font-semibold text-ink">Upcoming relationship moves</h2>
            </div>
            <CalendarClock />
          </header>
          <div className="next-action-grid">
            {active
              .filter((route) => route.nextAction)
              .slice(0, 6)
              .map((route) => (
                <article
                  key={route.id}
                  className="p-4 border-l-3 border-copper rounded bg-porcelain flex flex-col gap-2"
                >
                  <label className="inline-date block">
                    <span className="sr-only">Reschedule {route.companyName}</span>
                    <Input
                      type="date"
                      aria-label={`Reschedule ${route.companyName}`}
                      value={route.dueDate}
                      onChange={(event) =>
                        updateRoute(route, { dueDate: event.target.value }, `${route.companyName} rescheduled.`)
                      }
                      className="border border-line rounded px-2 py-0.5 text-xs bg-paper text-burgundy font-data font-bold"
                    />
                  </label>
                  <h3 className="m-0 text-sm font-display font-semibold text-ink leading-tight">{route.nextAction}</h3>
                  <p className="text-xs text-ink-soft">
                    {route.companyName} · {peopleById.get(route.targetPersonId)?.name}
                  </p>
                  <div className="inline-actions flex justify-between gap-2 mt-2">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        updateRoute(route, { nextAction: '', dueDate: '' }, `${route.companyName} action completed.`)
                      }
                      className="h-7 px-2 text-[10px]"
                    >
                      <Check size={12} className="mr-1" /> Complete
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/routes/${route.id}`)}
                      className="h-7 px-2 text-[10px]"
                    >
                      Open <ArrowUpRight size={12} className="ml-1" />
                    </Button>
                  </div>
                </article>
              ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
