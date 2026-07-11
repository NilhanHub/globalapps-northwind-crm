export type IntegrityIssue = {
  code: string;
  store: 'companies' | 'people' | 'routes' | 'activities';
  recordId: string;
  field: string;
  reference?: string;
  message: string;
};

type AnyRecord = Record<string, unknown>;

export function normalizeIdentity(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeLinkedIn(value: string) {
  if (!value.trim()) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '').toLowerCase();
    return host === 'linkedin.com' ? `${host}${path}` : '';
  } catch {
    return '';
  }
}

export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as AnyRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function active(record: AnyRecord) {
  return !record.archivedAt;
}

function duplicateGroups(records: AnyRecord[], key: (record: AnyRecord) => string) {
  const groups = new Map<string, string[]>();
  for (const record of records.filter(active)) {
    const identity = key(record);
    if (!identity) continue;
    const ids = groups.get(identity) ?? [];
    ids.push(String(record.id));
    groups.set(identity, ids);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([identity, ids]) => ({ identity, ids }))
    .sort((left, right) => left.identity.localeCompare(right.identity));
}

export function auditWorkspaceData(input: {
  companies: AnyRecord[];
  people: AnyRecord[];
  routes: AnyRecord[];
  activities: AnyRecord[];
  workspaceId?: string;
}) {
  const workspaceId = input.workspaceId ?? 'default';
  const issues: IntegrityIssue[] = [];
  const companyIds = new Set(input.companies.map((record) => String(record.id)));
  const peopleById = new Map(input.people.map((record) => [String(record.id), record]));
  const routeIds = new Set(input.routes.map((record) => String(record.id)));
  const stores = ['companies', 'people', 'routes', 'activities'] as const;

  const add = (issue: IntegrityIssue) => issues.push(issue);
  for (const store of stores) {
    const records = input[store];
    for (const record of records) {
      const id = String(record.id ?? '');
      if (!id) add({ code: 'MISSING_ID', store, recordId: '', field: 'id', message: 'Record has no identifier' });
      if (String(record.workspaceId ?? 'default') !== workspaceId)
        add({
          code: 'WORKSPACE_SCOPE_MISMATCH',
          store,
          recordId: id,
          field: 'workspaceId',
          reference: String(record.workspaceId ?? ''),
          message: `Record is outside workspace ${workspaceId}`,
        });
      if (!Number.isInteger(record.version) || Number(record.version) < 1)
        add({ code: 'INVALID_VERSION', store, recordId: id, field: 'version', message: 'Version must be positive' });
    }
  }

  for (const person of input.people) {
    const id = String(person.id);
    const companyId = String(person.companyId ?? '');
    if (companyId && !companyIds.has(companyId))
      add({
        code: 'BROKEN_PERSON_COMPANY',
        store: 'people',
        recordId: id,
        field: 'companyId',
        reference: companyId,
        message: 'Person references a missing company',
      });
    for (const mutualId of Array.isArray(person.mutualPersonIds) ? person.mutualPersonIds.map(String) : []) {
      const mutual = peopleById.get(mutualId);
      if (!mutual || !['mutual', 'both'].includes(String(mutual.type)))
        add({
          code: 'BROKEN_MUTUAL_LINK',
          store: 'people',
          recordId: id,
          field: 'mutualPersonIds',
          reference: mutualId,
          message: 'Target references a missing or incompatible mutual contact',
        });
    }
  }

  for (const route of input.routes) {
    const id = String(route.id);
    const companyId = String(route.companyId ?? '');
    const targetId = String(route.targetPersonId ?? '');
    const mutualId = String(route.mutualPersonId ?? '');
    if (!companyIds.has(companyId))
      add({
        code: 'BROKEN_ROUTE_COMPANY',
        store: 'routes',
        recordId: id,
        field: 'companyId',
        reference: companyId,
        message: 'Route references a missing company',
      });
    const target = peopleById.get(targetId);
    if (!target || !['target', 'both'].includes(String(target.type)))
      add({
        code: 'BROKEN_ROUTE_TARGET',
        store: 'routes',
        recordId: id,
        field: 'targetPersonId',
        reference: targetId,
        message: 'Route references a missing or incompatible target',
      });
    const mutual = peopleById.get(mutualId);
    if (!mutual || !['mutual', 'both'].includes(String(mutual.type)))
      add({
        code: 'BROKEN_ROUTE_MUTUAL',
        store: 'routes',
        recordId: id,
        field: 'mutualPersonId',
        reference: mutualId,
        message: 'Route references a missing or incompatible mutual contact',
      });
    if (target && String(target.companyId ?? '') && String(target.companyId) !== companyId)
      add({
        code: 'ROUTE_COMPANY_MISMATCH',
        store: 'routes',
        recordId: id,
        field: 'companyId',
        reference: companyId,
        message: 'Route company differs from target company',
      });
    if (target && !((target.mutualPersonIds as unknown[]) ?? []).map(String).includes(mutualId))
      add({
        code: 'ROUTE_LINK_MISSING',
        store: 'routes',
        recordId: id,
        field: 'mutualPersonId',
        reference: mutualId,
        message: 'Route mutual is not linked to its target',
      });
  }

  for (const activity of input.activities) {
    const routeId = String(activity.routeId ?? '');
    const companyId = String(activity.companyId ?? '');
    if (routeId && !routeIds.has(routeId))
      add({
        code: 'BROKEN_ACTIVITY_ROUTE',
        store: 'activities',
        recordId: String(activity.id),
        field: 'routeId',
        reference: routeId,
        message: 'Activity references a missing route',
      });
    if (companyId && !companyIds.has(companyId))
      add({
        code: 'BROKEN_ACTIVITY_COMPANY',
        store: 'activities',
        recordId: String(activity.id),
        field: 'companyId',
        reference: companyId,
        message: 'Activity references a missing company',
      });
  }

  const duplicates = {
    companies: duplicateGroups(input.companies, (record) => normalizeIdentity(String(record.name ?? ''))),
    people: duplicateGroups(input.people, (record) => {
      const linkedin = normalizeLinkedIn(String(record.linkedinUrl ?? ''));
      return linkedin || `${normalizeIdentity(String(record.name ?? ''))}|${String(record.companyId ?? '')}`;
    }),
    activeRoutes: duplicateGroups(
      input.routes.filter((route) => !['Won', 'Dead / no route'].includes(String(route.stage))),
      (record) => `${String(record.targetPersonId ?? '')}|${String(record.mutualPersonId ?? '')}`,
    ),
  };
  issues.sort((left, right) =>
    `${left.store}:${left.recordId}:${left.code}`.localeCompare(`${right.store}:${right.recordId}:${right.code}`),
  );
  return {
    ok: issues.length === 0 && Object.values(duplicates).every((groups) => groups.length === 0),
    workspaceId,
    counts: Object.fromEntries(stores.map((store) => [store, input[store].length])) as Record<
      (typeof stores)[number],
      number
    >,
    issues,
    duplicates,
  };
}
