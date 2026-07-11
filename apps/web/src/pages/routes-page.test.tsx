// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Company, Person, Route } from '@northwind/domain';
import { RoutesPage } from './routes-page';

vi.mock('../api', () => ({ api: { request: vi.fn(async () => ({})) } }));

const now = '2026-07-11T00:00:00.000Z';
const company = { id: 'c1', name: 'Acme', createdAt: now, workspaceId: 'default', version: 1 } as Company;
const people = [
  {
    id: 't1',
    name: 'Taylor Target',
    type: 'target',
    companyId: 'c1',
    mutualPersonIds: ['m1', 'm2'],
    createdAt: now,
    updatedAt: now,
    workspaceId: 'default',
    version: 1,
  },
  {
    id: 'm1',
    name: 'Morgan One',
    type: 'mutual',
    mutualPersonIds: [],
    createdAt: now,
    updatedAt: now,
    workspaceId: 'default',
    version: 1,
  },
  {
    id: 'm2',
    name: 'Morgan Two',
    type: 'mutual',
    mutualPersonIds: [],
    createdAt: now,
    updatedAt: now,
    workspaceId: 'default',
    version: 1,
  },
] as Person[];
const routes = [
  {
    id: 'r1',
    companyId: 'c1',
    companyName: 'Acme',
    targetPersonId: 't1',
    mutualPersonId: 'm1',
    owner: 'Paul',
    stage: 'Found route',
    confidence: 'emerging',
    nextAction: '',
    dueDate: '',
    outcome: 'pending',
    notes: '',
    createdAt: now,
    workspaceId: 'default',
    version: 1,
  },
  {
    id: 'r2',
    companyId: 'c1',
    companyName: 'Acme',
    targetPersonId: 't1',
    mutualPersonId: 'm2',
    owner: 'Jeremy',
    stage: 'Intro agreed',
    confidence: 'promising',
    nextAction: '',
    dueDate: '',
    outcome: 'pending',
    notes: '',
    createdAt: now,
    workspaceId: 'default',
    version: 1,
  },
] as Route[];

describe('RoutesPage target clusters', () => {
  it('defaults to one target cluster at its most advanced path stage and can reveal individual paths', () => {
    render(
      <MemoryRouter>
        <RoutesPage companies={[company]} people={people} routes={routes} />
      </MemoryRouter>,
    );
    const agreed = screen.getByRole('region', { name: 'Intro agreed routes' });
    expect(within(agreed).getByText('Taylor Target')).toBeInTheDocument();
    expect(screen.getAllByText('Taylor Target')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /show 2 mutual paths/i }));
    expect(screen.getByText('Morgan One')).toBeInTheDocument();
    expect(screen.getByText('Morgan Two')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /individual paths/i }));
    expect(screen.getAllByLabelText(/open route for taylor target/i)).toHaveLength(2);
  });
});
