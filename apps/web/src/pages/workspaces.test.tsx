// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CompaniesPage } from './companies-page';
import { RoutesPage } from './routes-page';
import { PeoplePage } from './people-page';
import { ArchivedPage } from './archived-page';

const companies = [
  {
    id: 'c1',
    name: 'Weetabix Food Company',
    status: 'Contacted',
    country: 'United Kingdom',
    sector: 'Food manufacturing',
    createdAt: '2026-01-01',
    createdBy: 'QA',
    workspaceId: 'default',
    version: 1,
    industry: '',
    contactName: '',
    email: '',
    phone: '',
    contacted: true,
    lastContactAt: '',
    activity: [],
  },
];
const people = [
  {
    id: 'p1',
    name: 'Paul Dunk',
    type: 'target',
    title: 'Transformation Director',
    companyId: 'c1',
    companyName: 'Weetabix Food Company',
    location: '',
    linkedinUrl: '',
    notes: '',
    mutualPersonIds: ['p2'],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    workspaceId: 'default',
    version: 1,
  },
  {
    id: 'p2',
    name: 'Siobhan Devall',
    type: 'mutual',
    title: '',
    companyId: '',
    companyName: '',
    location: '',
    linkedinUrl: '',
    notes: '',
    mutualPersonIds: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    workspaceId: 'default',
    version: 1,
  },
];
const routes = [
  {
    id: 'r1',
    companyId: 'c1',
    companyName: 'Weetabix Food Company',
    targetPersonId: 'p1',
    mutualPersonId: 'p2',
    owner: 'Jeremy',
    stage: 'Intro requested',
    confidence: 'strong',
    nextAction: 'Send context',
    dueDate: '',
    outcome: 'pending',
    notes: '',
    createdAt: '2026-01-01',
    workspaceId: 'default',
    version: 1,
  },
];

afterEach(cleanup);

describe('CRM workspaces', () => {
  it('renders a searchable company command surface', () => {
    render(
      <MemoryRouter>
        <CompaniesPage companies={companies as never} routes={routes as never} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Companies' })).toBeVisible();
    expect(screen.getByText('Weetabix Food Company')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'Search companies' })).toBeVisible();
  });

  it('renders relationship routes in their stage with target and mutual context', () => {
    render(
      <MemoryRouter>
        <RoutesPage companies={companies as never} people={people as never} routes={routes as never} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Routes' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Paul Dunk' })).toBeVisible();
    expect(screen.getAllByText('Siobhan Devall')[0]).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Intro requested' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Select route for Paul Dunk' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Move Paul Dunk to another stage' })).toBeVisible();
  });

  it('exposes person relationship management from the directory', async () => {
    render(
      <MemoryRouter>
        <PeoplePage companies={companies as never} people={people as never} routes={routes as never} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Manage Paul Dunk' }));
    expect(await screen.findByRole('dialog', { name: 'Manage Paul Dunk' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Siobhan Devall' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Archive person' })).toBeVisible();
  });

  it('provides an explicit restore action for archived records', () => {
    render(
      <MemoryRouter>
        <ArchivedPage
          companies={[{ ...companies[0], archivedAt: '2026-07-01', archiveReason: 'Paused' }] as never}
          people={[]}
          routes={[]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Restore Weetabix Food Company' })).toBeVisible();
  });
});
