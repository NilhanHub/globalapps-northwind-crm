// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanyDetailPage } from './company-detail-page';

const baseCompany = {
  id: 'company-biffa',
  name: 'Biffa Group',
  status: 'New',
  country: 'United Kingdom',
  sector: 'Waste management',
  createdAt: '2026-01-01',
  createdBy: 'QA',
  workspaceId: 'default',
  version: 1,
  industry: '',
  contactName: '',
  email: '',
  phone: '',
  contacted: false,
  lastContactAt: '',
  activity: [],
};

function renderCompany(company: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[`/companies/${company.id as string}`]}>
      <Routes>
        <Route
          path="/companies/:id"
          element={<CompanyDetailPage companies={[company] as never} people={[]} routes={[]} activities={[]} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('CompanyDetailPage opportunity intelligence', () => {
  it('turns the stored evidence into a specific, source-linked opportunity brief', () => {
    renderCompany({
      ...baseCompany,
      intel: {
        specificEvidence:
          'D365 Finance processes 200,000-250,000 invoice lines each month across 4,500 suppliers and about 100 legal entities.',
        commercialOpening:
          'Offer AP automation, supplier onboarding, acquisition integration and release-support capacity.',
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
        report: {
          round: 5,
          title: 'UK & Ireland D365 round 5',
          pdfFilename: 'round-5.pdf',
        },
      },
    });

    expect(screen.getByRole('heading', { name: 'Opportunity intelligence' })).toBeVisible();
    expect(screen.getByText('Actionable hypothesis')).toBeVisible();
    expect(screen.getByText(/200,000-250,000 invoice lines/)).toBeVisible();
    expect(screen.getByText(/Offer AP automation/)).toBeVisible();
    expect(screen.getByText(/transaction, supplier and entity scale/)).toBeVisible();
    expect(screen.getByText(/complementary delivery capacity/)).toBeVisible();
    expect(screen.getByText('Current incumbent capacity is not public.')).toBeVisible();
    expect(screen.getByText('Do not claim an active buying cycle without confirmation.')).toBeVisible();
    expect(screen.getByText(/Round 5 · UK & Ireland D365 round 5/)).toBeVisible();

    const source = screen.getByRole('link', { name: 'Open Microsoft Customer Stories evidence' });
    expect(source).toHaveAttribute(
      'href',
      'https://www.microsoft.com/en/customers/story/25289-biffa-dynamics-365-finance',
    );
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noreferrer');
  });

  it('does not render the panel or unsafe source links when intelligence is absent or malformed', () => {
    const { rerender } = renderCompany(baseCompany);
    expect(screen.queryByRole('heading', { name: 'Opportunity intelligence' })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/companies/company-biffa']}>
        <Routes>
          <Route
            path="/companies/:id"
            element={
              <CompanyDetailPage
                companies={
                  [
                    {
                      ...baseCompany,
                      intel: {
                        specificEvidence: 'A valid evidence statement.',
                        commercialOpening: 'A valid opening.',
                        evidenceUrl: 'javascript:alert(1)',
                        sourceName: 'Unsafe source',
                      },
                    },
                  ] as never
                }
                people={[]}
                routes={[]}
                activities={[]}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Opportunity intelligence' })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Unsafe source evidence/ })).not.toBeInTheDocument();
  });
});
