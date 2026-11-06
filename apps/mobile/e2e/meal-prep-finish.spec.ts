import { expect, Locator, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { D, emptyDraft, Food, nutrients, Recipe, recipeTotal } from '../src/domain/model';
const output = path.resolve('../../verification/meal-prep'), before = process.env.TG_CAPTURE_MEAL_PREP_BEFORE === '1';
const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', 'mvt:08.019', 'mvt:01.200'], amounts = ['200', '150', '15', '10', '50'];
const recipe: Recipe = { id: 'recipe-pasta', name: 'Chicken pesto pasta', servings: '6', cookedWeightGrams: '600', ingredients: ids.map((id, i) => ({ id: `ingredient-${i}`, food: (catalog as Food[]).find(food => food.id === id)!, quantity: amounts[i], unit: 'g' })), steps: ['Use the measured ingredients.'], favorite: false };
function fixture(weight: string | null = '600') { const older = { ...recipe, cookedWeightGrams: weight }; return { format: 'touche-grasse', version: 2, foods: older.ingredients.map(i => i.food), recipes: [older], logs: [], draft: emptyDraft(() => 'draft'), preparedBatches: [{ id: 'older', recipe: older, meal: 'Middag', createdAt: '2026-11-01T12:00:00Z' }, { id: 'newer', recipe: { ...older, id: 'another-recipe', name: 'Work lunches' }, meal: 'Lunsj', createdAt: '2026-11-02T12:00:00Z' }] }; }
async function restore(page: Page, source = fixture()) {
  const file = path.join(output, `fixture-${test.info().testId.replace(/[^a-z0-9]/gi, '')}.json`); writeFileSync(file, JSON.stringify(source));
  await page.goto('/settings'); const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click(); await (await choosing).setFiles(file); await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirm restore', exact: true })).toHaveCount(0);
}
async function exported(page: Page) { await page.goto('/settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8')); }
class Meter {
  actions: string[] = []; scrolls = 0;
  async tap(locator: Locator, name: string) {
    const clipped = await locator.evaluate(el => { const rect = el.getBoundingClientRect(); let top = 0, bottom = innerHeight; for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) { const box = p.getBoundingClientRect(); top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); } return rect.top < top || rect.bottom > bottom; });
    if (clipped) { this.scrolls++; await locator.scrollIntoViewIfNeeded(); } await locator.click(); this.actions.push(name);
  }
  result() { return { interactions: this.actions.length, scrolls: this.scrolls, actions: this.actions }; }
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });
test.use({ timezoneId: 'UTC' });

test('capture previous portion navigation and date interactions', async ({ page }) => {
  test.skip(!before, 'Historical baseline is captured before implementation only.');
  await restore(page); await page.goto('/'); await expect(page.getByTestId('today-portions')).toContainText(recipe.name); await page.screenshot({ path: path.join(output, 'before-today.png') });
  const open = new Meter(); await open.tap(page.getByRole('button', { name: 'All portions', exact: true }), 'Open all portions'); await open.tap(page.getByRole('button', { name: `Open saved batch ${recipe.name}`, exact: true }), 'Open target batch');
  await page.screenshot({ path: path.join(output, 'before-portions.png') });
  const date = new Meter(); await date.tap(page.getByRole('button', { name: 'Choose date', exact: true }), 'Choose date'); await date.tap(page.getByTestId('portion-date'), 'Focus date'); await page.getByTestId('portion-date').fill('2026-11-07'); date.actions.push('Enter date');
  const collapsed = new Meter(); await collapsed.tap(page.getByRole('button', { name: 'Open saved batch Work lunches', exact: true }), 'Open batch'); await collapsed.tap(page.getByTestId('log-portion'), 'Log serving');
  writeFileSync(path.join(output, 'before-interactions.json'), JSON.stringify({ openTargetFromToday: open.result(), chooseTomorrow: date.result(), logCollapsedBatch: collapsed.result() }, null, 2));
});

test('opens the correct batch from Today, changes dates quickly and logs collapsed batches in one action', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page); await page.goto('/'); await expect(page.getByTestId('today-portions')).toContainText(recipe.name); await page.screenshot({ path: path.join(output, 'after-today.png') });
  const open = new Meter(); await open.tap(page.getByRole('button', { name: `Adjust saved portions of ${recipe.name}`, exact: true }), 'Open target batch');
  await expect(page.getByRole('button', { name: 'Library portions', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByTestId('saved-batch-older'); await expect(panel).toContainText(recipe.name); await expect(panel.getByTestId('remaining-portions')).toHaveText('6 servings left · 600 g');
  await page.screenshot({ path: path.join(output, 'after-portions.png') });
  await page.getByRole('button', { name: 'Library recipes', exact: true }).click(); await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: `Adjust saved portions of ${recipe.name}`, exact: true }).click(); await expect(panel).toBeVisible();
  await page.getByRole('button', { name: 'Open saved batch Work lunches', exact: true }).click(); await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: `Adjust saved portions of ${recipe.name}`, exact: true }).click(); await expect(panel).toBeVisible();
  const date = new Meter(); await date.tap(panel.getByRole('button', { name: 'Choose date', exact: true }), 'Choose date'); await date.tap(panel.getByRole('button', { name: 'Tomorrow', exact: true }), 'Tomorrow'); await expect(panel.getByTestId('portion-date')).toHaveValue('2026-11-07');
  const collapsed = new Meter(); await collapsed.tap(page.getByRole('button', { name: 'Log 1 servings of Work lunches', exact: true }), 'Log serving');
  await expect(page.getByText('Saved portion logged', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const state = await exported(page); expect(state.logs).toHaveLength(1); expect(state.logs[0].preparedBatchId).toBe('newer'); expect(state.logs[0].recordedAt.slice(0, 10)).toBe('2026-11-06');
  expect(open.actions).toHaveLength(1); expect(date.actions).toHaveLength(2); expect(collapsed.actions).toHaveLength(1);
  writeFileSync(path.join(output, `after-interactions-${test.info().project.name || 'chromium'}.json`), JSON.stringify({ viewport: page.viewportSize(), openTargetFromToday: open.result(), chooseTomorrow: date.result(), logCollapsedBatch: collapsed.result(), note: 'Browser actions, not physical-device timing. Date operations and collapsed-batch logging start in Library.' }, null, 2));
});

test('six-serving cooking flow preserves exact snapshots, quantities, stock, future logging and Undo', async ({ page }) => {
  test.skip(before, 'After implementation.'); await page.goto('/entry'); await page.getByTestId('quick-text').fill('200g chicken breast, 150g dry pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (let i = 0; i < 3; i++) await page.getByTestId(`choice-${i}-${ids[i]}`).click();
  await page.getByTestId('quantity-0').fill('250'); for (let i = 1; i < 5; i++) await expect(page.getByTestId(`quantity-${i}`)).toHaveValue(amounts[i]); await page.getByTestId('quantity-0').fill('200');
  await page.getByRole('button', { name: 'Split into servings', exact: true }).click(); await page.getByRole('textbox', { name: 'Batch name', exact: true }).fill(recipe.name); await page.getByTestId('batch-servings').fill('6'); await page.getByTestId('batch-weight').fill('600');
  await page.screenshot({ path: path.join(output, 'after-split.png') }); await page.getByTestId('save-batch').click(); await page.getByRole('button', { name: 'Save remaining for later', exact: true }).click();
  const initial = await exported(page); expect(initial.logs).toHaveLength(0); expect(initial.preparedBatches).toHaveLength(1);
  await page.goto('/'); await page.getByRole('button', { name: `Log one saved serving of ${recipe.name}`, exact: true }).click();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  const first = await exported(page), all = recipeTotal(recipe); expect(first.logs).toHaveLength(1);
  for (const key of nutrients) expect(first.logs[0].nutrition[key]).toBe(new D(all[key]!).div(6).toFixed());
  await page.goto('/recipes'); const panel = page.locator('[data-testid^="saved-batch-"]'); await expect(panel.getByTestId('remaining-portions')).toContainText('5 servings left');
  await panel.getByRole('button', { name: 'Increase servings to log', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('2');
  await panel.getByRole('button', { name: 'Grams', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('200');
  await panel.getByRole('button', { name: 'Servings', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('2');
  await panel.getByTestId('portion-amount').fill('5'); await expect(panel.getByRole('button', { name: 'Increase servings to log', exact: true })).toBeDisabled();
  await panel.getByTestId('portion-amount').fill('6'); await expect(panel.getByTestId('log-portion')).toBeDisabled(); await expect(panel.getByTestId('portion-amount')).toHaveValue('6');
  await panel.getByTestId('portion-amount').fill('2'); await panel.getByRole('button', { name: 'Choose date', exact: true }).click(); await panel.getByRole('button', { name: 'Tomorrow', exact: true }).click(); await panel.getByTestId('log-portion').click(); await expect(panel.getByTestId('remaining-portions')).toContainText('3 servings left');
  await panel.getByRole('button', { name: 'Undo last portion', exact: true }).click(); await expect(panel.getByTestId('remaining-portions')).toContainText('5 servings left'); await page.reload(); await expect(page.getByTestId('remaining-portions')).toContainText('5 servings left');
  const final = await exported(page); expect(final.logs).toEqual(first.logs); expect(final.preparedBatches).toEqual(first.preparedBatches);
});

test('recurring gram conversion needs an amount, recipe servings are editable, and the final fraction remains one tap', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture('1000')); await page.goto('/recipes?view=portions&batch=older'); const panel = page.getByTestId('saved-batch-older');
  await panel.getByRole('button', { name: 'Grams', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue(''); await expect(panel.getByTestId('log-portion')).toBeDisabled(); await expect(panel).toContainText('No rounded conversion');
  await panel.getByRole('button', { name: 'Servings', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('1'); await panel.getByRole('button', { name: 'Grams', exact: true }).click();
  await panel.getByTestId('portion-amount').fill('100'); await panel.getByRole('button', { name: 'Servings', exact: true }).click(); await expect(panel.getByTestId('portion-amount')).toHaveValue('0.6');
  await panel.getByTestId('portion-amount').fill('5.5'); await panel.getByTestId('log-portion').click(); await expect(panel.getByTestId('remaining-portions')).toContainText('0.5 servings left'); await page.goto('/'); await page.getByRole('button', { name: `Log 0.5 saved servings of ${recipe.name}`, exact: true }).click();
  await expect(page.getByTestId('log-row')).toHaveCount(2);
  const all = await exported(page); expect(all.logs).toHaveLength(2); expect(all.logs.map((entry: { snapshot: { quantity: string } }) => entry.snapshot.quantity).sort()).toEqual(['0.5', '5.5']);
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Library recipes', exact: true }).click(); await page.getByRole('button', { name: `Open recipe ${recipe.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Increase number of servings', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Number of servings', exact: true })).toHaveValue('7'); for (let i = 0; i < 5; i++) await expect(page.getByTestId(`recipe-quantity-${i}`)).toHaveValue(amounts[i]);
  await expect(page.getByTestId('recipe-save-status')).toHaveText('Draft saved on this device.'); await page.reload(); await expect(page.getByRole('textbox', { name: 'Number of servings', exact: true })).toHaveValue('7'); await page.screenshot({ path: path.join(output, 'after-recipe.png'), fullPage: true });
});

test('portion review stays usable on a narrow screen with enlarged text and no assumed cooked weight', async ({ page }) => {
  test.skip(before, 'After implementation.'); await restore(page, fixture(null)); await page.goto('/recipes'); await page.getByRole('button', { name: 'Archived foods and recipes', exact: true }).click(); await page.getByRole('button', { name: 'Library portions', exact: true }).click(); await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left'); await page.setViewportSize({ width: 320, height: 700 }); await page.goto('/recipes?view=portions&batch=older');
  const panel = page.getByTestId('saved-batch-older'); await expect(panel.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll<HTMLElement>('div,span,input,textarea')).map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
    for (const { element, size, line } of values) { element.style.fontSize = `${size * 1.7}px`; element.style.lineHeight = Number.isFinite(line) ? `${line * 1.7}px` : '1.3'; }
  });
  await panel.getByTestId('portion-amount').click(); await page.keyboard.insertText('2'); await expect(panel.getByTestId('portion-amount')).toHaveValue('2');
  for (const locator of [panel.getByTestId('log-portion'), panel.getByRole('button', { name: 'Increase servings to log', exact: true }), panel.getByRole('button', { name: 'Choose date', exact: true })]) { await locator.scrollIntoViewIfNeeded(); const box = (await locator.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: path.join(output, 'after-portions-large-text.png'), fullPage: true });
});
