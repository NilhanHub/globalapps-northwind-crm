// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNorthwindBrowserState } from './browser-state';

describe('Northwind browser-state reset', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('removes only Northwind-owned storage and caches', async () => {
    localStorage.setItem('northwind.preference', 'board');
    localStorage.setItem('another-app', 'keep');
    sessionStorage.setItem('northwind.logoutReason', 'idle_timeout');
    sessionStorage.setItem('another-session', 'keep');
    const deleteCache = vi.fn(async () => true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: async () => ['northwind-crm-v1', 'another-app'], delete: deleteCache },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => [] },
    });

    await clearNorthwindBrowserState();

    expect(localStorage.getItem('northwind.preference')).toBeNull();
    expect(localStorage.getItem('another-app')).toBe('keep');
    expect(sessionStorage.getItem('northwind.logoutReason')).toBeNull();
    expect(sessionStorage.getItem('another-session')).toBe('keep');
    expect(deleteCache).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith('northwind-crm-v1');
  });
});
