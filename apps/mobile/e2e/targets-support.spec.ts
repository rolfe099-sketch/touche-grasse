import { test, expect, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('../../verification/targets-support');
const supportURL = 'https://buymeacoffee.com/endoftheend';
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function setTargets(page: Page, values: Record<string, string>) {
  await page.getByRole('button', { name: /^(Set|Edit) daily targets$/ }).click();
  for (const [key, value] of Object.entries(values)) await page.getByTestId(`target-input-${key}`).fill(value);
}
async function backup(page: Page) {
  await page.goto('/settings'); const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloaded).path())!, 'utf8'));
}

test('optional targets show exact remaining and over amounts, preserve history and survive backup/reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T12:00:00Z'));
  await page.goto('/'); await expect(page.getByTestId('energy-target-progress')).toHaveCount(0);
  await setTargets(page, { kcal: '2000', protein: '150', carbohydrate: '200', fat: '30', fiber: '30' });
  await expect(page.getByTestId('target-energy-note')).toContainText('1,670');
  await page.getByRole('button', { name: 'Save targets', exact: true }).click();
  await expect(page.getByTestId('energy-target-progress')).toContainText('no intake logged');
  await page.reload(); await expect(page.getByTestId('energy-target-progress')).toContainText('2,000');
  await page.getByTestId('universal-log').click();
  await page.getByTestId('quick-text').fill('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (const [i, id] of ['03.205', '05.016', '06.144'].entries()) await page.getByTestId(`choice-${i}-mvt:${id}`).click();
  await expect(page.getByTestId('commit-food')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'quick-log-390.png') });
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('energy-target-progress')).toHaveText('Target 2,000 kcal · 884 left');
  await expect(page.getByTestId('target-progress-fiber')).toContainText('23.9 left');
  await expect(page.getByTestId('target-progress-fat')).toContainText('10.1 over');
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'today-targets-390.png') });
  const original = await backup(page);
  await page.clock.setFixedTime(new Date('2026-11-04T12:00:00Z'));
  await page.goto('/'); await setTargets(page, { kcal: '2300' });
  await page.getByRole('button', { name: 'Save targets', exact: true }).click();
  await page.goto('/history?date=2026-11-03&scope=day');
  await expect(page.getByTestId('target-summary')).toContainText('2,000 kcal');
  await expect(page.getByTestId('target-summary')).not.toContainText('2,300');
  const current = await backup(page); expect(current.logs).toEqual(original.logs); expect(current.targets).toHaveLength(2);
  const context = await page.context().browser()!.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 } });
  const fresh = await context.newPage(); await fresh.clock.setFixedTime(new Date('2026-11-04T12:00:00Z')); await fresh.goto('/settings');
  const chooser = fresh.waitForEvent('filechooser'); await fresh.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'targets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(current)) });
  await fresh.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(fresh.getByText('Backup restored', { exact: true })).toBeVisible();
  await fresh.goto('/'); await expect(fresh.getByTestId('energy-target-progress')).toContainText('2,300');
  await setTargets(fresh, {}); await fresh.getByRole('button', { name: 'Clear fields', exact: true }).click(); await fresh.getByRole('button', { name: 'Save without targets', exact: true }).click();
  await expect(fresh.getByTestId('energy-target-progress')).toHaveCount(0);
  await fresh.goto('/history?date=2026-11-03&scope=day'); await expect(fresh.getByTestId('target-summary')).toContainText('2,000 kcal');
  await context.close(); writeFileSync(path.join(output, 'target-proof.json'), JSON.stringify({ original: original.targets, updated: current.targets, historicalLogsUnchanged: true }, null, 2));
});

test('unknown nutrients do not become remaining allowances and invalid targets cannot save', async ({ page }) => {
  await page.goto('/'); await setTargets(page, { kcal: '-1', fiber: '30' });
  await expect(page.getByRole('button', { name: 'Save targets', exact: true })).toBeDisabled();
  await page.getByTestId('target-input-kcal').fill('2000'); await page.getByRole('button', { name: 'Save targets', exact: true }).click();
  await page.goto('/manual'); await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Unknown fiber test food');
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('100');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('today-fiber')).toHaveText('– g'); await expect(page.getByTestId('target-progress-fiber')).toContainText('– left');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('energy-target-progress')).toContainText('no intake logged');
});

test('all five main destinations expose the official coffee logo and open the exact optional support link', async ({ page, context }) => {
  for (const [route, name] of [['/', 'today'], ['/recipes', 'library'], ['/entry', 'log'], ['/search', 'discover'], ['/history', 'history']]) {
    await page.goto(route);
    const link = page.getByRole('link', { name: 'Support Touche Grasse on Buy Me a Coffee', exact: true });
    await expect(link).toBeInViewport({ ratio: 1 }); await expect(link).toHaveAttribute('href', supportURL); await expect(link).toHaveAttribute('target', '_blank');
    await expect(link.locator('svg')).toBeVisible();
    const box = (await link.boundingBox())!; expect(box.width).toBe(44); expect(box.x).toBeGreaterThan(310); expect(box.y).toBeLessThan(70);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: path.join(output, `${name}-support-390.png`) });
  }
  // Intercept the new page: verify navigation without contacting the donation/payment service.
  await context.route('https://buymeacoffee.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Support link test</title>' }));
  const opened = context.waitForEvent('page'); await page.getByTestId('support-link').click(); const popup = await opened;
  await popup.waitForURL(supportURL); expect(popup.url()).toBe(supportURL); await popup.close();
});
