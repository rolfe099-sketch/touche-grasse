import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, LogEntry } from '../src/domain/model';

const output = path.resolve('../../verification/backup-upgrades'), oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!;
let serial = 0;
test.use({ timezoneId: 'UTC' });
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function choose(page: Page, value: unknown) {
  const file = path.join(output, `isolated-import-${++serial}.json`); writeFileSync(file, JSON.stringify(value));
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click(); await (await chooser).setFiles(file);
}
async function exported(page: Page) {
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
async function existingDiary(page: Page) {
  await page.goto('/'); await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('20g olive oil'); await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); return exported(page);
}

test('rejects newer and corrupt contents before showing restore confirmation and preserves the diary, draft and Undo', async ({ page }) => {
  const before = await existingDiary(page);
  for (const kind of ['root', 'nested', 'calculation', 'version']) {
    await choose(page, before); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toBeVisible();
    const value = structuredClone(before);
    if (kind === 'root') value.newerAppData = { retain: true };
    else if (kind === 'nested') value.logs[0].snapshot.ingredient.food.nutrition.newerNutrient = '42';
    else if (kind === 'calculation') value.logs[0].nutrition.kcal = '999';
    else value.version = 3;
    await choose(page, value);
    await expect(page.getByRole('alert').filter({ visible: true })).toContainText(kind === 'calculation' ? 'invalid nutrition calculation' : 'newer app');
    await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
    expect(await exported(page)).toEqual(before);
  }
  await choose(page, { ...before, newerAppData: true }); await expect(page.getByRole('alert').filter({ visible: true })).toContainText('newer app');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-unsupported-import.png`) });
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('–');
  await page.getByTestId('universal-log').click(); await expect(page.getByTestId('quantity-0')).toHaveValue('20');
});

test('an older pre-fiber archive retains exact correction snapshots and unfinished amounts through repeat restore and reload', async ({ page }) => {
  const legacyFood = structuredClone(oil); delete legacyFood.nutrition.fiber;
  const entry: LogEntry = { id: 'legacy-log', batchId: 'legacy-meal', recordedAt: '2026-10-01T12:00:00Z', meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: 'oil', food: legacyFood, quantity: '10', unit: 'g' } }, nutrition: foodNutrition(legacyFood, '10', 'g') }; delete entry.nutrition.fiber;
  entry.corrections = [{ correctedAt: '2026-10-02T12:00:00Z', previous: { ...structuredClone(entry), recordedAt: '2026-09-01T12:00:00Z' } }];
  const draft = { ...emptyDraft(() => 'legacy-draft'), lines: [{ id: 'pending', query: 'oil', food: legacyFood, quantityText: '15,', unit: 'g' }] };
  const value = { format: 'touche-grasse', version: 2, foods: [legacyFood], recipes: [], logs: [entry], draft };
  await page.goto('/settings');
  for (let repeat = 0; repeat < 2; repeat++) { await choose(page, value); await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible(); }
  const saved = await exported(page); expect(saved.logs).toEqual(value.logs); expect(saved.foods).toEqual(value.foods); expect(saved.draft).toEqual(draft); expect(saved.profile.firstUsedAt).toBe('2026-09-01T12:00:00Z');
  await page.goto('/entry'); await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('15,'); await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.goto('/history?date=2026-10-01&scope=day'); await expect(page.getByRole('group', { name: 'Fiber: unknown.', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-legacy-history.png`) });
});

test('an interrupted restore rolls back every write, retains Undo and can be retried without duplicate history', async ({ page }) => {
  const before = await existingDiary(page), food = { ...structuredClone(oil), id: 'fixture:incoming-oil', name: 'Incoming oil fixture' };
  const entry: LogEntry = { id: 'incoming-log', batchId: 'incoming-meal', recordedAt: '2026-10-01T12:00:00Z', meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: 'incoming-ingredient', food, quantity: '20', unit: 'g' } }, nutrition: foodNutrition(food, '20', 'g') };
  const incoming = { format: 'touche-grasse', version: 2, foods: [food], recipes: [], logs: [entry], draft: emptyDraft(() => 'incoming-draft') };
  await choose(page, incoming); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let armed = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args);
      if (armed && args[0]?.key === 'log:incoming-log') { armed = false; const transaction = this.transaction; request.addEventListener('success', () => transaction.abort(), { once: true }); }
      return request;
    };
  });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByRole('alert').filter({ visible: true })).toBeVisible(); expect(await exported(page)).toEqual(before);
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-restore-retry.png`) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible();
  const after = await exported(page); expect(after.logs).toHaveLength(2); expect(after.logs).toEqual(expect.arrayContaining([...before.logs, entry])); expect(after.draft).toEqual(before.draft);
  await choose(page, incoming); await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0); expect((await exported(page)).logs).toHaveLength(2);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); expect((await exported(page)).logs).toEqual([entry]);
});
