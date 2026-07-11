import { describe, expect, it } from 'vitest';
import { buildResearchImportChanges, parseResearchRequest, previewResearchImport } from './research-import.js';

const now = '2026-07-11T00:00:00.000Z';
const email = `From: research@example.test
Content-Type: text/plain

Company: Acme & Sons
Target: Taylor Target
Target role: Finance Director
Target location: London
Mutual contact: Morgan Mutual
Mutual role: Advisor
Mutual LinkedIn: https://www.linkedin.com/in/morgan-mutual/
Notes: Paul already spoke with Morgan
Contacted at: 2026-07-01T09:00:00.000Z`;

describe('research import', () => {
  it('parses labelled EML research and previews deterministic creates', () => {
    const parsed = parseResearchRequest({ files: [{ filename: 'Connections at Acme.eml', content: email }] });
    expect(parsed.omissions).toEqual([]);
    expect(parsed.rows).toMatchObject([
      { companyName: 'Acme & Sons', targetName: 'Taylor Target', mutualName: 'Morgan Mutual' },
    ]);
    expect(previewResearchImport(parsed.rows, { companies: [], people: [], routes: [] })).toMatchObject({
      creates: { companies: 1, people: 2, routes: 1 },
      conflicts: [],
    });
  });

  it('is idempotent and preserves imported contact history without advancing the route', () => {
    const rows = parseResearchRequest({ files: [{ filename: 'Connections at Acme.eml', content: email }] }).rows;
    const first = buildResearchImportChanges({
      rows,
      companies: [],
      people: [],
      routes: [],
      activities: [],
      workspaceId: 'default',
      actor: 'northwind',
      importJobId: 'job-1',
      now,
    });
    expect(first.summary).toMatchObject({
      companiesCreated: 1,
      peopleCreated: 2,
      routesCreated: 1,
      activitiesCreated: 1,
    });
    expect(first.changes.routes?.[0]).toMatchObject({
      stage: 'Found route',
      researchNotes: 'Paul already spoke with Morgan',
    });
    const second = buildResearchImportChanges({
      rows,
      companies: first.changes.companies ?? [],
      people: first.changes.people ?? [],
      routes: first.changes.routes ?? [],
      activities: first.changes.activities ?? [],
      workspaceId: 'default',
      actor: 'northwind',
      importJobId: 'job-2',
      now,
    });
    expect(second.summary).toEqual({
      companiesCreated: 0,
      peopleCreated: 0,
      peopleUpdated: 0,
      routesCreated: 0,
      activitiesCreated: 0,
    });
    expect(second.changes).toMatchObject({ companies: [], people: [], routes: [], activities: [] });
  });
});
