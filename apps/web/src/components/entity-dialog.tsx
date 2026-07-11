import { useEffect, useMemo } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Dialog, Input, Select, Label, Field, FieldError, Alert } from '@northwind/ui';
import type { BootstrapData } from '../types';

export type EntityDialogKind = 'company' | 'person' | 'route' | null;

const companySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required'),
  status: z.string().optional(),
  country: z.string().optional(),
  sector: z.string().optional(),
  contactName: z.string().optional(),
  email: z.union([z.literal(''), z.string().email('Enter a valid email address')]).optional(),
});

const personSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  type: z.string().optional(),
  companyId: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.union([z.literal(''), z.string().url('Enter a valid LinkedIn URL')]).optional(),
  location: z.string().optional(),
});

const routeSchema = z.object({
  companyId: z.string().min(1, 'Company is required'),
  targetPersonId: z.string().min(1, 'Target is required'),
  mutualPersonId: z.string().min(1, 'Mutual contact is required'),
  owner: z.string().optional(),
  ownerId: z.string().optional(),
  nextAction: z.string().optional(),
  dueDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid due date')]).optional(),
  confidence: z.string().optional(),
});

export function EntityDialog(props: {
  kind: EntityDialogKind;
  data: BootstrapData;
  busy: boolean;
  error: string;
  onClose(): void;
  onSubmit(kind: Exclude<EntityDialogKind, null>, values: Record<string, unknown>): Promise<void>;
}) {
  const activeSchema = useMemo(() => {
    if (props.kind === 'company') return companySchema;
    if (props.kind === 'person') return personSchema;
    return routeSchema;
  }, [props.kind]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(activeSchema) as unknown as Resolver<Record<string, string>>,
  });

  useEffect(() => reset({}), [props.kind, reset]);

  const companyId = watch('companyId');
  const targetId = watch('targetPersonId');
  const target = props.data.people.find((person) => person.id === targetId);
  const targets = useMemo(
    () =>
      props.data.people.filter(
        (person) =>
          !person.archivedAt &&
          ['target', 'both'].includes(person.type) &&
          Boolean(companyId) &&
          person.companyId === companyId,
      ),
    [companyId, props.data.people],
  );
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
        className="entity-form flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => props.onSubmit(props.kind!, values))}
        noValidate
      >
        {props.error && <Alert variant="danger">{props.error}</Alert>}

        {props.kind === 'company' && (
          <>
            <Field className="md:col-span-2">
              <Label htmlFor="company-name">Company name</Label>
              <Input
                id="company-name"
                {...register('name', { required: 'Company name is required' })}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="company-status">Status</Label>
                <Select id="company-status" {...register('status')} defaultValue="New">
                  <option>New</option>
                  <option>Contacted</option>
                  <option>Awaiting reply</option>
                  <option>Won</option>
                  <option>Lost</option>
                </Select>
              </Field>

              <Field>
                <Label htmlFor="company-country">Country</Label>
                <Input id="company-country" {...register('country')} />
              </Field>
            </div>

            <Field className="md:col-span-2">
              <Label htmlFor="company-sector">Sector</Label>
              <Input id="company-sector" {...register('sector')} placeholder="Industry or operating sector" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="company-contact">Primary contact</Label>
                <Input id="company-contact" {...register('contactName')} />
              </Field>

              <Field>
                <Label htmlFor="company-email">Email</Label>
                <Input id="company-email" type="email" {...register('email')} aria-invalid={Boolean(errors.email)} />
                {errors.email && <FieldError>{errors.email.message}</FieldError>}
              </Field>
            </div>
          </>
        )}

        {props.kind === 'person' && (
          <>
            <Field className="md:col-span-2">
              <Label htmlFor="person-name">Name</Label>
              <Input id="person-name" {...register('name', { required: 'Name is required' })} />
              {errors.name && <FieldError>{errors.name.message}</FieldError>}
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="person-type">Type</Label>
                <Select id="person-type" {...register('type')} defaultValue="target">
                  <option value="target">Target</option>
                  <option value="mutual">Mutual contact</option>
                  <option value="both">Both</option>
                </Select>
              </Field>

              <Field>
                <Label htmlFor="person-company">Company</Label>
                <Select id="person-company" {...register('companyId')}>
                  <option value="">Network contact</option>
                  {props.data.companies
                    .filter((company) => !company.archivedAt)
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>

            <Field className="md:col-span-2">
              <Label htmlFor="person-title">Role or relationship</Label>
              <Input id="person-title" {...register('title')} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="person-linkedin">LinkedIn URL</Label>
                <Input
                  id="person-linkedin"
                  type="url"
                  {...register('linkedinUrl')}
                  aria-invalid={Boolean(errors.linkedinUrl)}
                />
                {errors.linkedinUrl && <FieldError>{errors.linkedinUrl.message}</FieldError>}
              </Field>

              <Field>
                <Label htmlFor="person-location">Location</Label>
                <Input id="person-location" {...register('location')} />
              </Field>
            </div>
          </>
        )}

        {props.kind === 'route' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="route-company">Company</Label>
                <Select
                  id="route-company"
                  {...register('companyId', {
                    required: 'Company is required',
                    onChange: () => {
                      setValue('targetPersonId', '');
                      setValue('mutualPersonId', '');
                    },
                  })}
                  aria-invalid={Boolean(errors.companyId)}
                >
                  <option value="">Choose company</option>
                  {props.data.companies
                    .filter((company) => !company.archivedAt)
                    .map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                </Select>
                {errors.companyId && <FieldError>{errors.companyId.message}</FieldError>}
              </Field>

              <Field>
                <Label htmlFor="route-target">Target</Label>
                <Select
                  id="route-target"
                  {...register('targetPersonId', {
                    required: 'Target is required',
                    onChange: () => setValue('mutualPersonId', ''),
                  })}
                  aria-invalid={Boolean(errors.targetPersonId)}
                  disabled={!companyId}
                >
                  <option value="">Choose target</option>
                  {targets.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
                {errors.targetPersonId && <FieldError>{errors.targetPersonId.message}</FieldError>}
              </Field>

              <Field>
                <Label htmlFor="route-mutual">Mutual contact</Label>
                <Select
                  id="route-mutual"
                  {...register('mutualPersonId', { required: 'Mutual contact is required' })}
                  aria-invalid={Boolean(errors.mutualPersonId)}
                  disabled={!targetId}
                >
                  <option value="">Choose mutual</option>
                  {mutuals.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
                {errors.mutualPersonId && <FieldError>{errors.mutualPersonId.message}</FieldError>}
              </Field>

              <Field>
                <Label htmlFor="route-owner">Owner</Label>
                <Select id="route-owner" {...register('ownerId')} defaultValue="owner-unassigned">
                  {props.data.owners
                    .filter((owner) => owner.active)
                    .map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.displayName}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>

            <Field className="md:col-span-2">
              <Label htmlFor="route-nextAction">Next action</Label>
              <Input id="route-nextAction" {...register('nextAction')} placeholder="The next concrete move" />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="route-dueDate">Due date</Label>
                <Input id="route-dueDate" type="date" {...register('dueDate')} aria-invalid={Boolean(errors.dueDate)} />
                {errors.dueDate && <FieldError>{errors.dueDate.message}</FieldError>}
              </Field>

              <Field>
                <Label htmlFor="route-confidence">Confidence</Label>
                <Select id="route-confidence" {...register('confidence')} defaultValue="emerging">
                  <option value="emerging">Emerging</option>
                  <option value="promising">Promising</option>
                  <option value="strong">Strong</option>
                </Select>
              </Field>
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}
