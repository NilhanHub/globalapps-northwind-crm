import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from '../apps/api/src/auth/auth-service.js';

const dataDir = mkdtempSync(join(tmpdir(), 'northwind-e2e-'));
const companies = [
  {
    id: 'company-intelligence-demo',
    name: 'Northstar Services Demo',
    normalizedName: 'northstar services demo',
    sector: 'Environmental services',
    country: 'United Kingdom',
    status: 'New',
    contactName: '',
    email: '',
    phone: '',
    contacted: false,
    lastContactAt: '',
    activity: [],
    createdAt: '2026-07-19T00:00:00.000Z',
    createdBy: 'E2E fixture',
    workspaceId: 'default',
    version: 1,
    intel: {
      specificEvidence:
        'Dynamics 365 Finance supports 200,000-250,000 monthly invoice lines across 4,500 suppliers and about 100 legal entities.',
      commercialOpening:
        'Offer focused AP automation, supplier onboarding, acquisition integration and release-support capacity.',
      whyItMatters: 'The transaction, supplier and entity scale creates measurable optimisation work.',
      intelligenceReading: 'Position as complementary delivery capacity, not an incumbent replacement.',
      opportunityStatus: 'actionable_hypothesis',
      signalTier: 'Very strong',
      signalType: 'd365_finance_high_volume_automation',
      remainingUncertainty: ['Current incumbent capacity is not public.'],
      doNotClaim: ['Do not claim an active buying cycle without confirmation.'],
      sourceName: 'Microsoft Customer Stories',
      evidenceUrl: 'https://www.microsoft.com/en/customers/story/25289-biffa-dynamics-365-finance',
      fetchedAt: '2026-07-19T00:00:00Z',
      verifiedLive: true,
      report: { round: 5, title: 'UK & Ireland D365 round 5', pdfFilename: 'round-5.pdf' },
    },
  },
];
writeFileSync(join(dataDir, 'companies.json'), `${JSON.stringify(companies, null, 2)}\n`);
for (const store of ['people', 'routes', 'activities']) writeFileSync(join(dataDir, `${store}.json`), '[]\n');
process.env.CRM_DATA_DIR = dataDir;
process.env.CRM_USERNAME = 'northwind-e2e';
process.env.CRM_PASSWORD_SCRYPT = await hashPassword('northwind-e2e-passphrase');
process.env.HOST = '127.0.0.1';
process.env.PORT = '18791';
process.env.NODE_ENV = 'test';
await import('../apps/api/src/index.js');
