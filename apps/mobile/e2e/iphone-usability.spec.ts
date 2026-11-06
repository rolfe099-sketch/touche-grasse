import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, LogEntry, Recipe, snapshotNutrition } from '../src/domain/model';
import { daySignature } from '../src/domain/dailyWorkflows';
import { makeMealEdit } from '../src/domain/mealEditor';
import { applyLabelColumn, parseNutritionLabel } from '../src/domain/nutritionLabel';
import { emptyTargets } from '../src/domain/targets';

const output = path.resolve('../../verification/iphone-usability'), at = '2026-11-05T12:00:00.000Z';
function fixture() {
  const oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!;
  const foodLog = (quantity: string): LogEntry => ({ id: 'food-log', batchId: 'food-meal', recordedAt: at, meal: 'Lunsj', snapshot: { kind: 'food', ingredient: { id: 'food-ingredient', food: oil, quantity, unit: 'g' } }, nutrition: foodNutrition(oil, quantity, 'g') });
  const recipe: Recipe = { id: 'recipe', name: 'Fixture oil batch', ingredients: [{ id: 'recipe-oil', food: oil, quantity: '60', unit: 'g' }], steps: [], servings: '6', cookedWeightGrams: '60', favorite: true };
  const snapshot: LogEntry['snapshot'] = { kind: 'recipe', recipe, quantity: '1', unit: 'servings' };
  const portion: LogEntry = { id: 'portion-log', batchId: 'portion-meal', preparedBatchId: 'batch', recordedAt: at, meal: 'Lunsj', snapshot, nutrition: snapshotNutrition(snapshot) };
  const logs = [foodLog('10'), portion], mealEdit = makeMealEdit([logs[0]], 'editor', 'shortcut'); mealEdit.rows[0].amount = '15,';
  const scan = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 200 kcal\nFat 10 g\nProtein 20 g', blocks: [] });
  const label = applyLabelColumn({ id: 'label', name: 'Unfinished fixture label', barcode: '', basis: 'g', amount: '15', values: { kcal: '', fat: '', protein: '', carbohydrate: '', fiber: '' } }, scan, 0);
  label.values.protein = ''; label.edited = ['protein']; label.rescan = scan;
  return JSON.parse(JSON.stringify({ format: 'touche-grasse', version: 2, foods: [oil], recipes: [recipe], logs,
    draft: { ...emptyDraft(() => 'ordinary-draft'), text: '50g apple' },
    preparedBatches: [{ id: 'batch', recipe, meal: 'Lunsj', createdAt: at }],
    shortcuts: [{ id: 'shortcut', name: 'Fixture shortcut', entries: [logs[0]], pinned: true, createdAt: at, updatedAt: at, deletedAt: null }],
    mealCorrections: [{ id: 'correction', correctedAt: at, previous: [foodLog('5')], applied: [logs[0]], revertedAt: null }],
    weighIns: [{ id: '2026-11-05', kg: '80', recordedAt: at, deletedAt: null, previous: [] }],
    targets: [{ id: 'targets', effectiveOn: '2026-11-05', recordedAt: at, values: { ...emptyTargets(), protein: '140', fiber: '30' } }],
    dayReviews: [{ id: '2026-11-05', complete: true, signature: daySignature(logs, '2026-11-05'), updatedAt: at }],
    recipeDrafts: { recipe: { recipe, instructions: 'Unfinished instructions' } },
    quickEntry: { matches: {}, favorites: [oil.id], labelDrafts: { 'new:': label }, mealEdit, weightUnit: 'kg', weightDraft: { date: '2026-11-05', amount: '80,', unit: 'kg' }, voiceDraft: { id: 'command', text: 'Can you add 15 grams of oil?', locale: 'en-US' } },
  }));
}
async function choose(page: Page, name: string, json?: string) {
  const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await picker).setFiles(json === undefined ? [] : { name, mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByRole('button', { name: 'Choose a backup file', exact: true })).toBeEnabled();
}
async function exported(page: Page) {
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date(at)); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('choosing an invalid or cancelled replacement cannot leave an older restore proposal active', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); const before = await exported(page);
  await choose(page, 'first-fixture.json', JSON.stringify(fixture())); await expect(page.getByTestId('backup-filename')).toHaveText('first-fixture.json');
  await choose(page, 'invalid-fixture.json', JSON.stringify({ ...fixture(), shortcuts: {} }));
  await expect(page.getByText('This backup has an invalid record list. Choose another file.', { exact: true }).filter({ visible: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
  await choose(page, 'second-fixture.json', JSON.stringify(fixture())); await expect(page.getByTestId('backup-filename')).toHaveText('second-fixture.json');
  await choose(page, 'cancelled.json'); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
  await choose(page, 'invalid-record-fixture.json', JSON.stringify({ ...fixture(), foods: [{}] }));
  await expect(page.getByText('This backup contains invalid records. Your current diary is unchanged.', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
  const after = await exported(page); expect(after.logs).toEqual(before.logs); expect(after.draft).toEqual(before.draft);
});

test('restore review describes every record family and a feature-rich archive survives repeat and fresh-store restoration', async ({ page, browser }) => {
  test.setTimeout(150000); const source = fixture(); await page.goto('/settings'); await choose(page, 'complete-fixture.json', JSON.stringify(source));
  const summary = page.getByTestId('backup-summary');
  for (const text of ['2 diary entries', '1 saved batch', '1 recipe', '1 shortcut', '1 target revision', '1 weigh-in', '1 meal correction', '1 label', 'voice command', 'meal adjustment']) await expect(summary).toContainText(text);
  await summary.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-backup-review.png`) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible();
  const first = await exported(page);
  for (const key of ['logs', 'recipes', 'preparedBatches', 'shortcuts', 'targets', 'dayReviews', 'weighIns', 'mealCorrections', 'recipeDrafts', 'draft']) expect(first[key]).toEqual(source[key]);
  expect(first.quickEntry.labelDrafts).toEqual(source.quickEntry.labelDrafts); expect(first.quickEntry.voiceDraft).toEqual(source.quickEntry.voiceDraft); expect(first.quickEntry.weightDraft).toEqual(source.quickEntry.weightDraft); expect(first.quickEntry.mealEdit).toEqual(source.quickEntry.mealEdit);
  await choose(page, 'repeat-fixture.json', JSON.stringify(first)); await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByTestId('backup-summary')).toHaveCount(0);
  const repeated = await exported(page); expect(repeated.logs).toEqual(first.logs); expect(repeated.preparedBatches).toEqual(first.preparedBatches);
  const context = await browser.newContext({ viewport: { width: 393, height: 852 } }), fresh = await context.newPage(); await fresh.clock.setFixedTime(new Date(at));
  await fresh.goto('/settings'); await choose(fresh, 'exported-fixture.json', JSON.stringify(first)); await fresh.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(fresh.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible();
  const restored = await exported(fresh); for (const key of ['logs', 'recipes', 'preparedBatches', 'shortcuts', 'targets', 'dayReviews', 'weighIns', 'mealCorrections', 'recipeDrafts', 'draft', 'quickEntry']) expect(restored[key]).toEqual(first[key]);
  await context.close();
});
