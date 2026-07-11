import { useMemo, useState, useEffect } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Filter, GripVertical, Layers3, MoreHorizontal, Plus, Rows3 } from 'lucide-react';
import {
  Badge,
  Button,
  RelationshipThread,
  Select,
  Checkbox,
  SearchField,
  Alert,
  Input,
  Toolbar,
  Dialog,
} from '@northwind/ui';
import type { Company, OwnerProfile, Person, Route as RelationshipRoute, RouteStage } from '@northwind/domain';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/page-header';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

const stages: RouteStage[] = [
  'Found route',
  'Mutual friend to contact',
  'Intro requested',
  'Intro agreed',
  'Target contacted',
  'Meeting / reply',
  'Won',
  'Dead / no route',
];

function RouteCard({
  route,
  target,
  mutual,
  selected,
  onSelect,
  onOpen,
  onMove,
  isPlaceholder,
  isOverlay,
}: {
  route: RelationshipRoute;
  target: Person | undefined;
  mutual: Person | undefined;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
  onMove(stage: RouteStage): void;
  isPlaceholder?: boolean;
  isOverlay?: boolean;
}) {
  const drag = useDraggable({ id: route.id, data: { route } });

  if (isPlaceholder) {
    return (
      <article className="route-card is-placeholder" style={{ pointerEvents: 'none' }}>
        <div style={{ visibility: 'hidden' }}>
          <div className="route-card__controls">
            <label className="route-select">
              <Checkbox checked={false} readOnly />
            </label>
          </div>
          <div className="route-card__head">
            <div className="company-monogram company-monogram--small">A</div>
            <div>
              <span>{route.companyName}</span>
              <h3>{target?.name || 'Target'}</h3>
            </div>
          </div>
          <p>{target?.title || 'Role not set'}</p>
          <div className="route-card__mutual">
            <span>via</span>
            <strong>{mutual?.name || 'Mutual'}</strong>
          </div>
          <footer>
            <span>unassigned</span>
          </footer>
        </div>
      </article>
    );
  }

  const cardClass = `route-card${isOverlay ? ' is-overlay' : ''}${drag.isDragging ? ' is-drag-origin' : ''}`;

  return (
    <article
      ref={isOverlay ? undefined : drag.setNodeRef}
      role="article"
      className={cardClass}
      style={{
        cursor: isOverlay ? 'grabbing' : 'default',
      }}
    >
      {!isOverlay && (
        <div className="route-card__controls" onClick={(event) => event.stopPropagation()}>
          <button
            ref={drag.setActivatorNodeRef}
            {...drag.listeners}
            {...drag.attributes}
            type="button"
            className="route-card__drag"
            aria-label={`Drag route for ${target?.name || route.companyName}`}
          >
            <GripVertical size={16} />
          </button>
          <label className="route-select">
            <Checkbox
              checked={selected}
              onChange={onSelect}
              aria-label={`Select route for ${target?.name || route.companyName}`}
            />
          </label>
          <details className="stage-menu">
            <summary role="button" aria-label={`Move ${target?.name || route.companyName} to another stage`}>
              <MoreHorizontal size={16} />
            </summary>
            <div>
              {stages.map((stage) => (
                <button key={stage} disabled={stage === route.stage} onClick={() => onMove(stage)}>
                  {stage}
                </button>
              ))}
            </div>
          </details>
        </div>
      )}
      <div className="route-card__head">
        <div className="company-monogram company-monogram--small">{route.companyName.slice(0, 1)}</div>
        <div>
          <span>{route.companyName}</span>
          <h3>
            {isOverlay ? (
              <span>{target?.name || 'Unknown target'}</span>
            ) : (
              <button
                className="route-card__open"
                onClick={onOpen}
                aria-label={`Open route for ${target?.name || route.companyName}`}
              >
                {target?.name || 'Unknown target'}
              </button>
            )}
          </h3>
        </div>
        <Badge
          tone={route.confidence === 'strong' ? 'burgundy' : route.confidence === 'promising' ? 'copper' : 'neutral'}
        >
          {route.confidence}
        </Badge>
      </div>
      <p>{target?.title || 'Role not set'}</p>
      <RelationshipThread
        compact
        target={target?.name || 'Target'}
        mutual={mutual?.name || 'Mutual'}
        owner={route.owner}
        stage={route.stage}
      />
      <div className="route-card__mutual">
        <span>via</span>
        <strong>{mutual?.name || 'Unknown mutual'}</strong>
      </div>
      <footer>
        <Badge tone={route.ownerId === 'owner-unassigned' ? 'neutral' : 'sage'}>{route.owner}</Badge>
        <span>{route.nextAction || 'Next action not set'}</span>
      </footer>
    </article>
  );
}

function RouteColumn({ stage, children }: { stage: RouteStage; children: React.ReactNode }) {
  const drop = useDroppable({ id: stage });
  return (
    <section
      ref={drop.setNodeRef}
      className={`route-column${drop.isOver ? ' is-over' : ''}`}
      role="region"
      aria-label={`${stage} routes`}
    >
      <header>
        <h2>{stage}</h2>
      </header>
      <div className="route-column__body">{children}</div>
    </section>
  );
}

function RouteClusterCard({
  clusterRoutes,
  target,
  peopleById,
  selected,
  onToggleSelected,
  onMove,
  onOpen,
}: {
  clusterRoutes: RelationshipRoute[];
  target: Person | undefined;
  peopleById: Map<string, Person>;
  selected: Set<string>;
  onToggleSelected(routeIds: string[]): void;
  onMove(routeId: string, stage: RouteStage): void;
  onOpen(routeId: string): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allSelected = clusterRoutes.every((route) => selected.has(route.id));
  const lead = [...clusterRoutes].sort((left, right) => stages.indexOf(right.stage) - stages.indexOf(left.stage))[0]!;
  return (
    <article className="route-card route-cluster-card">
      <div className="route-card__controls">
        <label className="route-select">
          <Checkbox
            checked={allSelected}
            onChange={() => onToggleSelected(clusterRoutes.map((route) => route.id))}
            aria-label={`Select all routes for ${target?.name || lead.companyName}`}
          />
        </label>
        <Badge tone="neutral">{clusterRoutes.length} paths</Badge>
      </div>
      <div className="route-card__head">
        <div className="company-monogram company-monogram--small">{lead.companyName.slice(0, 1)}</div>
        <div>
          <span>{lead.companyName}</span>
          <h3>{target?.name || 'Unknown target'}</h3>
        </div>
        <Badge
          tone={lead.confidence === 'strong' ? 'burgundy' : lead.confidence === 'promising' ? 'copper' : 'neutral'}
        >
          {lead.confidence}
        </Badge>
      </div>
      <p>{target?.title || 'Role not set'}</p>
      <button
        type="button"
        className="cluster-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        aria-label={`${expanded ? 'Hide' : 'Show'} ${clusterRoutes.length} mutual paths for ${target?.name || lead.companyName}`}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>{expanded ? 'Hide mutual paths' : 'Review mutual paths'}</span>
      </button>
      {expanded ? (
        <div className="cluster-paths">
          {clusterRoutes.map((route) => {
            const mutual = peopleById.get(route.mutualPersonId);
            return (
              <div className="cluster-path" key={route.id}>
                <button
                  type="button"
                  className="cluster-path__open"
                  onClick={() => onOpen(route.id)}
                  aria-label={`Open route for ${target?.name || lead.companyName} via ${mutual?.name || 'mutual contact'}`}
                >
                  <strong>{mutual?.name || 'Unknown mutual'}</strong>
                  <span>
                    {route.owner} · {route.stage}
                  </span>
                </button>
                <details className="stage-menu">
                  <summary role="button" aria-label={`Move path via ${mutual?.name || 'mutual'} to another stage`}>
                    <MoreHorizontal size={16} />
                  </summary>
                  <div>
                    {stages.map((stage) => (
                      <button key={stage} disabled={stage === route.stage} onClick={() => onMove(route.id, stage)}>
                        {stage}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cluster-stage-summary" aria-label="Path stages">
          {clusterRoutes.map((route) => (
            <Badge key={route.id} tone={route.stage === lead.stage ? 'copper' : 'neutral'}>
              {route.stage}
            </Badge>
          ))}
        </div>
      )}
      <footer>
        <Badge tone={lead.ownerId === 'owner-unassigned' ? 'neutral' : 'sage'}>{lead.owner}</Badge>
        <span>{lead.nextAction || 'Next action not set'}</span>
      </footer>
    </article>
  );
}

export function RoutesPage({
  companies,
  people,
  routes,
  owners = [],
  onCreate,
  onRefresh,
  hasMore,
  loadingMore,
  onLoadMore,
  metrics,
}: {
  companies: Company[];
  people: Person[];
  routes: RelationshipRoute[];
  owners?: OwnerProfile[];
  onCreate?: () => void;
  onRefresh?: () => Promise<unknown>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  metrics?: { active: number; unassigned: number };
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => {
    try {
      return localStorage.getItem('northwind:routes-query') ?? '';
    } catch {
      return '';
    }
  });
  const [owner, setOwner] = useState(() => {
    try {
      const stored = localStorage.getItem('northwind:routes-owner') ?? 'all';
      return owners.find((candidate) => candidate.displayName === stored)?.id ?? stored;
    } catch {
      return 'all';
    }
  });
  const [savedView, setSavedView] = useState(() => {
    try {
      return localStorage.getItem('northwind:routes-saved-view') ?? 'all';
    } catch {
      return 'all';
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState('owner-unassigned');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkAction, setBulkAction] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const [view, setView] = useState<'clusters' | 'paths'>(() => {
    try {
      return localStorage.getItem('northwind:routes-view') === 'paths' ? 'paths' : 'clusters';
    } catch {
      return 'clusters';
    }
  });

  const [localRoutes, setLocalRoutes] = useState<RelationshipRoute[]>(routes);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalRoutes(routes);
  }, [routes]);
  useEffect(() => {
    try {
      localStorage.setItem('northwind:routes-query', query);
      localStorage.setItem('northwind:routes-owner', owner);
      localStorage.setItem('northwind:routes-saved-view', savedView);
    } catch {
      // Saved views are optional when storage is unavailable.
    }
  }, [owner, query, savedView]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visible = localRoutes.filter(
    (route) =>
      !route.archivedAt &&
      (owner === 'all' || route.ownerId === owner) &&
      (savedView === 'all' ||
        (savedView === 'unassigned' && route.ownerId === 'owner-unassigned') ||
        (savedView === 'overdue' &&
          Boolean(route.dueDate) &&
          route.dueDate < new Date().toISOString().slice(0, 10) &&
          !['Won', 'Dead / no route'].includes(route.stage)) ||
        (savedView === 'unscheduled' && (!route.dueDate || !route.nextAction)) ||
        (savedView === 'imported' && Boolean(route.sourceIdentityKey))) &&
      [route.companyName, peopleById.get(route.targetPersonId)?.name, peopleById.get(route.mutualPersonId)?.name]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const clusters = useMemo(() => {
    const grouped = new Map<string, RelationshipRoute[]>();
    for (const route of visible)
      grouped.set(route.targetPersonId, [...(grouped.get(route.targetPersonId) ?? []), route]);
    return [...grouped.entries()].map(([targetPersonId, clusterRoutes]) => ({
      targetPersonId,
      routes: clusterRoutes,
      stage: [...clusterRoutes].sort((left, right) => stages.indexOf(right.stage) - stages.indexOf(left.stage))[0]!
        .stage,
    }));
  }, [visible]);

  const activeDraggingRoute = useMemo(() => {
    if (!activeId) return null;
    return localRoutes.find((r) => r.id === activeId) || null;
  }, [activeId, localRoutes]);
  const activeRoutes = localRoutes.filter(
    (route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage),
  );
  const incompleteRoutes = activeRoutes.filter(
    (route) => route.ownerId === 'owner-unassigned' || !route.dueDate || !route.nextAction,
  );
  const setupPercent = activeRoutes.length
    ? Math.round(((activeRoutes.length - incompleteRoutes.length) / activeRoutes.length) * 100)
    : 100;

  async function move(routeId: string, stage: RouteStage) {
    setError('');
    if (stage === 'Won' || stage === 'Dead / no route') {
      setStatus('Won and dead outcomes require a reason and confirmation.');
      navigate(`/routes/${routeId}?outcome=${stage === 'Won' ? 'won' : 'dead'}`);
      return false;
    }
    try {
      await api.request(`/api/routes/${routeId}/actions`, { method: 'POST', body: { action: 'move_stage', stage } });
      setStatus(`Route moved to ${stage}.`);
      await onRefresh?.();
      return true;
    } catch (caught) {
      const msg = caught instanceof ApiError ? caught.message : 'The route could not be updated.';
      setError(msg);
      return false;
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const stage = over.id as RouteStage;
    const route = localRoutes.find((item) => item.id === active.id);
    if (route && stages.includes(stage) && route.stage !== stage) {
      const previousRoutes = localRoutes;
      // Optimistic update
      setLocalRoutes((current) => current.map((r) => (r.id === route.id ? { ...r, stage } : r)));
      if (!(await move(route.id, stage))) {
        // Rollback on failure
        setLocalRoutes(previousRoutes);
      }
    }
  }

  function onDragCancel() {
    setActiveId(null);
  }

  async function applyBulk() {
    setBulkBusy(true);
    setError('');
    try {
      await api.request('/api/routes/bulk/actions', {
        method: 'POST',
        body: { routeIds: [...selected], ownerId: bulkOwner, dueDate: bulkDate, nextAction: bulkAction },
      });
      setStatus(`${selected.size} routes updated.`);
      setSelected(new Set());
      await onRefresh?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The selected routes could not be updated. Try again.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function resetSelected() {
    setBulkBusy(true);
    setError('');
    try {
      await api.request('/api/routes/bulk/actions', {
        method: 'POST',
        body: { routeIds: [...selected], action: 'reset' },
      });
      setStatus(`${selected.size} routes reset to Found route. Research and history were preserved.`);
      setSelected(new Set());
      setResetConfirmation(false);
      await onRefresh?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The selected routes could not be reset.');
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section className="workspace workspace--board">
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>
      <PageHeader
        eyebrow="Warm introduction desk"
        title="Routes"
        description="Move each relationship with intent. Every stage change remains visible and auditable."
        metrics={[
          {
            label: 'Active',
            value:
              metrics?.active ??
              localRoutes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage))
                .length,
          },
          {
            label: 'Unassigned',
            value:
              metrics?.unassigned ??
              localRoutes.filter((route) => !route.archivedAt && route.ownerId === 'owner-unassigned').length,
          },
          { label: 'Companies', value: companies.filter((company) => !company.archivedAt).length },
        ]}
        actions={
          <Button onClick={onCreate}>
            <Plus size={16} className="mr-2" /> New route
          </Button>
        }
      />
      {error && (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      )}
      {incompleteRoutes.length > 0 && (
        <aside className="setup-banner">
          <div>
            <strong>Route setup needs attention</strong>
            <span>{setupPercent}% complete · assign owners, due dates and concrete next actions.</span>
          </div>
          <div className="setup-banner__actions">
            <Badge tone="copper">{incompleteRoutes.length} incomplete</Badge>
            <Button
              variant="secondary"
              className="h-8 py-0"
              onClick={() => setSelected(new Set(incompleteRoutes.map((route) => route.id)))}
            >
              Set up incomplete routes
            </Button>
          </div>
        </aside>
      )}
      <Toolbar className="workspace-toolbar mb-6">
        <SearchField
          aria-label="Search routes"
          placeholder="Search companies, targets, mutuals…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-9"
            onClick={() => {
              const next = view === 'clusters' ? 'paths' : 'clusters';
              setView(next);
              try {
                localStorage.setItem('northwind:routes-view', next);
              } catch {
                // Preferences are optional when storage is unavailable.
              }
            }}
            aria-label={view === 'clusters' ? 'Show individual paths' : 'Show target clusters'}
          >
            {view === 'clusters' ? <Rows3 size={16} className="mr-2" /> : <Layers3 size={16} className="mr-2" />}
            {view === 'clusters' ? 'Individual paths' : 'Target clusters'}
          </Button>
          <Filter size={16} className="text-ink-soft/45" />
          <Select
            aria-label="Saved route view"
            value={savedView}
            onChange={(event) => setSavedView(event.target.value)}
            className="w-40 h-9 py-0.5"
          >
            <option value="all">All routes</option>
            <option value="unassigned">Unassigned</option>
            <option value="overdue">Overdue</option>
            <option value="unscheduled">Missing schedule</option>
            <option value="imported">Imported research</option>
          </Select>
          <Select
            aria-label="Filter routes by owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="w-40 h-9 py-0.5"
          >
            <option value="all">All owners</option>
            {owners
              .filter((item) => item.active)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
          </Select>
        </div>
      </Toolbar>
      {selected.size ? (
        <div
          className="bulk-bar flex flex-wrap items-center gap-4 p-4 border border-line rounded-md bg-paper shadow-sm mb-6"
          role="region"
          aria-label="Bulk route actions"
        >
          <strong>{selected.size} selected</strong>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-ink-soft">
              Owner
              <Select
                value={bulkOwner}
                onChange={(event) => setBulkOwner(event.target.value)}
                className="h-8 py-0.5 mt-1"
              >
                {owners
                  .filter((item) => item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Due
              <Input
                type="date"
                value={bulkDate}
                onChange={(event) => setBulkDate(event.target.value)}
                className="h-8 py-0.5 mt-1"
              />
            </label>
            <label className="text-xs font-semibold text-ink-soft">
              Next action
              <Input
                value={bulkAction}
                onChange={(event) => setBulkAction(event.target.value)}
                className="h-8 py-0.5 mt-1"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button onClick={applyBulk} className="h-8 py-0" disabled={bulkBusy}>
              {bulkBusy ? 'Updating…' : 'Update selected'}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())} className="h-8 py-0">
              Clear
            </Button>
            <Button variant="ghost" onClick={() => setResetConfirmation(true)} className="h-8 py-0 text-danger">
              Reset workflow
            </Button>
          </div>
        </div>
      ) : null}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <div className="route-board" aria-label="Warm introduction routes" tabIndex={0}>
          {stages.map((stage) => {
            const stageRoutes = visible.filter((route) => route.stage === stage);
            const stageClusters = clusters.filter((cluster) => cluster.stage === stage);
            return (
              <RouteColumn stage={stage} key={stage}>
                {view === 'clusters' && stageClusters.length ? (
                  stageClusters.map((cluster) => (
                    <RouteClusterCard
                      key={cluster.targetPersonId}
                      clusterRoutes={cluster.routes}
                      target={peopleById.get(cluster.targetPersonId)}
                      peopleById={peopleById}
                      selected={selected}
                      onToggleSelected={(routeIds) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          const allSelected = routeIds.every((id) => next.has(id));
                          for (const id of routeIds) {
                            if (allSelected) next.delete(id);
                            else next.add(id);
                          }
                          return next;
                        })
                      }
                      onOpen={(routeId) => navigate(`/routes/${routeId}`)}
                      onMove={(routeId, nextStage) => void move(routeId, nextStage)}
                    />
                  ))
                ) : view === 'paths' && stageRoutes.length ? (
                  stageRoutes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      target={peopleById.get(route.targetPersonId)}
                      mutual={peopleById.get(route.mutualPersonId)}
                      selected={selected.has(route.id)}
                      onSelect={() =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(route.id)) next.delete(route.id);
                          else next.add(route.id);
                          return next;
                        })
                      }
                      onOpen={() => navigate(`/routes/${route.id}`)}
                      onMove={(nextStage) => void move(route.id, nextStage)}
                      isPlaceholder={activeId === route.id}
                    />
                  ))
                ) : (
                  <div className="column-empty">
                    <span>↗</span>
                    <strong>No routes here</strong>
                    <small>Move a relationship into this stage.</small>
                  </div>
                )}
              </RouteColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeId && activeDraggingRoute ? (
            <RouteCard
              route={activeDraggingRoute}
              target={peopleById.get(activeDraggingRoute.targetPersonId)}
              mutual={peopleById.get(activeDraggingRoute.mutualPersonId)}
              selected={false}
              onSelect={() => {}}
              onOpen={() => {}}
              onMove={() => {}}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      {hasMore ? (
        <div className="page-load-more">
          <Button variant="secondary" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load more routes'}
          </Button>
        </div>
      ) : null}
      <Dialog
        open={resetConfirmation}
        onOpenChange={setResetConfirmation}
        title="Reset selected routes?"
        description="Owner, confidence and scheduling will return to their initial state. Research notes and activity history remain unchanged."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetConfirmation(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={resetSelected} disabled={bulkBusy}>
              {bulkBusy ? 'Resetting…' : `Reset ${selected.size} routes`}
            </Button>
          </>
        }
      >
        <div className="record-safety">
          <h3>Audited reset</h3>
          <p>Every selected route receives a reset activity and can be undone for five minutes.</p>
        </div>
      </Dialog>
    </section>
  );
}
