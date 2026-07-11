import { z } from 'zod';
import { normalizeIdentity, normalizeLinkedIn } from './integrity.js';

export * from './integrity.js';

export const WORKSPACE_DEFAULT = 'default';

export const OWNER_IDS = {
  paul: 'owner-paul',
  jeremy: 'owner-jeremy',
  nilhan: 'owner-nilhan',
  other: 'owner-other',
  unassigned: 'owner-unassigned',
} as const;

export const ownerSchema = z.string().trim().min(1).max(80);
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
export const sourceReferenceSchema = z.object({
  type: z.enum(['email', 'csv', 'manual', 'api', 'migration']),
  filename: z.string().min(1),
  sourceHash: z.string().min(8),
  importedAt: z.string().min(1),
  importJobId: z.string().min(1),
  row: z.number().int().positive().optional(),
});
const optionalDateSchema = z.string().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid ISO date (YYYY-MM-DD)');
export const interactionSchema = z.object({
  contactPersonId: z.string().min(1),
  channel: z.enum(['call', 'email', 'linkedin', 'message', 'meeting', 'other']),
  outcome: z.string().trim().min(1),
  occurredAt: z.string().min(1),
  notes: z.string().default(''),
  nextAction: z.string().default(''),
  followUpDate: optionalDateSchema.optional(),
});

const scopedFields = {
  workspaceId: z.string().min(1).default(WORKSPACE_DEFAULT),
  version: z.number().int().positive().default(1),
};

export const companySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1),
    normalizedName: z.string().optional(),
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
    normalizedName: z.string().optional(),
    title: z.string().default(''),
    companyId: z.string().default(''),
    companyName: z.string().default(''),
    location: z.string().default(''),
    linkedinUrl: z.string().default(''),
    normalizedLinkedInKey: z.string().optional(),
    sourceIdentityKey: z.string().optional(),
    sourceReferences: z.array(sourceReferenceSchema).optional(),
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
    ownerId: z.string().min(1).optional(),
    stage: routeStageSchema,
    confidence: confidenceSchema,
    nextAction: z.string().default(''),
    dueDate: optionalDateSchema.default(''),
    outcome: outcomeSchema,
    notes: z.string().default(''),
    researchNotes: z.string().optional(),
    reminderSnoozedUntil: z.string().datetime().optional(),
    reminderSnoozeReason: z.string().max(500).optional(),
    sourceIdentityKey: z.string().optional(),
    sourceReferences: z.array(sourceReferenceSchema).optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().optional(),
    archivedAt: z.string().optional(),
    archivedBy: z.string().optional(),
    archiveReason: z.string().optional(),
    archiveOperationId: z.string().optional(),
    ...scopedFields,
  })
  .passthrough()
  .transform((route) => ({
    ...route,
    ownerId: route.ownerId ?? ownerIdForLegacyName(route.owner) ?? OWNER_IDS.unassigned,
  }));

export const ownerProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  normalizedName: z.string().min(1),
  active: z.boolean().default(true),
  system: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  ...scopedFields,
});

export const workspaceSettingsSchema = z.object({
  id: z.literal('settings'),
  timezone: z.literal('Europe/London').default('Europe/London'),
  staleAfterDays: z.number().int().min(1).max(90).default(7),
  awaitingReplyAfterDays: z.number().int().min(1).max(30).default(3),
  reminderSnoozeMaxDays: z.number().int().min(1).max(30).default(30),
  updatedAt: z.string().min(1),
  ...scopedFields,
});

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
    occurredAt: z.string().optional(),
    interaction: interactionSchema.optional(),
    ...scopedFields,
  })
  .passthrough();

export const importJobSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('research'),
    status: z.enum(['previewed', 'running', 'interrupted', 'completed', 'failed']),
    sourceHashes: z.array(z.string()).default([]),
    rows: z.array(z.record(z.string(), z.unknown())).default([]),
    progress: z.object({ processed: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
    summary: z.record(z.string(), z.number()).default({}),
    resultIds: z
      .object({
        companies: z.array(z.string()),
        people: z.array(z.string()),
        routes: z.array(z.string()),
        activities: z.array(z.string()),
      })
      .optional(),
    error: z.string().optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    completedAt: z.string().optional(),
    actor: z.string().min(1),
    ...scopedFields,
  })
  .passthrough();

export type Company = z.infer<typeof companySchema>;
export type Person = z.infer<typeof personSchema>;
export type Route = z.infer<typeof routeSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type OwnerProfile = z.infer<typeof ownerProfileSchema>;
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;
export type RouteOwner = z.infer<typeof ownerSchema>;
export type RouteStage = z.infer<typeof routeStageSchema>;

export type ReminderCategory = 'overdue' | 'due_today' | 'awaiting_response' | 'stale' | 'setup_incomplete';
export type RouteReminder = { routeId: string; category: ReminderCategory; occurredAt: string; summary: string };

export function defaultOwnerProfiles(now: string, workspaceId = WORKSPACE_DEFAULT): OwnerProfile[] {
  const entries: Array<[string, string, boolean]> = [
    [OWNER_IDS.paul, 'Paul', false],
    [OWNER_IDS.jeremy, 'Jeremy', false],
    [OWNER_IDS.nilhan, 'Nilhan', false],
    [OWNER_IDS.other, 'Other', true],
    [OWNER_IDS.unassigned, 'Unassigned', true],
  ];
  return entries.map(([id, displayName, system], sortOrder) =>
    ownerProfileSchema.parse({
      id,
      displayName,
      normalizedName: normalizeIdentity(displayName),
      active: true,
      system,
      sortOrder,
      createdAt: now,
      updatedAt: now,
      workspaceId,
    }),
  );
}

export function ownerIdForLegacyName(value: string) {
  const normalized = normalizeIdentity(value || 'unassigned');
  const match = defaultOwnerProfiles('1970-01-01T00:00:00.000Z').find((owner) => owner.normalizedName === normalized);
  return match?.id;
}

function dateInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function deriveRouteReminders(input: {
  routes: Route[];
  activities: Activity[];
  now?: Date;
  settings?: Partial<WorkspaceSettings>;
}): RouteReminder[] {
  const now = input.now ?? new Date();
  const timezone = input.settings?.timezone ?? 'Europe/London';
  const today = dateInTimezone(now, timezone);
  const staleMs = (input.settings?.staleAfterDays ?? 7) * 86_400_000;
  const awaitingMs = (input.settings?.awaitingReplyAfterDays ?? 3) * 86_400_000;
  const latestByRoute = new Map<string, string>();
  for (const activity of input.activities) {
    if (!activity.routeId) continue;
    const current = latestByRoute.get(activity.routeId) ?? '';
    if (activity.timestamp > current) latestByRoute.set(activity.routeId, activity.timestamp);
  }
  const reminders: RouteReminder[] = [];
  for (const route of input.routes) {
    if (route.archivedAt || route.outcome !== 'pending' || ['Won', 'Dead / no route'].includes(route.stage)) continue;
    if (route.reminderSnoozedUntil && Date.parse(route.reminderSnoozedUntil) > now.getTime()) continue;
    const last = latestByRoute.get(route.id) || route.updatedAt || route.createdAt;
    const age = Math.max(0, now.getTime() - Date.parse(last));
    if (route.dueDate && route.dueDate < today)
      reminders.push({
        routeId: route.id,
        category: 'overdue',
        occurredAt: route.dueDate,
        summary: 'Follow-up is overdue',
      });
    else if (route.dueDate === today)
      reminders.push({
        routeId: route.id,
        category: 'due_today',
        occurredAt: route.dueDate,
        summary: 'Follow-up is due today',
      });
    if (route.ownerId === OWNER_IDS.unassigned || route.owner === 'unassigned' || !route.dueDate || !route.nextAction)
      reminders.push({
        routeId: route.id,
        category: 'setup_incomplete',
        occurredAt: route.createdAt,
        summary: 'Owner, due date or next action is missing',
      });
    if (['Intro requested', 'Target contacted'].includes(route.stage) && age >= awaitingMs)
      reminders.push({
        routeId: route.id,
        category: 'awaiting_response',
        occurredAt: last,
        summary: 'A response is still pending',
      });
    if (age >= staleMs)
      reminders.push({
        routeId: route.id,
        category: 'stale',
        occurredAt: last,
        summary: 'No activity has been recorded recently',
      });
  }
  const priority: ReminderCategory[] = ['overdue', 'due_today', 'awaiting_response', 'stale', 'setup_incomplete'];
  return reminders.sort(
    (left, right) =>
      priority.indexOf(left.category) - priority.indexOf(right.category) || left.routeId.localeCompare(right.routeId),
  );
}

export type RequestContext = {
  actor: string;
  authType: 'session' | 'agent' | 'test';
  workspaceId: string;
  requestId: string;
  agentKeyId?: string;
  permissions?: Array<'read' | 'write'>;
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

export class DuplicateIdentityError extends Error {
  readonly code = 'DUPLICATE_IDENTITY';
  readonly statusCode = 409;
  constructor(
    message: string,
    readonly matches: Array<{ id: string; name: string; type?: string }>,
  ) {
    super(message);
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
    normalizedName: normalizeIdentity(name),
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
  const linkedinUrl = String(input.linkedinUrl ?? '').trim();
  const normalizedName = normalizeIdentity(name);
  const normalizedLinkedInKey = normalizeLinkedIn(linkedinUrl);
  const compatible = (existingType: string) => existingType === type || existingType === 'both' || type === 'both';
  const matches = options.people.filter(
    (person) =>
      !person.archivedAt &&
      ((normalizedLinkedInKey && normalizeLinkedIn(person.linkedinUrl) === normalizedLinkedInKey) ||
        (normalizeIdentity(person.name) === normalizedName &&
          person.companyId === companyId &&
          compatible(person.type))),
  );
  if (matches.length)
    throw new DuplicateIdentityError(
      'A matching person already exists. Review the existing record or merge it instead.',
      matches.map((person) => ({ id: person.id, name: person.name, type: person.type })),
    );
  return personSchema.parse({
    ...input,
    id: options.id,
    name,
    normalizedName,
    type,
    companyId,
    companyName: company?.name ?? '',
    title: String(input.title ?? ''),
    location: String(input.location ?? ''),
    linkedinUrl,
    normalizedLinkedInKey: normalizedLinkedInKey || undefined,
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
    ownerId: input.ownerId ?? ownerIdForLegacyName(String(input.owner ?? 'unassigned')) ?? OWNER_IDS.unassigned,
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
  occurredAt?: string;
  interaction?: unknown;
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
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.interaction ? { interaction: input.interaction } : {}),
    ...(input.previousState ? { previousState: input.previousState } : {}),
    ...(input.resultingState ? { resultingState: input.resultingState } : {}),
  });
}
