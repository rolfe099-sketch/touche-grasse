import { expect, Locator, Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { display, Food, foodNutrition, total } from '../src/domain/model';
const output = path.resolve('../../verification/food-matching');
const input = '200g kyllingbryst, 150g kokt ris, 80g red bell pepper, 100g ground beef';
const ids = ['mvt:03.205', 'mvt:05.338', 'mvt:06.048', 'mvt:03.397'];
function nutrition(amounts: string[]) { return total(ids.map((id, i) => foodNutrition((catalog as Food[]).find(food => food.id === id)!, amounts[i], 'g'))); }
class Meter {
  actions: string[] = []; scrolls = 0;
  constructor(private page: Page) {}
  async tap(locator: Locator, action: string) {
    const clipped = await locator.evaluate(el => {
      const box = el.getBoundingClientRect(); let top = 0, bottom = innerHeight;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) { const rect = parent.getBoundingClientRect(); top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
      return box.top < top || box.bottom > bottom;
    });
    if (clipped) { this.scrolls++; await locator.scrollIntoViewIfNeeded(); }
    await locator.click(); this.actions.push(action);
  }
  async text(value: string) {
    const input = this.page.getByTestId('quick-text');
    if (!await input.evaluate(el => el === document.activeElement)) await this.tap(input, 'Focus meal text');
    await input.fill(value); this.actions.push('Enter meal text');
  }
  result() { return { actions: this.actions, interactions: this.actions.length, scrolls: this.scrolls }; }
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('everyday bilingual ingredients: relevant choices, exact totals, learned return, independent edit and Undo', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); const cold = new Meter(page);
  await cold.tap(page.getByTestId('universal-log'), 'Open Log'); await cold.text(input);
  await expect(page.getByTestId('quantity-3')).toHaveValue('100'); await expect(page.getByTestId('commit-food')).toBeDisabled();
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
  await expect(page.getByTestId(`choice-0-${ids[0]}`)).toBeVisible();
  await page.screenshot({ path: path.join(output, 'first-time.png') });
  for (const [row, id] of ids.entries()) {
    if (row === 1) { await expect(page.getByTestId('ingredient-choices')).not.toContainText(/Chestnut|Noodles|uncooked/i); }
    if (row === 3) { await expect(page.getByTestId('ingredient-choices')).toContainText('13 %'); await expect(page.getByTestId('ingredient-choices')).not.toContainText(/Pork|starch|round|topside/i); }
    await cold.tap(page.getByTestId(`choice-${row}-${id}`), `Confirm ingredient ${row + 1}`);
  }
  const expected = nutrition(['200', '150', '80', '100']);
  await expect(page.getByTestId('meal-kcal')).toHaveText(`${display(expected.kcal, 0)} kcal`);
  await page.screenshot({ path: path.join(output, 'resolved.png') });
  await cold.tap(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText(display(expected.kcal, 0));
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  const returning = new Meter(page); await returning.tap(page.getByTestId('universal-log'), 'Open Log'); await returning.text(input);
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(0); await expect(page.getByTestId('commit-food')).toBeEnabled();
  await expect(page.getByTestId('ingredient-0')).toContainText('raw'); await expect(page.getByTestId('ingredient-1')).toContainText('cooked'); await expect(page.getByTestId('ingredient-3')).toContainText('13 %');
  await page.screenshot({ path: path.join(output, 'returning.png') });
  await returning.tap(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(8);
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill(input);
  await page.getByTestId('quantity-0').click(); await page.keyboard.insertText('250');
  for (const [row, amount] of [[1, '150'], [2, '80'], [3, '100']] as const) await expect(page.getByTestId(`quantity-${row}`)).toHaveValue(amount);
  await expect(page.getByTestId('meal-kcal')).toHaveText(`${display(nutrition(['250', '150', '80', '100']).kcal, 0)} kcal`);
  await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await page.getByTestId('quick-text').fill(input.replace('ground beef', 'ground beef cooked'));
  await expect(page.getByTestId('commit-food')).toBeDisabled(); await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
  await expect(page.getByTestId('choice-3-mvt:03.138')).toBeVisible(); await expect(page.getByTestId(`choice-3-${ids[3]}`)).toHaveCount(0);
  expect(errors).toEqual([]); expect(cold.scrolls).toBe(0); expect(returning.scrolls).toBe(0);
  expect(cold.actions.length - returning.actions.length).toBe(4);
  writeFileSync(path.join(output, `interactions-${test.info().project.name || 'chromium'}.json`), JSON.stringify({ input, viewport: page.viewportSize(), firstTime: cold.result(), returning: returning.result(), nutrition: expected, note: 'Actual browser actions, not human completion time or physical iPhone keyboard testing. Each focus, full-string entry and tap counted separately.' }, null, 2));
});

test('Discover uses the same relevant English/Norwegian matching without adding anything to the diary', async ({ page }) => {
  await page.goto('/search?view=ingredients'); const input = page.getByTestId('search-input');
  for (const [query, id] of [['ground beef', 'mvt:03.126'], ['bell pepper', 'mvt:06.048'], ['kyllingbryst', 'mvt:03.205'], ['kokt ris', 'mvt:05.338']]) {
    await input.fill(query); await expect(page.getByTestId(`food-${id}`).first()).toBeVisible();
    await expect(page.getByText('No matches. Try another name, or add your own food.', { exact: true })).toHaveCount(0);
  }
  await input.fill('ground beef'); await page.screenshot({ path: path.join(output, 'discover.png') });
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(0);
});
