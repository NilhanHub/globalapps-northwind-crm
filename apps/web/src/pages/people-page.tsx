import { useMemo, useState } from 'react';
import { Archive, Link2, Merge, Plus, Search, UsersRound } from 'lucide-react';
import { Badge, Button, Dialog } from '@northwind/ui';
import type { Company, Person, Route } from '@northwind/domain';
import { PageHeader } from '../components/page-header';
import { api } from '../api';
import { ApiError } from '@northwind/api-client';

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const isPossibleDuplicate = (person: Person, all: Person[]) =>
  all.some(
    (other) =>
      other.id !== person.id &&
      !other.archivedAt &&
      ((person.linkedinUrl && normalized(person.linkedinUrl) === normalized(other.linkedinUrl)) ||
        (normalized(person.name) === normalized(other.name) &&
          (!person.companyId || !other.companyId || person.companyId === other.companyId))),
  );

function PersonDialog({
  person,
  people,
  companies,
  onClose,
  onRefresh,
}: {
  person: Person;
  people: Person[];
  companies: Company[];
  onClose(): void;
  onRefresh: (() => Promise<unknown>) | undefined;
}) {
  const [name, setName] = useState(person.name);
  const [title, setTitle] = useState(person.title);
  const [companyId, setCompanyId] = useState(person.companyId);
  const [mutualIds, setMutualIds] = useState(new Set(person.mutualPersonIds));
  const [reason, setReason] = useState('');
  const [mergeId, setMergeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const mutuals = people.filter(
    (item) => item.id !== person.id && !item.archivedAt && ['mutual', 'both'].includes(item.type),
  );
  async function run(label: string, task: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await task();
      await onRefresh?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The change could not be saved.');
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`Manage ${person.name}`}
      description="Edit this person, connect reusable mutual contacts, or safely archive and merge duplicates."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={Boolean(busy) || !name.trim()}
            onClick={() =>
              run('save', () =>
                api.request(`/api/people/${person.id}`, {
                  method: 'PATCH',
                  headers: { 'If-Match': String(person.version) },
                  body: { name, title, companyId, mutualPersonIds: [...mutualIds] },
                }),
              )
            }
          >
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="entity-form">
        {error ? (
          <div className="form-alert field--wide" role="alert">
            {error}
          </div>
        ) : null}
        <label className="field field--wide">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          Role
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          Company
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Network contact</option>
            {companies
              .filter((item) => !item.archivedAt)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        {['target', 'both'].includes(person.type) ? (
          <fieldset className="relationship-picker field--wide">
            <legend>
              <Link2 size={15} /> Mutual contacts
            </legend>
            <p>Attach as many trusted connectors as are useful. Links remain suggestions until a route is created.</p>
            <div>
              {mutuals.map((mutual) => (
                <label key={mutual.id}>
                  <input
                    type="checkbox"
                    aria-label={mutual.name}
                    checked={mutualIds.has(mutual.id)}
                    onChange={() =>
                      setMutualIds((current) => {
                        const next = new Set(current);
                        if (next.has(mutual.id)) next.delete(mutual.id);
                        else next.add(mutual.id);
                        return next;
                      })
                    }
                  />
                  <span>
                    {mutual.name}
                    <small>{mutual.title || 'Relationship not set'}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <section className="record-safety field--wide">
          <h3>Record safety</h3>
          <label className="field">
            Reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for archive or merge"
            />
          </label>
          <div className="merge-row">
            <select
              aria-label="Duplicate person to merge"
              value={mergeId}
              onChange={(event) => setMergeId(event.target.value)}
            >
              <option value="">Choose duplicate…</option>
              {people
                .filter((item) => item.id !== person.id && !item.archivedAt)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
            <Button
              variant="secondary"
              disabled={!mergeId || !reason || Boolean(busy)}
              onClick={() =>
                run('merge', () =>
                  api.request('/api/people/merge', {
                    method: 'POST',
                    body: { survivorId: person.id, sourceId: mergeId, reason },
                  }),
                )
              }
            >
              <Merge size={15} /> Merge
            </Button>
            <Button
              variant="ghost"
              aria-label="Archive person"
              disabled={!reason || Boolean(busy)}
              onClick={() =>
                run('archive', () =>
                  api.request(`/api/people/${person.id}/archive`, { method: 'POST', body: { reason } }),
                )
              }
            >
              <Archive size={15} /> Archive person
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

export function PeoplePage({
  people,
  companies,
  routes,
  onCreate,
  onRefresh,
}: {
  people: Person[];
  companies: Company[];
  routes: Route[];
  onCreate?: () => void;
  onRefresh?: () => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState<Person | null>(null);
  const companiesById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const visible = people.filter((person) => {
    const matchesType =
      type === 'all' ||
      (type === 'duplicates' ? isPossibleDuplicate(person, people) : person.type === type || person.type === 'both');
    return (
      !person.archivedAt &&
      matchesType &&
      [person.name, person.title, companiesById.get(person.companyId)?.name]
        .join(' ')
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  return (
    <section className="workspace">
      <PageHeader
        eyebrow="Relationship network"
        title="People"
        description="Targets and trusted connectors, with every reusable path visible in one directory."
        metrics={[
          {
            label: 'Targets',
            value: people.filter((person) => ['target', 'both'].includes(person.type) && !person.archivedAt).length,
          },
          {
            label: 'Mutuals',
            value: people.filter((person) => ['mutual', 'both'].includes(person.type) && !person.archivedAt).length,
          },
          {
            label: 'Active routes',
            value: routes.filter((route) => !route.archivedAt && !['Won', 'Dead / no route'].includes(route.stage))
              .length,
          },
        ]}
        actions={
          <Button onClick={onCreate}>
            <Plus size={16} /> Add person
          </Button>
        }
      />
      <div className="workspace-tabs" role="tablist" aria-label="People views">
        {['all', 'target', 'mutual', 'duplicates'].map((item) => (
          <button
            role="tab"
            aria-selected={type === item}
            className={type === item ? 'is-active' : ''}
            key={item}
            onClick={() => setType(item)}
          >
            {item === 'all'
              ? 'All people'
              : item === 'target'
                ? 'Targets'
                : item === 'mutual'
                  ? 'Mutual contacts'
                  : 'Possible duplicates'}
          </button>
        ))}
      </div>
      <div className="workspace-toolbar">
        <label className="search-field">
          <Search size={17} />
          <span className="sr-only">Search people</span>
          <input
            type="search"
            aria-label="Search people"
            placeholder="Search people, roles, companies…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="data-table-wrap">
          <table className="data-table people-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Type</th>
                <th>Company</th>
                <th>Relationships</th>
                <th>Active routes</th>
                <th>Last activity</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((person) => {
                const active = routes.filter(
                  (route) =>
                    !route.archivedAt &&
                    !['Won', 'Dead / no route'].includes(route.stage) &&
                    [route.targetPersonId, route.mutualPersonId].includes(person.id),
                ).length;
                return (
                  <tr key={person.id}>
                    <td>
                      <div className="person-cell">
                        <span className="person-avatar">{person.name.slice(0, 1)}</span>
                        <div>
                          <strong>{person.name}</strong>
                          <small>{person.title || 'Role not set'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={person.type === 'target' ? 'burgundy' : 'copper'}>{person.type}</Badge>
                    </td>
                    <td>{companiesById.get(person.companyId)?.name || 'Network contact'}</td>
                    <td>{person.mutualPersonIds.length}</td>
                    <td>{active}</td>
                    <td>{(person as Person & { lastActivityAt?: string }).lastActivityAt || 'No activity'}</td>
                    <td>
                      <button
                        className="row-action"
                        aria-label={`Manage ${person.name}`}
                        onClick={() => setSelected(person)}
                      >
                        {person.type === 'target' ? <Merge size={16} /> : <UsersRound size={16} />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <UsersRound />
          <h2>{type === 'duplicates' ? 'No likely duplicates' : 'No people found'}</h2>
          <p>
            {type === 'duplicates' ? 'Names and LinkedIn URLs look distinct.' : 'Try another search or add a person.'}
          </p>
        </div>
      )}
      {selected ? (
        <PersonDialog
          person={selected}
          people={people}
          companies={companies}
          onClose={() => setSelected(null)}
          onRefresh={onRefresh}
        />
      ) : null}
    </section>
  );
}
