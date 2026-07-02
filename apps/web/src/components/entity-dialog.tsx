import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Dialog } from '@northwind/ui';
import type { BootstrapData } from '../types';

export type EntityDialogKind = 'company' | 'person' | 'route' | null;

export function EntityDialog(props: {
  kind: EntityDialogKind;
  data: BootstrapData;
  busy: boolean;
  error: string;
  onClose(): void;
  onSubmit(kind: Exclude<EntityDialogKind, null>, values: Record<string, unknown>): Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<Record<string, string>>();
  useEffect(() => reset({}), [props.kind, reset]);
  const targetId = watch('targetPersonId');
  const target = props.data.people.find((person) => person.id === targetId);
  const targets = props.data.people.filter((person) => !person.archivedAt && ['target', 'both'].includes(person.type));
  const mutuals = useMemo(
    () =>
      props.data.people.filter(
        (person) =>
          !person.archivedAt &&
          ['mutual', 'both'].includes(person.type) &&
          (!target || target.mutualPersonIds.includes(person.id)),
      ),
    [props.data.people, target],
  );
  if (!props.kind) return null;
  const title = props.kind === 'company' ? 'Add company' : props.kind === 'person' ? 'Add person' : 'Create warm route';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
      title={title}
      description="Add a clean, reusable record to the shared relationship workspace."
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={props.busy}>
            Cancel
          </Button>
          <Button form="entity-form" type="submit" disabled={props.busy}>
            {props.busy ? 'Saving…' : title}
          </Button>
        </>
      }
    >
      <form
        id="entity-form"
        className="entity-form"
        onSubmit={handleSubmit(async (values) => props.onSubmit(props.kind!, values))}
        noValidate
      >
        {props.error ? (
          <div className="form-alert" role="alert">
            {props.error}
          </div>
        ) : null}
        {props.kind === 'company' ? (
          <>
            <label className="field field--wide">
              Company name
              <input
                {...register('name', { required: 'Company name is required' })}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <small>{errors.name.message}</small> : null}
            </label>
            <label className="field">
              Status
              <select {...register('status')} defaultValue="New">
                <option>New</option>
                <option>Contacted</option>
                <option>Awaiting reply</option>
                <option>Won</option>
                <option>Lost</option>
              </select>
            </label>
            <label className="field">
              Country
              <input {...register('country')} />
            </label>
            <label className="field field--wide">
              Sector
              <input {...register('sector')} placeholder="Industry or operating sector" />
            </label>
            <label className="field">
              Primary contact
              <input {...register('contactName')} />
            </label>
            <label className="field">
              Email
              <input type="email" {...register('email')} />
            </label>
          </>
        ) : null}
        {props.kind === 'person' ? (
          <>
            <label className="field field--wide">
              Name
              <input {...register('name', { required: 'Name is required' })} />
              {errors.name ? <small>{errors.name.message}</small> : null}
            </label>
            <label className="field">
              Type
              <select {...register('type')} defaultValue="target">
                <option value="target">Target</option>
                <option value="mutual">Mutual contact</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="field">
              Company
              <select {...register('companyId')}>
                <option value="">Network contact</option>
                {props.data.companies
                  .filter((company) => !company.archivedAt)
                  .map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field field--wide">
              Role or relationship
              <input {...register('title')} />
            </label>
            <label className="field">
              LinkedIn URL
              <input type="url" {...register('linkedinUrl')} />
            </label>
            <label className="field">
              Location
              <input {...register('location')} />
            </label>
          </>
        ) : null}
        {props.kind === 'route' ? (
          <>
            <label className="field">
              Company
              <select {...register('companyId', { required: 'Company is required' })}>
                <option value="">Choose company</option>
                {props.data.companies
                  .filter((company) => !company.archivedAt)
                  .map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Target
              <select {...register('targetPersonId', { required: 'Target is required' })}>
                <option value="">Choose target</option>
                {targets.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Mutual contact
              <select {...register('mutualPersonId', { required: 'Mutual contact is required' })}>
                <option value="">Choose mutual</option>
                {mutuals.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Owner
              <select {...register('owner')} defaultValue="unassigned">
                <option value="unassigned">Unassigned</option>
                <option>Paul</option>
                <option>Jeremy</option>
                <option>Nilhan</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field field--wide">
              Next action
              <input {...register('nextAction')} placeholder="The next concrete move" />
            </label>
            <label className="field">
              Due date
              <input type="date" {...register('dueDate')} />
            </label>
            <label className="field">
              Confidence
              <select {...register('confidence')} defaultValue="emerging">
                <option value="emerging">Emerging</option>
                <option value="promising">Promising</option>
                <option value="strong">Strong</option>
              </select>
            </label>
          </>
        ) : null}
      </form>
    </Dialog>
  );
}
