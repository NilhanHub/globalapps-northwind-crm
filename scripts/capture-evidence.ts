import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.CRM_EVIDENCE_URL ?? 'http://127.0.0.1:18790';
const username = process.env.CRM_EVIDENCE_USERNAME;
const password = process.env.CRM_EVIDENCE_PASSWORD;
if (!username || !password) throw new Error('CRM_EVIDENCE_USERNAME and CRM_EVIDENCE_PASSWORD are required.');
const output = resolve('Evidence', 'premium_rebuild');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleEntries: Array<{ type: string; text: string }> = [];
const failedRequests: Array<{ url: string; status: number }> = [];
const accessibility: Array<{
  path: string;
  width: number;
  violations: Array<{ id: string; impact: string | null; nodes: number; help: string }>;
}> = [];
page.on('console', (message) => consoleEntries.push({ type: message.type(), text: message.text() }));
page.on('response', (response) => {
  if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
});
await page.goto(`${baseURL}/login`);
const loginAccessibility = await new AxeBuilder({ page }).analyze();
accessibility.push({
  path: 'login',
  width: 1280,
  violations: loginAccessibility.violations.map(({ id, impact, nodes, help }) => ({
    id,
    impact,
    nodes: nodes.length,
    help,
  })),
});
await page.getByLabel('Username').fill(username);
await page.getByLabel('Password').fill(password);
await page.getByRole('button', { name: 'Open Northwind' }).click();
await page.getByRole('heading', { name: 'Companies' }).waitFor();

const breakpoints = [1920, 1440, 1280, 768, 390];
const paths = ['companies', 'people', 'routes', 'dashboard', 'process', 'imports', 'archived'];
const responsive: Array<{
  path: string;
  width: number;
  pageScrollWidth: number;
  viewportWidth: number;
  overflow: boolean;
  overflowElements: Array<{ tag: string; className: string; left: number; right: number; width: number }>;
}> = [];

for (const path of paths) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/${path}`);
  await page.locator('main h1').waitFor({ state: 'visible' });

  for (const width of breakpoints) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });

    const dimensions = await page.evaluate(() => ({
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      overflowElements: Array.from(document.querySelectorAll('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((element) => element.left < 0 || element.right > document.documentElement.clientWidth)
        .slice(0, 12),
    }));
    responsive.push({
      path,
      width,
      ...dimensions,
      overflow: dimensions.pageScrollWidth > dimensions.viewportWidth,
    });
    if (width === 1440 || width === 390) {
      const results = await new AxeBuilder({ page }).analyze();
      accessibility.push({
        path,
        width,
        violations: results.violations.map(({ id, impact, nodes, help }) => ({
          id,
          impact,
          nodes: nodes.length,
          help,
        })),
      });
    }
    await page.screenshot({ path: resolve(output, `${path}-${width}.png`), fullPage: false });
  }
}

writeFileSync(resolve(output, 'browser-console.json'), `${JSON.stringify(consoleEntries, null, 2)}\n`);
writeFileSync(resolve(output, 'failed-requests.json'), `${JSON.stringify(failedRequests, null, 2)}\n`);
writeFileSync(resolve(output, 'responsive-verification.json'), `${JSON.stringify(responsive, null, 2)}\n`);
writeFileSync(resolve(output, 'accessibility-verification.json'), `${JSON.stringify(accessibility, null, 2)}\n`);
await browser.close();

const consoleFailures = consoleEntries.filter((entry) => ['error', 'warning'].includes(entry.type));
const overflowFailures = responsive.filter((entry) => entry.overflow);
const accessibilityFailures = accessibility.flatMap((entry) => entry.violations);
if (consoleFailures.length || failedRequests.length || overflowFailures.length || accessibilityFailures.length) {
  throw new Error(
    `Evidence verification failed: ${consoleFailures.length} console failures, ` +
      `${failedRequests.length} failed responses, ${overflowFailures.length} viewport overflows, ` +
      `${accessibilityFailures.length} accessibility violations.`,
  );
}
