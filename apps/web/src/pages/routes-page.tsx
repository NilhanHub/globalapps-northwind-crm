import { useMemo, useState, useEffect } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Filter, MoreHorizontal, Plus } from 'lucide-react';
import { Badge, Button, RelationshipThread, Select, Checkbox, SearchField, Alert, Input, Toolbar } from '@northwind/ui';
import type { Company, Person, Route as RelationshipRoute, RouteOwner, RouteStage } from '@northwind/domain';
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
const owners: RouteOwner[] = ['Paul', 'Jeremy', 'Nilhan', 'other', 'unassigned'];

// Custom SOTA sensor to prevent dragging when clicking interactive elements
class SmartPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        if (event.button !== 0) return false; // Ignore non-left click

        let element = event.target as Element | null;
        while (element && !element.classList.contains('route-card')) {
          const tagName = element.tagName.toLowerCase();
          if (
            ['input', 'textarea', 'select', 'button', 'a', 'label'].includes(tagName) ||
            element.classList.contains('stage-menu') ||
            element.classList.contains('route-select') ||
            element.classList.contains('route-card__open')
          ) {
            return false;
          }
          element = element.parentElement;
        }
        return true;
      },
    },
  ];
}

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
      {...(isOverlay ? {} : drag.listeners)}
      {...(isOverlay ? {} : drag.attributes)}
      role="article"
      className={cardClass}
      style={{
        cursor: isOverlay ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
    >
      {!isOverlay && (
        <div className="route-card__controls" onClick={(event) => event.stopPropagation()}>
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
        <Badge tone={route.owner === 'unassigned' ? 'neutral' : 'sage'}>{route.owner}</Badge>
        <span>{route.nextAction || 'Next action not set'}</span>
      </footer>
    </article>
  );
}

function RouteColumn({ stage, children }: { stage: RouteStage; children: React.ReactNode }) {
  const drop = useDroppable({ id: stage });
  return (
    <section ref={drop.setNodeRef} className={`route-column${drop.isOver ? ' is-over' : ''}`}>
      <header>
        <h2>{stage}</h2>
      </header>
      <div className="route-column__body">{children}</div>
    </section>
  );
}

export function RoutesPage({
  companies,
  people,
  routes,
  onCreate,
  onRefresh,
}: {
  companies: Company[];
  people: Person[];
  routes: RelationshipRoute[];
  onCreate?: () => void;
  onRefresh?: () => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [owner, setOwner] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOwner, setBulkOwner] = useState<RouteOwner>('unassigned');
  const [bulkDate, setBulkDate] = useState('');
  const [bulkAction, setBulkAction] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [localRoutes, setLocalRoutes] = useState<RelationshipRoute[]>(routes);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalRoutes(routes);
  }, [routes]);

  const sensors = useSensors(
    useSensor(SmartPointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visible = localRoutes.filter(
    (route) =>
      !route.archivedAt &&
      (owner === 'all' || route.owner === owner) &&
      [route.companyName, peopleById.get(route.targetPersonId)?.name, peopleById.get(route.mutualPersonId)?.name]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  const activeDraggingRoute = useMemo(() => {
    if (!activeId) return null;
    return localRoutes.find((r) => r.id === activeId) || null;
  }, [activeId, localRoutes]);

  async function move(routeId: string, stage: RouteStage) {
    setError('');
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
        body: { routeIds: [...selected], owner: bulkOwner, dueDate: bulkDate, nextAction: bulkAction },
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
            value: localRoutes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage))
              .length,
          },
          {
            label: 'Unassigned',
            value: localRoutes.filter((route) => !route.archivedAt && route.owner === 'unassigned').length,
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
      {localRoutes.some(
        (route) => !route.archivedAt && (route.owner === 'unassigned' || !route.dueDate || !route.nextAction),
      ) && (
        <aside className="setup-banner">
          <div>
            <strong>Route setup needs attention</strong>
            <span>Assign owners, due dates and concrete next actions to keep the work queue useful.</span>
          </div>
          <Badge tone="copper">
            {
              localRoutes.filter(
                (route) => !route.archivedAt && (route.owner === 'unassigned' || !route.dueDate || !route.nextAction),
              ).length
            }{' '}
            incomplete
          </Badge>
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
          <Filter size={16} className="text-ink-soft/45" />
          <Select
            aria-label="Filter routes by owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="w-40 h-9 py-0.5"
          >
            <option value="all">All owners</option>
            {owners.map((item) => (
              <option key={item} value={item}>
                {item === 'other' ? 'Other' : item === 'unassigned' ? 'Unassigned' : item}
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
                onChange={(event) => setBulkOwner(event.target.value as RouteOwner)}
                className="h-8 py-0.5 mt-1"
              >
                {owners.map((item) => (
                  <option key={item}>{item}</option>
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
          </div>
        </div>
      ) : null}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
        <div className="route-board" aria-label="Warm introduction routes" tabIndex={0}>
          {stages.map((stage) => {
            const stageRoutes = visible.filter((route) => route.stage === stage);
            return (
              <RouteColumn stage={stage} key={stage}>
                {stageRoutes.length ? (
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
    </section>
  );
}
