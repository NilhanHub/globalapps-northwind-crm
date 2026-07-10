import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Automation Suite', () => {
  test('login page accessibility check', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('authenticated pages accessibility checks', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('northwind-e2e');
    await page.getByLabel('Password').fill('northwind-e2e-passphrase');
    await page.getByRole('button', { name: 'Open Northwind' }).click();
    await expect(page.getByRole('heading', { name: 'Companies', exact: true })).toBeVisible();

    for (const path of ['/companies', '/people', '/routes', '/dashboard', '/process', '/archived']) {
      await page.goto(path);
      await page.waitForTimeout(500); // Allow render to complete
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `Accessibility violations on page: ${path}`).toEqual([]);
    }
  });
});
