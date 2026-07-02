import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Filter, GripVertical, MoreHorizontal, Plus, Search } from 'lucide-react';
import { Badge, Button, RelationshipThread } from '@northwind/ui';
import type { Company, Person, Route as RelationshipRoute, RouteOwner, RouteStage } from '@northwind/domain';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/page-header';
import { api } from '../api';

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

function RouteCard({
  route,
  target,
  mutual,
  selected,
  onSelect,
  onOpen,
  onMove,
}: {
  route: RelationshipRoute;
  target: Person | undefined;
  mutual: Person | undefined;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
  onMove(stage: RouteStage): void;
}) {
  const drag = useDraggable({ id: route.id, data: { route } });
  const style = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : undefined;
  return (
    <article ref={drag.setNodeRef} style={style} className={`route-card${drag.isDragging ? ' is-dragging' : ''}`}>
      <div className="route-card__controls" onClick={(event) => event.stopPropagation()}>
        <label className="route-select">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={`Select route for ${target?.name || route.companyName}`}
          />
          <span />
        </label>
        <button
          className="drag-handle"
          aria-label={`Drag ${target?.name || route.companyName}`}
          {...drag.listeners}
          {...drag.attributes}
        >
          <GripVertical size={15} />
        </button>
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
      <div className="route-card__head">
        <div className="company-monogram company-monogram--small">{route.companyName.slice(0, 1)}</div>
        <div>
          <span>{route.companyName}</span>
          <h3>
            <button
              className="route-card__open"
              onClick={onOpen}
              aria-label={`Open route for ${target?.name || route.companyName}`}
            >
              {target?.name || 'Unknown target'}
            </button>
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visible = routes.filter(
    (route) =>
      !route.archivedAt &&
      (owner === 'all' || route.owner === owner) &&
      [route.companyName, peopleById.get(route.targetPersonId)?.name, peopleById.get(route.mutualPersonId)?.name]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function move(routeId: string, stage: RouteStage) {
    await api.request(`/api/routes/${routeId}/actions`, { method: 'POST', body: { action: 'move_stage', stage } });
    setStatus(`Route moved to ${stage}.`);
    await onRefresh?.();
  }
  async function onDragEnd(event: DragEndEvent) {
    const stage = event.over?.id as RouteStage | undefined;
    const route = routes.find((item) => item.id === event.active.id);
    if (stage && route && stages.includes(stage) && route.stage !== stage) await move(route.id, stage);
  }
  async function applyBulk() {
    await api.request('/api/routes/bulk/actions', {
      method: 'POST',
      body: { routeIds: [...selected], owner: bulkOwner, dueDate: bulkDate, nextAction: bulkAction },
    });
    setStatus(`${selected.size} routes updated.`);
    setSelected(new Set());
    await onRefresh?.();
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
            value: routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage))
              .length,
          },
          {
            label: 'Unassigned',
            value: routes.filter((route) => !route.archivedAt && route.owner === 'unassigned').length,
          },
          { label: 'Companies', value: companies.filter((company) => !company.archivedAt).length },
        ]}
        actions={
          <Button onClick={onCreate}>
            <Plus size={16} /> New route
          </Button>
        }
      />
      {routes.some(
        (route) => !route.archivedAt && (route.owner === 'unassigned' || !route.dueDate || !route.nextAction),
      ) ? (
        <aside className="setup-banner">
          <div>
            <strong>Route setup needs attention</strong>
            <span>Assign owners, due dates and concrete next actions to keep the work queue useful.</span>
          </div>
          <Badge tone="copper">
            {
              routes.filter(
                (route) => !route.archivedAt && (route.owner === 'unassigned' || !route.dueDate || !route.nextAction),
              ).length
            }{' '}
            incomplete
          </Badge>
        </aside>
      ) : null}
      <div className="workspace-toolbar">
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">Search routes</span>
          <input
            type="search"
            aria-label="Search routes"
            placeholder="Search companies, targets, mutuals…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="select-field">
          <Filter size={16} />
          <span className="sr-only">Filter owner</span>
          <select aria-label="Filter routes by owner" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="all">All owners</option>
            {owners.map((item) => (
              <option key={item} value={item}>
                {item === 'other' ? 'Other' : item === 'unassigned' ? 'Unassigned' : item}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected.size ? (
        <div className="bulk-bar" role="region" aria-label="Bulk route actions">
          <strong>{selected.size} selected</strong>
          <label>
            Owner
            <select value={bulkOwner} onChange={(event) => setBulkOwner(event.target.value as RouteOwner)}>
              {owners.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Due
            <input type="date" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} />
          </label>
          <label>
            Next action
            <input value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} />
          </label>
          <Button onClick={applyBulk}>Update selected</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="route-board" aria-label="Warm introduction routes">
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
                      onMove={(nextStage) => move(route.id, nextStage)}
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
      </DndContext>
    </section>
  );
}
