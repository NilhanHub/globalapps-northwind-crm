import { describe, expect, it } from 'vitest';
import {
  auditWorkspaceData,
  canonicalize,
  companySchema,
  deriveRouteReminders,
  normalizeIdentity,
  normalizeLinkedIn,
  normalizeRecordScope,
  routeSchema,
} from './index';

describe('domain schemas', () => {
  it('maps legacy records into the default workspace and version', () => {
    expect(normalizeRecordScope({ id: 'company-1', name: 'Acme' })).toMatchObject({
      workspaceId: 'default',
      version: 1,
    });
  });

  it('rejects invalid company records with field-level issues', () => {
    const result = companySchema.safeParse({ id: '', name: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.name).toBeDefined();
  });

  it('normalizes a legacy null last-contact value without rejecting the workspace', () => {
    expect(
      companySchema.parse({
        id: 'company-legacy-null-contact',
        name: 'Legacy company',
        createdAt: '2026-07-16T00:00:00.000Z',
        lastContactAt: null,
      }).lastContactAt,
    ).toBe('');
  });

  it('accepts every supported route owner and stage', () => {
    const result = routeSchema.safeParse({
      id: 'route-1',
      companyId: 'company-1',
      targetPersonId: 'target-1',
      mutualPersonId: 'mutual-1',
      owner: 'Jeremy',
      stage: 'Found route',
      confidence: 'emerging',
      outcome: 'pending',
      nextAction: '',
      dueDate: '',
      notes: '',
      createdAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe('data integrity and identity utilities', () => {
  it('normalizes names and LinkedIn identities deterministically', () => {
    expect(normalizeIdentity('  O’Callaghan & Sons  ')).toBe('ocallaghan and sons');
    expect(normalizeLinkedIn('https://www.linkedin.com/in/Jane-Doe/?trk=profile')).toBe('linkedin.com/in/jane-doe');
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });

  it('reports duplicates and every relationship break without changing data', () => {
    const now = '2026-07-11T00:00:00.000Z';
    const companies = [
      companySchema.parse({ id: 'c1', name: 'Acme', createdAt: now }),
      companySchema.parse({ id: 'c2', name: ' ACME ', createdAt: now }),
    ];
    const people = [
      {
        id: 'p1',
        name: 'Target',
        type: 'target' as const,
        companyId: 'missing',
        mutualPersonIds: ['missing-mutual'],
        createdAt: now,
        updatedAt: now,
      },
    ];
    const routes = [
      {
        id: 'r1',
        companyId: 'missing',
        targetPersonId: 'missing-target',
        mutualPersonId: 'missing-mutual',
        owner: 'unassigned' as const,
        stage: 'Found route' as const,
        confidence: 'emerging' as const,
        outcome: 'pending' as const,
        createdAt: now,
      },
    ];
    const report = auditWorkspaceData({ companies, people, routes, activities: [] });
    expect(report.ok).toBe(false);
    expect(report.duplicates.companies).toHaveLength(1);
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'BROKEN_PERSON_COMPANY',
        'BROKEN_MUTUAL_LINK',
        'BROKEN_ROUTE_COMPANY',
        'BROKEN_ROUTE_TARGET',
      ]),
    );
  });
});

describe('shared reminders', () => {
  it('derives overdue, setup, awaiting-response and stale reminders in Europe/London', () => {
    const now = new Date('2026-07-11T12:00:00.000Z');
    const route = routeSchema.parse({
      id: 'route-reminder',
      companyId: 'company-1',
      targetPersonId: 'target-1',
      mutualPersonId: 'mutual-1',
      owner: 'unassigned',
      stage: 'Intro requested',
      confidence: 'emerging',
      outcome: 'pending',
      dueDate: '2026-07-01',
      nextAction: '',
      notes: '',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(deriveRouteReminders({ routes: [route], activities: [], now }).map((item) => item.category)).toEqual([
      'overdue',
      'awaiting_response',
      'stale',
      'setup_incomplete',
    ]);
  });

  it('hides terminal, archived and actively snoozed routes', () => {
    const base = routeSchema.parse({
      id: 'route-hidden',
      companyId: 'company-1',
      targetPersonId: 'target-1',
      mutualPersonId: 'mutual-1',
      owner: 'Paul',
      stage: 'Found route',
      confidence: 'emerging',
      outcome: 'pending',
      dueDate: '2020-01-01',
      nextAction: 'Follow up',
      notes: '',
      createdAt: '2020-01-01T00:00:00.000Z',
      reminderSnoozedUntil: '2026-07-12T12:00:00.000Z',
    });
    expect(deriveRouteReminders({ routes: [base], activities: [], now: new Date('2026-07-11T12:00:00Z') })).toEqual([]);
  });

  it('uses the London calendar date across the daylight-saving boundary', () => {
    const route = routeSchema.parse({
      id: 'route-bst',
      companyId: 'company-1',
      targetPersonId: 'target-1',
      mutualPersonId: 'mutual-1',
      owner: 'Paul',
      stage: 'Found route',
      confidence: 'emerging',
      outcome: 'pending',
      dueDate: '2026-03-30',
      nextAction: 'Follow up',
      notes: '',
      createdAt: '2026-03-29T22:00:00.000Z',
    });
    const categories = deriveRouteReminders({
      routes: [route],
      activities: [],
      now: new Date('2026-03-29T23:30:00.000Z'),
    }).map((item) => item.category);
    expect(categories).toContain('due_today');
    expect(categories).not.toContain('overdue');
  });
});
