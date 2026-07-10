// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityDialog } from './entity-dialog';

const data = {
  companies: [
    { id: 'company-a', name: 'Acme', archivedAt: '', version: 1 },
    { id: 'company-b', name: 'Beacon', archivedAt: '', version: 1 },
  ],
  people: [
    {
      id: 'target-a',
      name: 'Acme Target',
      type: 'target',
      companyId: 'company-a',
      mutualPersonIds: ['mutual-a'],
      archivedAt: '',
      version: 1,
    },
    {
      id: 'target-b',
      name: 'Beacon Target',
      type: 'target',
      companyId: 'company-b',
      mutualPersonIds: ['mutual-b'],
      archivedAt: '',
      version: 1,
    },
    {
      id: 'mutual-a',
      name: 'Acme Mutual',
      type: 'mutual',
      companyId: '',
      mutualPersonIds: [],
      archivedAt: '',
      version: 1,
    },
    {
      id: 'mutual-b',
      name: 'Beacon Mutual',
      type: 'mutual',
      companyId: '',
      mutualPersonIds: [],
      archivedAt: '',
      version: 1,
    },
  ],
  routes: [],
  activities: [],
};

afterEach(cleanup);

describe('EntityDialog', () => {
  it('limits route targets to the selected company and mutuals to the selected target', () => {
    render(
      <EntityDialog kind="route" data={data as never} busy={false} error="" onClose={vi.fn()} onSubmit={vi.fn()} />,
    );

    const company = screen.getByLabelText('Company');
    const target = screen.getByLabelText('Target');
    const mutual = screen.getByLabelText('Mutual contact');

    fireEvent.change(company, { target: { value: 'company-a' } });
    expect(within(target).getByRole('option', { name: 'Acme Target' })).toBeVisible();
    expect(within(target).queryByRole('option', { name: 'Beacon Target' })).not.toBeInTheDocument();

    fireEvent.change(target, { target: { value: 'target-a' } });
    expect(within(mutual).getByRole('option', { name: 'Acme Mutual' })).toBeVisible();
    expect(within(mutual).queryByRole('option', { name: 'Beacon Mutual' })).not.toBeInTheDocument();
  });
});
