import { test, expect, Page, Locator } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { FoodIndex } from '../src/domain/search';
import { display, foodNutrition, total, Food } from '../src/domain/model';
const output = path.resolve(process.env.TG_POLISH_OUTPUT ?? '../../verification/quick-entry-polish');
const input = '200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan';
const before = process.env.TG_CAPTURE_BEFORE === '1';
class Meter {
  actions: string[] = []; scrolls = 0;
  constructor(private page: Page) {}
  async show(locator: Locator) {
    const clipped = await locator.evaluate(el => { let r = el.getBoundingClientRect(); let top = 0, bottom = innerHeight; for (let p = el.parentElement; p; p = p.parentElement) { if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) { const b = p.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); } } return r.top < top || r.bottom > bottom; });
    if (clipped) { this.scrolls++; await locator.scrollIntoViewIfNeeded(); }
  }
  async click(locator: Locator, name: string) { await this.show(locator); await locator.click(); this.actions.push(name); }
  async enter(locator: Locator, value: string, name: string) { await this.show(locator); if (!await locator.evaluate(el => el === document.activeElement)) { await locator.click(); this.actions.push(`Focus ${name}`); } await locator.fill(value); this.actions.push(`Enter ${name}`); }
  result() { return { actions: this.actions, tapsAndTextActions: this.actions.length, scrolls: this.scrolls, total: this.actions.length + this.scrolls }; }
}
const targets = [['mvt:03.205', 'chicken fillet without skin raw'], ['mvt:05.016', 'pasta plain uncooked'], ['mvt:06.144', 'pesto green industrially made'], ['mvt:08.019', 'olive oil'], ['mvt:01.200', 'parmesan']] as const;
test('capture exact five-ingredient baseline', async ({ page }) => {
  test.skip(!before, 'Historical baseline is captured before implementation only.');
  const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));
  writeFileSync(path.join(output, 'before-ranking.json'), JSON.stringify(Object.fromEntries(['chicken', 'pasta', 'pesto', 'parmesan', 'parmigiano reggiano'].map(query => [query, index.search(query).slice(0, 8).map(food => ({ id: food.id, name: food.name, english: food.aliases[0] }))])), null, 2));
  await page.goto('/'); await expect(page.getByTestId('today-add')).toBeVisible();
  const cold = new Meter(page); await cold.click(page.getByTestId('today-add'), 'Open Quick Entry'); await cold.enter(page.getByTestId('quick-text'), input, 'meal text');
  await expect(page.getByTestId('quantity-4')).toHaveValue('50'); await page.screenshot({ path: path.join(output, 'before-first-time-390.png') });
  for (const [row, [id, query]] of targets.entries()) {
    if (await page.getByTestId(`choice-${row}-${id}`).count()) await cold.click(page.getByTestId(`choice-${row}-${id}`), `Confirm ingredient ${row + 1}`);
    else if (await page.getByTestId(`match-search-${row}`).count()) { await cold.enter(page.getByTestId(`match-search-${row}`), query, `product filter ${row + 1}`); await cold.click(page.getByTestId(`choice-${row}-${id}`), `Confirm ingredient ${row + 1}`); }
  }
  await expect(page.getByTestId('commit-food')).toBeEnabled(); await cold.click(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(5);
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(5);
  const returning = new Meter(page); await returning.click(page.getByTestId('today-add'), 'Open Quick Entry'); await returning.enter(page.getByTestId('quick-text'), input, 'meal text');
  await expect(page.getByTestId('commit-food')).toBeEnabled(); await page.screenshot({ path: path.join(output, 'before-returning-390.png') }); await returning.click(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(10);
  writeFileSync(path.join(output, 'before-interactions.json'), JSON.stringify({ input, viewport: '390x844', firstTime: cold.result(), returning: returning.result(), method: 'Focus, full-string entry and taps counted separately; scroll-to-view counted separately, including clipping by the entry scroll container.' }, null, 2));
});

test('exact meal: relevant sequential choices, verified live subtotal, learned return, inline quantities and undo', async ({ page }) => {
  test.skip(before, 'Run after rebuilding the review.');
  const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));
  const quantities = ['200', '150', '15', '10', '50'];
  const expected = total(targets.map(([id], i) => foodNutrition(index.get(id)!, quantities[i], 'g')));
  const ranking = Object.fromEntries(['chicken', 'kylling', 'pasta', 'chicken breast raw', 'pasta dry', 'pasta cooked', 'pesto', 'parmesan', 'parmigiano reggiano'].map(query => [query, index.search(query).slice(0, 5).map(food => ({ id: food.id, name: food.name, english: food.aliases[0] }))]));
  writeFileSync(path.join(output, 'after-ranking.json'), JSON.stringify(ranking, null, 2));
  expect(ranking.chicken.slice(0, 3).every(food => /fillet|breast|thigh|leg|drumstick/i.test(food.english))).toBe(true);
  expect(ranking.chicken.slice(0, 3).some(food => /paste|liver/i.test(food.english))).toBe(false);
  expect(ranking.pasta.slice(0, 2).map(food => food.id).sort()).toEqual(['mvt:05.016', 'mvt:05.130']);
  await page.goto('/'); await expect(page.getByTestId('today-add')).toBeVisible();
  const cold = new Meter(page); await cold.click(page.getByTestId('today-add'), 'Open Quick Entry'); await cold.enter(page.getByTestId('quick-text'), input, 'meal text');
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
  await expect(page.getByTestId('entry-search')).toHaveCount(1);
  await expect(page.getByTestId('meal-kcal')).toHaveText('296 kcal');
  await expect(page.getByText('Resolved subtotal · 2/5', { exact: true })).toBeVisible();
  for (let row = 0; row < 5; row++) await expect(page.getByTestId(`quantity-${row}`)).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'after-first-time-390.png') });
  for (const [row, subtotal] of [[0, '518 kcal'], [1, '1,039 kcal'], [2, '1,116 kcal']] as const) {
    await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
    const choice = page.getByTestId(`choice-${row}-${targets[row][0]}`);
    await expect(choice).toBeInViewport({ ratio: 1 });
    await cold.click(choice, `Confirm ingredient ${row + 1}`);
    await expect(page.getByTestId('meal-kcal')).toHaveText(subtotal);
  }
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(0);
  await expect(page.getByTestId('ingredient-0')).toContainText('raw'); await expect(page.getByTestId('ingredient-1')).toContainText('dry');
  await expect(page.getByTestId('meal-nutrition')).toContainText(`Protein ${display(expected.protein)} g`);
  await expect(page.getByTestId('meal-nutrition')).toContainText(`Carbs ${display(expected.carbohydrate)} g`);
  await expect(page.getByTestId('meal-nutrition')).toContainText(`Fat ${display(expected.fat)} g`);
  await page.screenshot({ path: path.join(output, 'after-resolved-390.png') });
  await cold.click(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(5); await expect(page.getByTestId('nutrition-kcal')).toHaveText('1,116');
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(5);
  const returning = new Meter(page); await returning.click(page.getByTestId('today-add'), 'Open Quick Entry'); await returning.enter(page.getByTestId('quick-text'), input, 'meal text');
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(0); await expect(page.getByTestId('commit-food')).toBeEnabled();
  for (let row = 0; row < 5; row++) await expect(page.getByTestId(`quantity-${row}`)).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'after-returning-390.png') });
  await returning.click(page.getByTestId('commit-food'), 'Log meal'); await expect(page.getByTestId('log-row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(5);
  expect(cold.result().tapsAndTextActions).toBe(6); expect(cold.scrolls).toBe(0); expect(returning.result().tapsAndTextActions).toBe(3); expect(returning.scrolls).toBe(0);
  writeFileSync(path.join(output, 'after-interactions.json'), JSON.stringify({ input, viewport: '390x844', firstTime: cold.result(), returning: returning.result(), verifiedNutrition: expected, confirmedIds: targets.map(([id]) => id), method: 'Same exact input; meter now skips a focus tap only when the field is already focused; focus, text entry, taps and scroll-to-view counted separately. Not human completion time or an iPhone keyboard test.' }, null, 2));
  // A learned match stays editable, independently of every other row.
  await page.getByTestId('today-add').click(); await page.getByTestId('quick-text').fill(input);
  await page.getByTestId('quantity-4').click(); await page.keyboard.insertText('55');
  for (let row = 0; row < 4; row++) await expect(page.getByTestId(`quantity-${row}`)).toHaveValue(quantities[row]);
  await expect(page.getByTestId('meal-kcal')).toHaveText('1,137 kcal'); await page.reload(); await expect(page.getByTestId('quantity-4')).toHaveValue('55');
  await page.getByTestId('quick-text').fill(input.replace('chicken,', 'chicken cooked,'));
  await expect(page.getByTestId('commit-food')).toBeDisabled(); await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
  await expect(page.getByTestId('choice-0-mvt:03.418')).toBeVisible(); await expect(page.getByTestId('choice-0-mvt:03.205')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change unit row 1, g', exact: true }).click(); await expect(page.getByTestId('ingredient-choices')).toHaveCount(0);
  await page.getByRole('button', { name: 'Unit g row 1', exact: true }).click(); await expect(page.getByTestId('ingredient-choices')).toHaveCount(1);
  await page.getByRole('button', { name: 'Change unit row 1, g', exact: true }).click(); await page.getByTestId('quick-text').fill(input);
  await expect(page.getByTestId('ingredient-choices')).toHaveCount(0); await expect(page.getByTestId('commit-food')).toBeEnabled();
});
