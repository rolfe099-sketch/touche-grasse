import { expect, Locator, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, LogEntry, recipePortion, PreparedBatch } from '../src/domain/model';
const output = path.resolve('../../verification/repeat-meals');
const oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!, chicken = (catalog as Food[]).find(food => food.id === 'mvt:03.205')!;
function fixture() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(8, 0, 0, 0);
  const logs: LogEntry[] = [oil, chicken].map((food, index) => ({ id: `original-${index}`, batchId: 'original-meal', recordedAt: yesterday.toISOString(), meal: 'Frokost', snapshot: { kind: 'food', ingredient: { id: `ingredient-${index}`, food, quantity: index ? '200' : '10', unit: 'g' } }, nutrition: foodNutrition(food, index ? '200' : '10', 'g') }));
  return { format: 'touche-grasse', version: 2, foods: [], recipes: [], logs, draft: emptyDraft(() => 'active-draft') };
}
async function restore(page: Page, value: unknown = fixture()) {
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-repeat-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible(); await page.goto('/');
}
async function backup(page: Page) {
  await page.goto('/settings'); const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
class Measurement {
  actions: string[] = []; scrolls = 0; start = performance.now();
  constructor(private page: Page, readonly scenario: string) {}
  async visible(locator: Locator) { const box = await locator.boundingBox(); if (box && (box.y < 0 || box.y + box.height > this.page.viewportSize()!.height)) { this.scrolls++; await locator.scrollIntoViewIfNeeded(); } }
  async click(locator: Locator, name: string) { await this.visible(locator); await locator.click(); this.actions.push(name); }
  async enter(locator: Locator, text: string) { await this.click(locator, 'Focus amount'); await locator.fill(text); this.actions.push('Enter amount'); }
  finish() { return { scenario: this.scenario, actions: this.actions, tapsAndTextActions: this.actions.length, scrolls: this.scrolls, automatedMilliseconds: Math.round(performance.now() - this.start) }; }
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('measured repeat: one tap unchanged, or adjust one amount before logging instead of correcting eaten history', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const value = fixture(); await restore(page, value); const results: ReturnType<Measurement['finish']>[] = [];
  let m = new Measurement(page, 'Before: repeat, open the logged entry and correct one amount');
  await m.click(page.getByTestId('repeat-meal').first(), 'Repeat meal');
  await m.click(page.getByTestId('meal-summary').first(), 'Expand logged meal');
  await m.click(page.getByRole('button', { name: `View ${oil.name} entry`, exact: true }).first(), 'Open entry');
  await page.screenshot({ path: path.join(output, 'before-correct-after-logging.png') });
  await m.enter(page.getByRole('textbox', { name: 'Logged amount', exact: true }), '15');
  await m.click(page.getByRole('button', { name: 'Save correction', exact: true }), 'Save correction');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('356'); results.push(m.finish());
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('–');
  m = new Measurement(page, 'After: adjust one amount inline, then log the whole meal');
  await m.click(page.getByRole('button', { name: 'Adjust usual meal 1', exact: true }), 'Adjust usual meal');
  await m.enter(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true }), '15');
  await expect(page.getByRole('textbox', { name: 'Repeat amount 2', exact: true })).toHaveValue('200'); await expect(page.getByTestId('repeat-totals')).toContainText('356 kcal');
  await page.screenshot({ path: path.join(output, 'after-adjust-before-logging.png') });
  await m.click(page.getByRole('button', { name: 'Log adjusted meal today', exact: true }), 'Log adjusted meal');
  await expect(page.getByTestId('repeat-review')).toHaveCount(0); await expect(page.getByTestId('nutrition-kcal')).toHaveText('356'); results.push(m.finish());
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  m = new Measurement(page, 'Unchanged meal remains one tap'); await m.click(page.getByTestId('repeat-meal').first(), 'Repeat meal'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('311'); results.push(m.finish());
  expect(results.map(value => value.tapsAndTextActions)).toEqual([6, 4, 1]); expect(errors).toEqual([]);
  const saved = await backup(page); expect(saved.logs.filter((entry: LogEntry) => entry.id.startsWith('original-'))).toEqual(value.logs);
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-interactions.json`), JSON.stringify(results, null, 2));
});

test('adjusted amounts survive reload and backup while the unfinished Quick Log meal stays separate', async ({ page }) => {
  const value = fixture(); value.draft.lines = [{ id: 'unfinished', query: 'olive oil', food: oil, quantityText: '5', unit: 'g' }];
  await restore(page, value); await page.getByRole('button', { name: 'Adjust usual meal 1', exact: true }).click(); await page.getByRole('textbox', { name: 'Repeat amount 1', exact: true }).fill('15');
  const saved = await backup(page); expect(saved.quickEntry.repeatReview.amounts).toEqual(['15', '200']); expect(saved.draft).toEqual(value.draft); expect(saved.logs).toEqual(value.logs);
  await page.goto('/'); await page.reload(); await expect(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true })).toHaveValue('15');
  await page.getByTestId('today-add').click(); await expect(page.getByTestId('quantity-0')).toHaveCount(0); await expect(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true })).toHaveValue('15');
  await page.getByRole('textbox', { name: 'Repeat amount 1', exact: true }).fill('17'); await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true })).toHaveValue('17'); await page.getByTestId('today-add').click();
  await expect(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true })).toHaveValue('17');
  await page.getByRole('button', { name: 'Cancel adjusted repeat', exact: true }).click(); await expect(page.getByTestId('repeat-review')).toHaveCount(0); await expect(page.getByTestId('quantity-0')).toHaveValue('5');
  const after = await backup(page); expect(after.draft).toEqual(value.draft); expect(after.logs).toEqual(value.logs); expect(after.quickEntry.repeatReview).toBeUndefined();
});

test('adjusted saved servings respect finite inventory, retain rejected amounts and undo exactly', async ({ page }) => {
  const value = fixture(), batch: PreparedBatch = { id: 'finite', createdAt: value.logs[0].recordedAt, meal: 'Frokost', recipe: { id: 'recipe', name: 'Six oil portions', servings: '6', cookedWeightGrams: '600', ingredients: [{ id: 'oil', food: oil, quantity: '60', unit: 'g' }], steps: [], favorite: false } };
  value.logs = [{ id: 'one-serving', batchId: 'one-meal', recordedAt: batch.createdAt, meal: batch.meal, preparedBatchId: batch.id, snapshot: { kind: 'recipe', recipe: batch.recipe, quantity: '1', unit: 'servings' }, nutrition: recipePortion(batch.recipe, '1', 'servings') }];
  await restore(page, { ...value, preparedBatches: [batch] }); await page.getByTestId('today-add').click();
  await page.getByRole('button', { name: 'Adjust recent meal 1', exact: true }).click(); await page.getByRole('textbox', { name: 'Repeat amount 1', exact: true }).fill('6');
  await expect(page.getByRole('button', { name: 'Log adjusted meal today', exact: true })).toBeDisabled(); await expect(page.getByRole('alert').filter({ hasText: /remaining|available|enough/i })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Repeat amount 1', exact: true })).toHaveValue('6');
  await page.getByRole('textbox', { name: 'Repeat amount 1', exact: true }).fill('2'); await page.getByRole('button', { name: 'Log adjusted meal today', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('178'); await expect(page.getByTestId('today-portions')).toContainText('3 servings left');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('today-portions')).toContainText('5 servings left');
  const saved = await backup(page); expect(saved.logs).toEqual(value.logs);
});

test('same breakfast as yesterday repeats only that calendar meal and missing meals do not substitute the last meal', async ({ page }) => {
  const value = fixture(); await restore(page, value); await page.getByTestId('today-add').click(); await page.getByRole('button', { name: 'Type commands', exact: true }).click();
  await page.getByTestId('voice-command').fill('Same breakfast as yesterday'); await page.getByRole('button', { name: 'Apply meal command', exact: true }).click(); await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('nutrition-kcal')).toHaveText('311');
  await page.getByTestId('today-add').click(); await page.getByRole('button', { name: 'Type commands', exact: true }).click();
  await page.getByTestId('voice-command').fill('Same lunch as yesterday'); await page.getByRole('button', { name: 'Apply meal command', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: 'No lunch was logged yesterday.' })).toBeVisible();
  const saved = await backup(page); expect(saved.logs).toHaveLength(4); expect(saved.logs.filter((entry: LogEntry) => entry.id.startsWith('original-'))).toEqual(value.logs);
});
