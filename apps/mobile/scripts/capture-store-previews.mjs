// Capture the real shared Expo UI using an isolated, fictional diary. These
// are WebKit previews, not physical-device screenshots. Compare with TestFlight
// before using them for the native listing. No personal app storage is read.
import { webkit } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const fixture = process.argv[2];
if (!fixture) throw new Error('Pass the synthetic isolated-planner-backup.json produced by goals-planning.spec.ts.');
const out = path.resolve('../../verification/testflight-release/screenshots'); mkdirSync(out, { recursive: true });
const data = JSON.parse(readFileSync(fixture, 'utf8'));
data.targets = [{ id: 'store-preview-target', effectiveOn: '2026-11-06', recordedAt: '2026-11-06T08:00:00Z', values: { kcal: '2400', protein: '160', carbohydrate: '260', fat: '80', fiber: '30' } }];
const recipe = data.mealPlans[0].items[0].recipe;
const queries = ['chicken breast', 'dry pasta', 'pesto', 'olive oil', 'parmesan'];
data.quickEntry = { ...data.quickEntry, matches: Object.fromEntries(recipe.ingredients.slice(0, 5).map((i, n) => [queries[n], { foodId: i.food.id, confirmedAt: '2026-11-06T08:00:00Z' }])), favorites: [] };
const file = path.join(out, 'fictional-diary.json'); writeFileSync(file, JSON.stringify(data));
const browser = await webkit.launch();
try {
  const context = await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:4173/settings');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click(); await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await page.getByText('Backup restored', { exact: true }).filter({ visible: true }).waitFor();
  await page.goto('http://127.0.0.1:4173/'); await page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true }).click(); await page.getByText('Planned meal logged', { exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click(); await page.screenshot({ path: path.join(out, '01-today.png') });
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('200g chicken breast, 150g dry pasta, 15g pesto, 10g olive oil, 50g parmesan');
  await page.getByTestId('quantity-4').waitFor(); await page.screenshot({ path: path.join(out, '02-quick-log.png') });
  await page.goto('http://127.0.0.1:4173/search'); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).waitFor(); await page.screenshot({ path: path.join(out, '03-discover.png') });
  await page.goto('http://127.0.0.1:4173/planner'); await page.getByRole('button', { name: 'Plan a meal', exact: true }).click(); await page.getByRole('button', { name: 'Plan Chicken pesto pasta', exact: true }).click(); await page.getByRole('textbox', { name: 'Plan name', exact: true }).waitFor(); await page.screenshot({ path: path.join(out, '04-planner.png') });
  writeFileSync(path.join(out, 'provenance.json'), JSON.stringify({ source: 'Actual Expo web UI rendered in isolated WebKit; not physical iPhone captures', syntheticDiary: true, dimensions: [1320, 2868], status: 'Candidates: compare with native TestFlight before native listing use', files: ['01-today.png', '02-quick-log.png', '03-discover.png', '04-planner.png'] }, null, 2));
} finally { await browser.close(); }
