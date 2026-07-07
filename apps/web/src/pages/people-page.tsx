import { useMemo, useState } from 'react';
import { Archive, Link2, Merge, Plus, UsersRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Badge,
  Button,
  Dialog,
  Toolbar,
  SearchField,
  EmptyState,
  Input,
  Select,
  Checkbox,
  Field,
  Label,
  FieldError,
  Alert,
  IconButton,
} from '@northwind/ui';
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

const personSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  title: z.string(),
  companyId: z.string(),
});

type PersonSchema = {
  name: string;
  title: string;
  companyId: string;
};

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
  const [mutualIds, setMutualIds] = useState(new Set(person.mutualPersonIds));
  const [reason, setReason] = useState('');
  const [mergeId, setMergeId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonSchema>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      name: person.name,
      title: person.title || '',
      companyId: person.companyId || '',
    },
  });

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

  const handleSave = (values: PersonSchema) => {
    run('save', () =>
      api.request(`/api/people/${person.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': String(person.version) },
        body: {
          name: values.name,
          title: values.title,
          companyId: values.companyId,
          mutualPersonIds: [...mutualIds],
        },
      }),
    );
  };

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
          <Button disabled={Boolean(busy)} onClick={handleSubmit(handleSave)}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="entity-form flex flex-col gap-5">
        {error && <Alert variant="danger">{error}</Alert>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field className="md:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <FieldError>{errors.name.message}</FieldError>}
          </Field>

          <Field>
            <Label htmlFor="title">Role</Label>
            <Input id="title" {...register('title')} />
            {errors.title && <FieldError>{errors.title.message}</FieldError>}
          </Field>

          <Field>
            <Label htmlFor="companyId">Company</Label>
            <Select id="companyId" {...register('companyId')}>
              <option value="">Network contact</option>
              {companies
                .filter((item) => !item.archivedAt)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
            {errors.companyId && <FieldError>{errors.companyId.message}</FieldError>}
          </Field>
        </div>

        {['target', 'both'].includes(person.type) && (
          <fieldset className="relationship-picker border border-line rounded p-4">
            <legend className="px-1.5 text-xs font-semibold uppercase tracking-wider text-copper flex items-center gap-1.5">
              <Link2 size={14} /> Mutual contacts
            </legend>
            <p className="text-xs text-ink-soft/60 mb-3">
              Attach as many trusted connectors as are useful. Links remain suggestions until a route is created.
            </p>
            <div className="max-h-48 overflow-y-auto grid grid-cols-1 gap-2">
              {mutuals.map((mutual) => (
                <label
                  key={mutual.id}
                  className="flex items-center gap-2.5 p-2 rounded hover:bg-porcelain cursor-pointer text-sm"
                >
                  <Checkbox
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
                  <span className="flex flex-col">
                    <strong>{mutual.name}</strong>
                    <small className="text-xs text-ink-soft/60">{mutual.title || 'Relationship not set'}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <section className="record-safety border border-line rounded p-4 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-danger m-0">Record safety</h3>
          <Field>
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for archive or merge"
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Duplicate person to merge"
              value={mergeId}
              onChange={(event) => setMergeId(event.target.value)}
              className="flex-1 min-w-[150px]"
            >
              <option value="">Choose duplicate…</option>
              {people
                .filter((item) => item.id !== person.id && !item.archivedAt)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
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
              className="flex items-center gap-1.5"
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
              className="text-danger hover:text-danger/90 flex items-center gap-1.5"
            >
              <Archive size={15} /> Archive
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
            <Plus size={16} className="mr-2" /> Add person
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

      <Toolbar className="workspace-toolbar mb-6">
        <SearchField
          aria-label="Search people"
          placeholder="Search people, roles, companies…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Toolbar>

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
                      <IconButton
                        variant="ghost"
                        aria-label={`Manage ${person.name}`}
                        onClick={() => setSelected(person)}
                      >
                        {person.type === 'target' ? <Merge size={16} /> : <UsersRound size={16} />}
                      </IconButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={type === 'duplicates' ? 'No likely duplicates' : 'No people found'}
          description={
            type === 'duplicates' ? 'Names and LinkedIn URLs look distinct.' : 'Try another search or add a person.'
          }
          icon={<UsersRound size={24} />}
        />
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
