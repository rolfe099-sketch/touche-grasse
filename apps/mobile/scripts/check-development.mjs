import { chromium } from '@playwright/test';
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const folder = readdirSync('.playwright-browsers').find(n => /^chromium-\d+$/.test(n));
const browser = await chromium.launch({ executablePath: path.resolve('.playwright-browsers', folder, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const file = path.resolve('app/(tabs)/index.tsx');
const original = readFileSync(file, 'utf8');
try {
  await page.goto('http://localhost:8082', { timeout: 120000 });
  await page.getByTestId('today-add').waitFor({ timeout: 120000 });
  await page.screenshot({ path: '../../verification/design-revision/development-375.png' });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.screenshot({ path: '../../verification/design-revision/development-430.png' });
  const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  if (registrations !== 0) throw new Error('Development origin should not register a service worker');
  const fonts = await page.evaluate(() => [...document.fonts].map(face => ({ family: face.family, status: face.status })));
  for (const family of ['Newsreader', 'SourceSans3']) if (!fonts.some(face => face.family.replace(/["']/g, '') === family && face.status === 'loaded')) throw new Error(`Bundled font not loaded: ${family}`);
  writeFileSync(file, original.replace('A keeper starts here.', 'Fast Refresh check'));
  await page.getByText('Fast Refresh check', { exact: true }).waitFor({ timeout: 30000 });
  writeFileSync(file, original);
  await page.getByText('A keeper starts here.', { exact: true }).waitFor({ timeout: 30000 });
  if (errors.length) throw new Error(errors.join('\n'));
  const report = { url: 'http://localhost:8082', widths: [375, 430], rendered: true, fonts, fastRefreshEditAndRestore: true, developmentServiceWorkers: registrations, pageErrors: errors };
  writeFileSync('../../verification/design-revision/development-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { if (readFileSync(file, 'utf8') !== original) writeFileSync(file, original); await browser.close(); }
