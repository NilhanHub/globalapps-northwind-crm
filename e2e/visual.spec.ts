import { expect, test } from '@playwright/test';

const mockBootstrapData = {
  companies: [
    {
      id: 'company-1',
      name: 'Acme Corporation',
      sector: 'Technology',
      country: 'United States',
      status: 'New',
      contactName: 'John Doe',
      email: 'john@acme.com',
      version: 1,
      archivedAt: null,
    },
  ],
  people: [
    {
      id: 'person-1',
      name: 'John Doe',
      type: 'target',
      companyId: 'company-1',
      title: 'Chief Executive Officer',
      version: 1,
      archivedAt: null,
      mutualPersonIds: ['person-2'],
    },
    {
      id: 'person-2',
      name: 'Jane Smith',
      type: 'mutual',
      companyId: '',
      title: 'Trusted Advisor',
      version: 1,
      archivedAt: null,
      mutualPersonIds: [],
    },
  ],
  routes: [
    {
      id: 'route-1',
      companyId: 'company-1',
      companyName: 'Acme Corporation',
      targetPersonId: 'person-1',
      mutualPersonId: 'person-2',
      owner: 'Paul',
      stage: 'Intro requested',
      version: 1,
      archivedAt: null,
      dueDate: '2026-12-31',
      nextAction: 'Send email introduction request',
    },
  ],
  activities: [],
};

test.describe('Visual Regression Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept api calls to return a stable mock dataset
    await page.route('**/api/bootstrap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBootstrapData),
      });
    });
  });

  test('login page visual snapshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveScreenshot('login-page.png', { maxDiffPixelRatio: 0.1 });
  });

  test('authenticated pages visual snapshots', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('northwind-e2e');
    await page.getByLabel('Password').fill('northwind-e2e-passphrase');
    await page.getByRole('button', { name: 'Open Northwind' }).click();

    // Wait for Companies page
    await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('companies-page.png', { maxDiffPixelRatio: 0.1 });

    // Go to People Page
    await page.goto('/people');
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('people-page.png', { maxDiffPixelRatio: 0.1 });

    // Go to Routes Page
    await page.goto('/routes');
    await expect(page.getByRole('heading', { name: 'Routes', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('routes-page.png', { maxDiffPixelRatio: 0.1 });

    // Go to Dashboard Page
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Owner dashboard', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('dashboard-page.png', { maxDiffPixelRatio: 0.1 });

    // Go to Process Page
    await page.goto('/process');
    await expect(page.getByRole('heading', { name: 'Warm introduction process', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('process-page.png', { maxDiffPixelRatio: 0.1 });

    // Go to Archived Page
    await page.goto('/archived');
    await expect(page.getByRole('heading', { name: 'Archived records', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('archived-page.png', { maxDiffPixelRatio: 0.1 });
  });
});
