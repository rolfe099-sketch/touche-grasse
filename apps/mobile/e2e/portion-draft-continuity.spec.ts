import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, Recipe } from '../src/domain/model';
const output = path.resolve('../../verification/portion-drafts'), before = process.env.TG_PORTION_DRAFT_BEFORE === '1';
const food = catalog.find(f => f.id === 'mvt:08.019')! as Food;
const recipe: Recipe = { id: 'recipe', name: 'Week lunches', servings: '6', cookedWeightGrams: '600', ingredients: [{ id: 'oil', food, quantity: '60', unit: 'g' }], steps: [], favorite: false };
function fixture() { return { format: 'touche-grasse', version: 2, foods: [food], recipes: [recipe], logs: [], draft: emptyDraft(() => 'draft'), preparedBatches: [{ id: 'a', recipe, meal: 'Middag', createdAt: '2026-11-02T12:00:00Z' }, { id: 'b', recipe: { ...recipe, id: 'soup', name: 'Soup portions' }, meal: 'Lunsj', createdAt: '2026-11-01T12:00:00Z' }] }; }
async function restore(page: Page, source: unknown) {
  const file = path.join(output, `fixture-${test.info().testId.replace(/[^a-z0-9]/gi, '')}.json`); writeFileSync(file, JSON.stringify(source));
  await page.goto('/settings'); const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click(); await (await choosing).setFiles(file); await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
}
async function exported(page: Page) { await page.goto('/settings'); const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8')); }
async function openA(page: Page) { await page.goto('/recipes?view=portions&batch=a'); await expect(page.getByTestId('saved-batch-a').getByTestId('portion-amount')).toBeVisible(); return page.getByTestId('saved-batch-a'); }
async function saved(page: Page) { await expect(page.getByTestId('portion-draft-status')).toHaveText('Portion draft saved'); }
test.use({ timezoneId: 'UTC' });
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('capture pre-fix loss of unsent portion amounts and dates on reload', async ({ page }) => {
  test.skip(!before, 'Historical baseline only.'); await restore(page, fixture()); let panel = await openA(page);
  await panel.getByRole('button', { name: 'Grams', exact: true }).click(); await panel.getByTestId('portion-amount').fill('150'); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await panel.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-07');
  await page.reload(); panel = page.getByTestId('saved-batch-a'); await expect(panel.getByTestId('portion-amount')).toHaveValue('1'); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-06');
  writeFileSync(path.join(output, 'before.json'), JSON.stringify({ entered: { amount: '150', unit: 'g', date: '2026-11-07' }, afterReload: { amount: '1', unit: 'servings', date: '2026-11-06' } }, null, 2));
});

test('restores independent partial drafts through batch switches, tabs, reload and backup without logging food', async ({ page, browser }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture()); let panel = await openA(page);
  await panel.getByRole('button', { name: 'Grams', exact: true }).click(); await panel.getByTestId('portion-amount').fill('150,'); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await panel.getByTestId('portion-date').fill('2026-'); await saved(page);
  await page.getByRole('button', { name: 'Open saved batch Soup portions', exact: true }).click(); await page.getByTestId('portion-amount').fill('0.5'); await saved(page); await page.getByRole('button', { name: 'Open saved batch Week lunches', exact: true }).click();
  await expect(panel.getByTestId('portion-amount')).toHaveValue('150,'); await expect(panel.getByTestId('log-portion')).toBeDisabled(); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-');
  await panel.getByTestId('portion-amount').fill('150'); await panel.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await saved(page);
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await expect(page.getByTestId('today-portions')).toContainText('Resume draft'); await page.getByRole('button', { name: 'Adjust saved portions of Week lunches', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('150');
  await page.reload(); panel = page.getByTestId('saved-batch-a'); await expect(panel.getByTestId('portion-amount')).toHaveValue('150'); await expect(panel.getByRole('button', { name: 'Grams', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(panel).toContainText('2026-11-07');
  await page.screenshot({ path: path.join(output, `restored-${test.info().project.name || 'chromium'}.png`) });
  const copy = await exported(page); expect(copy.logs).toEqual([]); expect(copy.quickEntry.portionDrafts.a.value).toEqual({ quantities: { servings: '1', g: '150' }, unit: 'g', dateText: '2026-11-07' }); expect(copy.quickEntry.portionDrafts.b.value.quantities.servings).toBe('0.5');
  const context = await browser.newContext({ baseURL: process.env.TG_TEST_URL ?? 'http://127.0.0.1:4173', timezoneId: 'UTC', viewport: { width: 390, height: 844 } }), fresh = await context.newPage(); await fresh.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await restore(fresh, copy); const restored = await openA(fresh); await expect(restored.getByTestId('portion-amount')).toHaveValue('150'); await expect(restored).toContainText('2026-11-07'); expect((await exported(fresh)).logs).toEqual([]); await context.close();
});

test('quick logging keeps pending intent; custom logging clears only its draft, resets date and survives Undo and old restore', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture()); let panel = await openA(page);
  await panel.getByTestId('portion-amount').fill('2'); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await panel.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await saved(page); const old = await exported(page);
  await page.goto('/'); await page.getByRole('button', { name: 'Log one saved serving of Week lunches', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(1);
  panel = await openA(page); await expect(panel.getByTestId('portion-amount')).toHaveValue('2'); await expect(panel).toContainText('2026-11-07'); await panel.getByTestId('log-portion').click(); await expect(panel.getByTestId('remaining-portions')).toContainText('3 servings left'); await expect(panel.getByTestId('portion-amount')).toHaveValue('1'); await expect(panel.getByTestId('portion-draft-status')).toHaveCount(0); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-06');
  const logged = await exported(page); expect(logged.logs).toHaveLength(2); expect(logged.logs.find((item: { timePrecision?: string }) => item.timePrecision === 'day').nutrition).toEqual(foodNutrition(food, '20', 'g')); expect(logged.quickEntry.portionDrafts.a.value).toBeNull();
  await restore(page, old); panel = await openA(page); await expect(panel.getByTestId('portion-amount')).toHaveValue('1'); await panel.getByRole('button', { name: 'Undo last portion', exact: true }).click(); await expect(panel.getByTestId('remaining-portions')).toContainText('5 servings left');
  await panel.getByTestId('portion-amount').fill('4'); await saved(page); await panel.getByRole('button', { name: 'Reset portion', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('1'); await page.reload(); await expect(page.getByTestId('portion-amount')).toHaveValue('1'); expect((await exported(page)).logs).toHaveLength(1);
  panel = await openA(page); await panel.getByTestId('portion-amount').fill('2'); await saved(page); await page.goto('/');
  for (let count = 2; count <= 6; count++) { await page.getByRole('button', { name: 'Log one saved serving of Week lunches', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(count); }
  await page.getByRole('button', { name: 'Log one saved serving of Soup portions', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(7);
  panel = await openA(page); await expect(panel.getByTestId('remaining-portions')).toContainText('0 servings left'); await expect(panel.getByTestId('portion-amount')).toHaveValue('2'); await expect(panel.getByTestId('log-portion')).toBeDisabled();
  await panel.getByRole('button', { name: 'Reset portion', exact: true }).click(); await expect(page.getByTestId('saved-batch-a')).toHaveCount(0); expect((await exported(page)).logs).toHaveLength(7);
});

test('an aborted log transaction retains the saved review and retry consumes it exactly once', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture()); const panel = await openA(page);
  await panel.getByTestId('portion-amount').fill('2'); await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put; let armed = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args);
      if (armed && args[0]?.kind === 'log') { armed = false; const tx = this.transaction; request.addEventListener('success', () => tx.abort(), { once: true }); }
      return request;
    };
  });
  await panel.getByTestId('log-portion').click(); await expect(page.getByRole('alert').filter({ visible: true }).first()).toContainText(/interrupted|saved|abort/i);
  await expect(panel.getByTestId('portion-amount')).toHaveValue('2'); await expect(panel.getByTestId('remaining-portions')).toContainText('6 servings left');
  await panel.getByTestId('log-portion').click(); await expect(panel.getByTestId('remaining-portions')).toContainText('4 servings left');
  const result = await exported(page); expect(result.logs).toHaveLength(1); expect(result.logs[0].nutrition).toEqual(foodNutrition(food, '20', 'g')); expect(result.quickEntry.portionDrafts.a.value).toBeNull();
});

test('an automatic Today follows a resumed day while an explicitly selected date stays fixed', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture()); let panel = await openA(page);
  await panel.getByTestId('portion-amount').fill('2'); await saved(page); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-06');
  await page.clock.setFixedTime(new Date('2026-11-07T12:00:00Z')); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-07');
  await panel.getByTestId('portion-date').fill('2026-11-06'); await saved(page); await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z')); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-06');
  await page.reload(); panel = page.getByTestId('saved-batch-a'); await expect(panel).toContainText('2026-11-06'); await panel.getByTestId('log-portion').click(); await expect(panel.getByTestId('remaining-portions')).toContainText('4 servings left'); const result = await exported(page); expect(result.logs).toHaveLength(1); expect(result.logs[0].recordedAt.slice(0, 10)).toBe('2026-11-06');
});
