import { z } from 'zod';

export const WORKSPACE_DEFAULT = 'default';

export const ownerSchema = z.enum(['Paul', 'Jeremy', 'Nilhan', 'other', 'unassigned']);
export const routeStageSchema = z.enum([
  'Found route',
  'Mutual friend to contact',
  'Intro requested',
  'Intro agreed',
  'Target contacted',
  'Meeting / reply',
  'Won',
  'Dead / no route',
]);
export const confidenceSchema = z.enum(['emerging', 'promising', 'strong']);
export const outcomeSchema = z.enum(['pending', 'won', 'dead']);
const optionalDateSchema = z.string().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid ISO date (YYYY-MM-DD)');

const scopedFields = {
  workspaceId: z.string().min(1).default(WORKSPACE_DEFAULT),
  version: z.number().int().positive().default(1),
};

export const companySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    industry: z.string().default(''),
    size: z.number().nullable().optional(),
    country: z.string().default(''),
    sector: z.string().default(''),
    status: z.enum(['New', 'Contacted', 'Awaiting reply', 'Won', 'Lost']).default('New'),
    contactName: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().default(''),
    contacted: z.boolean().default(false),
    nextStep: z.object({ type: z.enum(['email', 'call']), note: z.string() }).optional(),
    lastContactAt: z.string().default(''),
    activity: z.array(z.record(z.string(), z.unknown())).default([]),
    createdAt: z.string().min(1),
    createdBy: z.string().default('Manual update'),
    archivedAt: z.string().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    archiveOperationId: z.string().optional(),
    ...scopedFields,
  })
  .passthrough();

export const personSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    title: z.string().default(''),
    companyId: z.string().default(''),
    companyName: z.string().default(''),
    location: z.string().default(''),
    linkedinUrl: z.string().default(''),
    type: z.enum(['target', 'mutual', 'both']),
    notes: z.string().default(''),
    mutualPersonIds: z.array(z.string()).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    archivedAt: z.string().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    archiveOperationId: z.string().optional(),
    mergedIntoPersonId: z.string().optional(),
    ...scopedFields,
  })
  .passthrough();

export const routeSchema = z
  .object({
    id: z.string().min(1),
    companyId: z.string().min(1),
    companyName: z.string().default(''),
    targetPersonId: z.string().min(1),
    mutualPersonId: z.string().min(1),
    owner: ownerSchema,
    stage: routeStageSchema,
    confidence: confidenceSchema,
    nextAction: z.string().default(''),
    dueDate: optionalDateSchema.default(''),
    outcome: outcomeSchema,
    notes: z.string().default(''),
    createdAt: z.string().min(1),
    updatedAt: z.string().optional(),
    archivedAt: z.string().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    archiveOperationId: z.string().optional(),
    ...scopedFields,
  })
  .passthrough();

export const activitySchema = z
  .object({
    id: z.string().min(1),
    routeId: z.string().default(''),
    companyId: z.string().default(''),
    actor: z.string().min(1),
    type: z.string().min(1),
    summary: z.string().min(1),
    details: z.string().default(''),
    reason: z.string().default(''),
    timestamp: z.string().min(1),
    ...scopedFields,
  })
  .passthrough();

export type Company = z.infer<typeof companySchema>;
export type Person = z.infer<typeof personSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type RouteOwner = z.infer<typeof ownerSchema>;
export type RouteStage = z.infer<typeof routeStageSchema>;

export type RequestContext = {
  actor: string;
  authType: 'session' | 'agent' | 'test';
  workspaceId: string;
  requestId: string;
};

export class DomainValidationError extends Error {
  readonly code = 'VALIDATION_ERROR';
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export class DuplicateActiveRouteError extends Error {
  readonly code = 'DUPLICATE_ROUTE';
  constructor() {
    super('An active route already exists for this target and mutual contact');
  }
}

export function normalizeRecordScope<T extends Record<string, unknown>>(
  record: T,
): T & { workspaceId: string; version: number } {
  return {
    ...record,
    workspaceId: typeof record.workspaceId === 'string' && record.workspaceId ? record.workspaceId : WORKSPACE_DEFAULT,
    version: typeof record.version === 'number' && record.version > 0 ? record.version : 1,
  };
}

export function prepareCompany(input: Record<string, unknown>, options: { id: string; now: string; actor: string }) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new DomainValidationError('Company name is required', 'name');
  const nextStep =
    input.nextStep && typeof input.nextStep === 'object' ? (input.nextStep as Record<string, unknown>) : {};
  return companySchema.parse({
    ...input,
    id: options.id,
    name,
    industry: String(input.industry ?? '').trim(),
    size: input.size === '' || input.size == null ? null : Number(input.size),
    country: String(input.country ?? '').trim(),
    sector: String(input.sector ?? '').trim(),
    contactName: String(input.contactName ?? '').trim(),
    email: String(input.email ?? '').trim(),
    phone: String(input.phone ?? '').trim(),
    contacted: Boolean(input.contacted ?? false),
    nextStep: { type: nextStep.type === 'call' ? 'call' : 'email', note: String(nextStep.note ?? '').trim() },
    lastContactAt: '',
    activity: [],
    createdAt: options.now,
    createdBy: options.actor,
  });
}

export function preparePerson(
  input: Record<string, unknown>,
  options: { id: string; now: string; companies: Company[]; people: Person[] },
) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new DomainValidationError('Person name is required', 'name');
  const type = String(input.type ?? 'target');
  if (!['target', 'mutual', 'both'].includes(type)) throw new DomainValidationError('Person type is invalid', 'type');
  const companyId = String(input.companyId ?? '').trim();
  const company = companyId ? options.companies.find((item) => item.id === companyId && !item.archivedAt) : undefined;
  if (companyId && !company) throw new DomainValidationError('companyId must reference an active company', 'companyId');
  const mutualPersonIds = Array.isArray(input.mutualPersonIds) ? [...new Set(input.mutualPersonIds.map(String))] : [];
  for (const id of mutualPersonIds) {
    const mutual = options.people.find(
      (item) => item.id === id && !item.archivedAt && ['mutual', 'both'].includes(item.type),
    );
    if (!mutual) throw new DomainValidationError(`Invalid mutual contact: ${id}`, 'mutualPersonIds');
  }
  return personSchema.parse({
    ...input,
    id: options.id,
    name,
    type,
    companyId,
    companyName: company?.name ?? '',
    title: String(input.title ?? ''),
    location: String(input.location ?? ''),
    linkedinUrl: String(input.linkedinUrl ?? ''),
    notes: String(input.notes ?? ''),
    mutualPersonIds: ['target', 'both'].includes(type) ? mutualPersonIds : [],
    createdAt: options.now,
    updatedAt: options.now,
  });
}

export function prepareRoute(
  input: Record<string, unknown>,
  options: { id: string; now: string; companies: Company[]; people: Person[]; routes: Route[] },
) {
  const company = options.companies.find((item) => item.id === input.companyId && !item.archivedAt);
  const target = options.people.find(
    (item) => item.id === input.targetPersonId && !item.archivedAt && ['target', 'both'].includes(item.type),
  );
  const mutual = options.people.find(
    (item) => item.id === input.mutualPersonId && !item.archivedAt && ['mutual', 'both'].includes(item.type),
  );
  if (!company) throw new DomainValidationError('companyId must reference an active company', 'companyId');
  if (!target) throw new DomainValidationError('targetPersonId must reference an active target', 'targetPersonId');
  if (!mutual)
    throw new DomainValidationError('mutualPersonId must reference an active mutual contact', 'mutualPersonId');
  if (target.companyId && target.companyId !== company.id)
    throw new DomainValidationError('Target belongs to a different company', 'targetPersonId');
  if (!target.mutualPersonIds.includes(mutual.id))
    throw new DomainValidationError('Mutual contact must be linked to the target first', 'mutualPersonId');
  const duplicate = options.routes.find(
    (route) =>
      !route.archivedAt &&
      !['Won', 'Dead / no route'].includes(route.stage) &&
      route.targetPersonId === target.id &&
      route.mutualPersonId === mutual.id,
  );
  if (duplicate) throw new DuplicateActiveRouteError();
  return routeSchema.parse({
    ...input,
    id: options.id,
    companyId: company.id,
    companyName: company.name,
    targetPersonId: target.id,
    mutualPersonId: mutual.id,
    owner: input.owner ?? 'unassigned',
    stage: input.stage ?? 'Found route',
    confidence: input.confidence ?? 'emerging',
    nextAction: String(input.nextAction ?? ''),
    dueDate: String(input.dueDate ?? ''),
    outcome: input.outcome ?? 'pending',
    notes: String(input.notes ?? ''),
    createdAt: options.now,
    updatedAt: options.now,
  });
}

export function createRouteActivity(input: {
  id: string;
  route: Route;
  actor: string;
  type: string;
  summary: string;
  now: string;
  previousState?: Record<string, unknown>;
  resultingState?: Record<string, unknown>;
  details?: string;
  reason?: string;
}) {
  return activitySchema.parse({
    id: input.id,
    routeId: input.route.id,
    companyId: input.route.companyId,
    actor: input.actor,
    type: input.type,
    summary: input.summary,
    details: input.details ?? '',
    reason: input.reason ?? '',
    timestamp: input.now,
    ...(input.previousState ? { previousState: input.previousState } : {}),
    ...(input.resultingState ? { resultingState: input.resultingState } : {}),
  });
}
