import { describe, expect, it } from 'vitest';
import { companySchema, normalizeRecordScope, routeSchema } from './index';

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
