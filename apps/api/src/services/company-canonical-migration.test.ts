import { describe, expect, it } from 'vitest';
import { planCompanyCanonicalRepairs } from './company-canonical-migration.js';

describe('company canonical-field migration', () => {
  const now = '2026-07-19T10:00:00.000Z';

  it('repairs a null contact date and stale normalized name in one versioned update', () => {
    const repairs = planCompanyCanonicalRepairs(
      [
        {
          id: 'dominos',
          name: "Domino's Pizza UK & Ireland",
          normalizedName: 'domino s pizza uk and ireland',
          lastContactAt: null,
          createdAt: '2026-07-16T00:00:00.000Z',
          workspaceId: 'default',
          version: 1,
        },
      ],
      now,
    );

    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      reasons: ['null_last_contact', 'stale_normalized_name'],
      expectedVersion: 1,
      record: {
        id: 'dominos',
        normalizedName: 'dominos pizza uk and ireland',
        lastContactAt: '',
        updatedAt: now,
        version: 2,
      },
    });
  });

  it('is a no-op for an already canonical company', () => {
    expect(
      planCompanyCanonicalRepairs(
        [
          {
            id: 'northstar',
            name: 'Northstar Components',
            normalizedName: 'northstar components',
            lastContactAt: '',
            createdAt: '2026-07-16T00:00:00.000Z',
            workspaceId: 'default',
            version: 3,
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
});
