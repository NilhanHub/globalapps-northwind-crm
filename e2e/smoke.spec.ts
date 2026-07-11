import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('shared login opens every primary workspace without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/login');
  await page.getByLabel('Username').fill('northwind-e2e');
  await page.getByLabel('Password').fill('northwind-e2e-passphrase');
  await page.getByRole('button', { name: 'Open Northwind' }).click();
  await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible();
  for (const path of ['/people', '/routes', '/dashboard', '/process', '/imports', '/archived']) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
  }
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('owner settings and the shared reminder centre are keyboard-safe', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Desktop command bar workflow is covered once');
  await page.goto('/login');
  await page.getByLabel('Username').fill('northwind-e2e');
  await page.getByLabel('Password').fill('northwind-e2e-passphrase');
  await page.getByRole('button', { name: 'Open Northwind' }).click();

  const settingsButton = page.getByRole('button', { name: 'Workspace settings' });
  await settingsButton.click();
  const settings = page.getByRole('dialog', { name: 'Workspace settings' });
  await expect(settings.getByText('Europe/London timezone')).toBeVisible();
  await settings.getByLabel('New owner name').fill('E2E Owner');
  await settings.getByRole('button', { name: 'Add owner' }).click();
  await expect(settings.getByLabel('Owner name for E2E Owner')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settingsButton).toBeFocused();

  const reminderButton = page.getByRole('button', { name: /shared reminders/ });
  await reminderButton.click();
  const reminders = page.getByRole('dialog', { name: 'Shared reminders' });
  await expect(reminders.getByText(/Snoozing a reminder affects everyone/)).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(reminderButton).toBeFocused();
});

test('mobile shell fits the viewport and preserves navigation', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile-only responsive assertion');
  await page.goto('/login');
  await page.getByLabel('Username').fill('northwind-e2e');
  await page.getByLabel('Password').fill('northwind-e2e-passphrase');
  await page.getByRole('button', { name: 'Open Northwind' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
});

test('creates a reusable relationship and advances an audited route', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Full workflow is covered once at desktop width');
  await page.goto('/login');
  await page.getByLabel('Username').fill('northwind-e2e');
  await page.getByLabel('Password').fill('northwind-e2e-passphrase');
  await page.getByRole('button', { name: 'Open Northwind' }).click();

  await page.locator('.page-actions').getByRole('button', { name: 'Add company' }).click();
  await page.getByLabel('Company name').fill('Premium Test Company');
  await page.getByLabel('Country').fill('Ireland');
  await page.getByRole('dialog').getByRole('button', { name: 'Add company' }).click();
  await expect(page.getByText('Premium Test Company')).toBeVisible();

  await page.goto('/people');
  await page.locator('.page-actions').getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Name').fill('Morgan Connector');
  await page.getByLabel('Type').selectOption('mutual');
  await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByText('Morgan Connector')).toBeVisible();

  await page.locator('.page-actions').getByRole('button', { name: 'Add person' }).click();
  await page.getByLabel('Name').fill('Taylor Decision Maker');
  await page.getByLabel('Company').selectOption({ label: 'Premium Test Company' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add person' }).click();
  await page.getByRole('button', { name: 'Manage Taylor Decision Maker' }).click();
  await page.getByRole('checkbox', { name: 'Morgan Connector' }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await page.goto('/routes');
  await page.locator('.page-actions').getByRole('button', { name: 'New route' }).click();
  const routeDialog = page.getByRole('dialog');
  await routeDialog.getByLabel('Company').selectOption({ label: 'Premium Test Company' });
  await routeDialog.getByLabel('Target').selectOption({ label: 'Taylor Decision Maker' });
  await routeDialog.getByLabel('Mutual contact').selectOption({ label: 'Morgan Connector' });
  await routeDialog.getByLabel('Owner').selectOption('Paul');
  await page.getByRole('dialog').getByRole('button', { name: 'Create warm route' }).click();
  await expect(page.getByRole('heading', { name: 'Taylor Decision Maker' })).toBeVisible();
  await page.getByRole('button', { name: /Show 1 mutual paths? for Taylor Decision Maker/i }).click();
  await page.getByRole('button', { name: /Open route for Taylor Decision Maker/i }).click();
  await page.getByLabel('Outcome or notes').fill('Mutual is happy to help.');
  await page.getByLabel('Interaction outcome').fill('Connected and agreed the next step.');
  await page.getByRole('button', { name: 'Log call' }).click();
  await expect(page.getByText('Action recorded.')).toBeVisible();
  await expect(page.getByText('Logged a call to the mutual contact')).toBeVisible();

  await page.getByLabel('Won/dead reason').fill('Qualified relationship converted during release verification.');
  await page.getByRole('button', { name: 'Mark won' }).click();
  await expect(page.getByRole('dialog', { name: 'Confirm won outcome' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm won' }).click();
  await expect(page.getByText('Route marked won')).toBeVisible();
});

test('verified release breakpoints avoid unintended page overflow', async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), 'Explicit breakpoint matrix runs once in desktop Chromium');
  await page.goto('/login');
  const lcp = await page.evaluate(() => {
    const entries = performance.getEntriesByType('largest-contentful-paint');
    return entries.length ? entries[entries.length - 1]!.startTime : 0;
  });
  expect(lcp).toBeLessThan(2500);
  await page.getByLabel('Username').fill('northwind-e2e');
  await page.getByLabel('Password').fill('northwind-e2e-passphrase');
  await page.getByRole('button', { name: 'Open Northwind' }).click();
  for (const path of ['/companies', '/people', '/routes', '/dashboard', '/process', '/imports', '/archived']) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await page.locator('main h1').waitFor({ state: 'visible' });
    for (const width of [1920, 1440, 1280, 768, 390]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(dimensions.scroll, `${path} at ${width}px`).toBeLessThanOrEqual(dimensions.client);
    }
  }
});
