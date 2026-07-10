// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { RouteDetailPage } from './route-detail-page';

const data = {
  companies: [{ id: 'c1', name: 'Acme', version: 1 }],
  people: [
    { id: 'p1', name: 'Taylor Target', title: 'Director', type: 'target', mutualPersonIds: ['p2'], version: 1 },
    { id: 'p2', name: 'Morgan Mutual', type: 'mutual', mutualPersonIds: [], version: 1 },
  ],
  routes: [
    {
      id: 'r1',
      companyId: 'c1',
      companyName: 'Acme',
      targetPersonId: 'p1',
      mutualPersonId: 'p2',
      owner: 'Paul',
      stage: 'Meeting / reply',
      confidence: 'strong',
      nextAction: 'Review proposal',
      dueDate: '2026-07-20',
      outcome: 'pending',
      version: 1,
    },
  ],
  activities: [],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RouteDetailPage', () => {
  it('requires an explicit confirmation before recording a terminal outcome', async () => {
    const request = vi.spyOn(api, 'request').mockResolvedValue({ activity: { id: 'a1' } });
    render(
      <MemoryRouter initialEntries={['/routes/r1']}>
        <Routes>
          <Route
            path="/routes/:id"
            element={<RouteDetailPage data={data as never} onRefresh={vi.fn().mockResolvedValue(undefined)} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Won/dead reason'), { target: { value: 'Commercial agreement signed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark won' }));

    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Confirm won outcome' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm won' }));
    expect(request).toHaveBeenCalledWith(
      '/api/routes/r1/actions',
      expect.objectContaining({ method: 'POST', body: expect.objectContaining({ action: 'mark_won' }) }),
    );
  });
});
