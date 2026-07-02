// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('./auth', () => ({ useAuth: () => ({ session: { actor: 'QA' }, logout: vi.fn() }) }));

describe('premium application shell', () => {
  it('provides landmark navigation to every primary workspace', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <div>Workspace content</div>
        </AppShell>
      </MemoryRouter>,
    );
    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(navigation).toBeVisible();
    expect(within(navigation).getByRole('link', { name: /Companies/ })).toHaveAttribute('href', '/companies');
    expect(within(navigation).getByRole('link', { name: /People/ })).toHaveAttribute('href', '/people');
    expect(within(navigation).getByRole('link', { name: /Routes/ })).toHaveAttribute('href', '/routes');
    expect(screen.getByText('Workspace content')).toBeVisible();
  });
});
