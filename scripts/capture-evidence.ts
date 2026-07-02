import { chromium } from '@playwright/test';
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
page.on('console', (message) => consoleEntries.push({ type: message.type(), text: message.text() }));
page.on('response', (response) => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
await page.goto(`${baseURL}/login`);
await page.getByLabel('Username').fill(username);
await page.getByLabel('Password').fill(password);
await page.getByRole('button', { name: 'Open Northwind' }).click();
await page.getByRole('heading', { name: 'Companies' }).waitFor();
const breakpoints = [1920, 1440, 1280, 768, 390];
const responsive: Array<{ width: number; pageScrollWidth: number; viewportWidth: number; overflow: boolean }> = [];
for (const width of breakpoints) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(`${baseURL}/companies`);
  const dimensions = await page.evaluate(() => ({ pageScrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
  responsive.push({ width, ...dimensions, overflow: dimensions.pageScrollWidth > dimensions.viewportWidth });
  await page.screenshot({ path: resolve(output, `companies-${width}.png`), fullPage: false });
}
await page.setViewportSize({ width: 1440, height: 900 });
for (const path of ['people', 'routes', 'dashboard', 'process', 'archived']) {
  await page.goto(`${baseURL}/${path}`);
  await page.locator('main h1').waitFor();
  await page.screenshot({ path: resolve(output, `${path}-1440.png`), fullPage: false });
}
writeFileSync(resolve(output, 'browser-console.json'), `${JSON.stringify(consoleEntries, null, 2)}\n`);
writeFileSync(resolve(output, 'failed-requests.json'), `${JSON.stringify(failedRequests, null, 2)}\n`);
writeFileSync(resolve(output, 'responsive-verification.json'), `${JSON.stringify(responsive, null, 2)}\n`);
await browser.close();
