import { test, expect, Page, Locator } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, LogEntry } from '../src/domain/model';
const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/quick-entry-polish/regressions');
const input = '200g chicken, 150g pasta, 15g pesto, 10g olive oil';
const selections = [['mvt:03.205', 'chicken fillet without skin raw'], ['mvt:05.016', 'pasta plain uncooked'], ['mvt:06.144', 'pesto green industrially made']] as const;
class Measurement {
  actions: string[] = []; scrolls = 0; start = performance.now();
  constructor(private page: Page, readonly scenario: string) {}
  async visible(locator: Locator) {
    const box = await locator.boundingBox(); const height = this.page.viewportSize()!.height;
    if (box && (box.y < 0 || box.y + box.height > height)) { this.scrolls++; await locator.scrollIntoViewIfNeeded(); }
  }
  async click(locator: Locator, name: string) { await this.visible(locator); await locator.click(); this.actions.push(name); }
  async enter(locator: Locator, text: string, name: string) { await this.visible(locator); if (!await locator.evaluate(el => el === document.activeElement)) { await locator.click(); this.actions.push(`Focus ${name}`); } await locator.fill(text); this.actions.push(`Enter ${name}`); }
  finish() { return { scenario: this.scenario, tapsAndTextActions: this.actions.length, scrolls: this.scrolls, totalIncludingScrolls: this.actions.length + this.scrolls, automatedMilliseconds: Math.round(performance.now() - this.start), actions: this.actions }; }
}
async function review(page: Page, m: Measurement, text = input) {
  await m.click(page.getByTestId('today-add'), 'Open Quick Entry');
  await m.enter(page.getByTestId('quick-text'), text, 'meal text');
  await expect(page.getByTestId('review-meal')).toHaveCount(0);
  await expect(page.getByTestId('quantity-0')).toBeVisible();
}
async function resolve(page: Page, m: Measurement, row: number, id: string, query: string) {
  const choice = page.getByTestId(`choice-${row}-${id}`);
  if (await choice.count()) await m.click(choice, `Confirm ingredient ${row + 1}`);
  else {
    await m.click(page.getByRole('button', { name: `Change food ${row + 1}`, exact: true }), `Open ingredient ${row + 1}`);
    await m.enter(page.getByTestId('entry-search'), query, `product search ${row + 1}`);
    await m.click(choice, `Confirm ingredient ${row + 1}`);
  }
}
test('five measured Quick Entry scenarios: cold meal, learned meal, ambiguity, isolated quantity edit, whole-meal repeat', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const results: ReturnType<Measurement['finish']>[] = [];
  await page.goto('/'); await expect(page.getByTestId('today-add')).toBeVisible();
  let m = new Measurement(page, 'Completely new four-ingredient meal'); await review(page, m);
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.screenshot({ path: path.join(output, 'new-meal-clarifications-390.png'), fullPage: true });
  for (const [row, [id, query]] of selections.entries()) await resolve(page, m, row, id, query);
  await expect(page.getByTestId('meal-nutrition')).toContainText('909 kcal');
  await page.screenshot({ path: path.join(output, 'resolved-meal-390.png'), fullPage: true });
  await m.click(page.getByTestId('commit-food'), 'Log whole meal');
  await expect(page.getByTestId('log-row')).toHaveCount(4); results.push(m.finish());
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  m = new Measurement(page, 'Previously recognized four-ingredient meal'); await review(page, m);
  await expect(page.getByTestId('commit-food')).toBeEnabled();
  await expect(page.getByText(/^Which /)).toHaveCount(0);
  await m.click(page.getByTestId('commit-food'), 'Log whole meal');
  await expect(page.getByTestId('log-row')).toHaveCount(8); results.push(m.finish());
  await page.getByRole('button', { name: 'Undo last log' }).click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  m = new Measurement(page, 'One unfamiliar ambiguous ingredient'); await review(page, m, '100g rice');
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await m.click(page.locator('[data-testid^="choice-0-"]').first(), 'Confirm rice product');
  await m.click(page.getByTestId('commit-food'), 'Log whole meal'); await expect(page.getByTestId('log-row')).toHaveCount(5); results.push(m.finish());
  await page.getByRole('button', { name: 'Undo last log' }).click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  m = new Measurement(page, 'Recognized meal with one quantity correction'); await review(page, m);
  for (let row = 0; row < 4; row++) await expect(page.getByTestId(`quantity-${row}`)).toBeInViewport({ ratio: 1 });
  await m.enter(page.getByTestId('quantity-1'), '175', 'pasta quantity');
  await expect(page.getByTestId('quantity-0')).toHaveValue('200'); await expect(page.getByTestId('quantity-2')).toHaveValue('15'); await expect(page.getByTestId('quantity-3')).toHaveValue('10');
  await m.click(page.getByTestId('commit-food'), 'Log whole meal'); await expect(page.getByTestId('log-row')).toHaveCount(8); results.push(m.finish());
  await page.getByRole('button', { name: 'Undo last log' }).click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  m = new Measurement(page, 'Repeat previously logged four-ingredient meal');
  await expect(page.getByTestId('repeat-meal').first()).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'today-frequent-meal-390.png') });
  await m.click(page.getByTestId('repeat-meal').first(), 'Repeat whole meal'); await expect(page.getByTestId('log-row')).toHaveCount(8); results.push(m.finish());
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('1,818');
  await page.getByRole('button', { name: 'Undo last log' }).click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true); await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await page.getByTestId('today-add').click(); await page.getByTestId('quick-text').fill(input); await expect(page.getByTestId('commit-food')).toBeEnabled();
  expect(results[1].tapsAndTextActions).toBe(3); expect(results[3].scrolls).toBe(0); expect(results[4].tapsAndTextActions).toBe(1); expect(results[4].scrolls).toBe(0);
  expect(errors).toEqual([]);
  writeFileSync(path.join(output, 'interaction-measurements.json'), JSON.stringify({ environment: 'Desktop Chromium, 390×844. Isolated context; real catalog and IndexedDB. Automated elapsed times include assertions and driver overhead, not human typing or iPhone completion times. Each focus, text entry and button tap is counted separately; scrollIntoView counted separately.', results }, null, 2));
});

test('inline correction teaches the replacement, keeps other amounts, and persists a food favorite', async ({ page }) => {
  await page.goto('/'); await expect(page.getByTestId('today-add')).toBeVisible();
  const m = new Measurement(page, 'Unmeasured correction verification');
  await review(page, m, '150g pasta, 10g olive oil');
  await resolve(page, m, 0, 'mvt:05.016', 'pasta plain uncooked');
  await page.getByTestId('commit-food').click(); await expect(page.getByTestId('log-row')).toHaveCount(2);
  await page.getByTestId('today-add').click(); await page.getByTestId('quick-text').fill('150g pasta, 10g olive oil');
  await expect(page.getByTestId('commit-food')).toBeEnabled();
  await page.getByRole('button', { name: 'Change food 1', exact: true }).click();
  await page.getByTestId('entry-search').fill('pasta plain cooked');
  await page.getByTestId('food-mvt:05.130').click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('150'); await expect(page.getByTestId('quantity-1')).toHaveValue('10');
  await page.getByRole('button', { name: 'Change food 1', exact: true }).click();
  await page.getByRole('button', { name: 'Favorite Pasta, naturell, kokt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfavorite Pasta, naturell, kokt', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Change food 1', exact: true }).click(); await expect(page.getByRole('button', { name: 'Unfavorite Pasta, naturell, kokt', exact: true })).toBeVisible();
  await page.getByTestId('commit-food').click(); await expect(page.getByTestId('log-row')).toHaveCount(4);
  await page.reload(); await page.getByTestId('today-add').click(); await page.getByTestId('quick-text').fill('150g pasta, 10g olive oil');
  await expect(page.getByTestId('ingredient-0')).toContainText('Plain pasta');
  await expect(page.getByTestId('quantity-1')).toHaveValue('10');
});

test('live typing, one-tap quantity replacement, append, rename, removal and draft reload stay synchronized', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').pressSequentially('10g olive oil', { delay: 10 });
  await expect(page.getByTestId('quick-text')).toBeFocused();
  await expect(page.getByTestId('quantity-0')).toHaveValue('10'); await expect(page.getByTestId('commit-food')).toBeEnabled();
  await expect(page.getByTestId('quantity-0')).toBeInViewport({ ratio: 1 });
  await page.getByTestId('quantity-0').click(); await expect(page.getByTestId('quantity-0')).toBeFocused();
  await page.keyboard.insertText('25'); await expect(page.getByTestId('quantity-0')).toHaveValue('25');
  await expect(page.getByTestId('quick-text')).toHaveValue('25g olive oil');
  await page.getByTestId('quick-text').fill('25g olive oil, 200g chicken');
  const m = new Measurement(page, 'Unmeasured live reconciliation'); await resolve(page, m, 1, 'mvt:03.205', 'chicken fillet without skin raw');
  await expect(page.getByTestId('quantity-0')).toHaveValue('25');
  await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('25'); await expect(page.getByTestId('ingredient-1')).toContainText('Chicken fillet, skinless');
  await page.getByTestId('quick-text').fill('25g olive oil, 200g chicken, 15g pesto');
  await expect(page.getByTestId('ingredient-1')).toContainText('Chicken fillet, skinless');
  await page.getByTestId('quick-text').fill('25g olive oil, 200g chicken cooked');
  await expect(page.getByTestId('ingredient-1')).not.toContainText('Chicken fillet, skinless');
  await expect(page.getByTestId('entry-search')).toHaveValue('chicken cooked');
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.getByRole('button', { name: 'Remove chicken cooked', exact: true }).click();
  await expect(page.getByTestId('quick-text')).toHaveValue('25g olive oil');
  await expect(page.getByTestId('quantity-0')).toHaveValue('25');
  await page.getByTestId('quick-text').fill('25g olive oil, 20g'); await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.getByTestId('quick-text').fill('25g olive oil'); await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('log-row')).toHaveCount(1); await expect(page.getByTestId('nutrition-kcal')).toHaveText('223');
});

test('Today exposes the two usual meals without scrolling and ranks frequency above recency', async ({ page }) => {
  const food = (id: string) => catalog.find(f => f.id === id)! as Food;
  const logs: LogEntry[] = [];
  function batch(id: string, date: string, ingredients: [string, string][]) {
    ingredients.forEach(([foodId, quantity], i) => {
      const record = food(foodId); logs.push({ id: id + i, batchId: id, recordedAt: date, meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: id + i, food: record, quantity, unit: 'g' } }, nutrition: foodNutrition(record, quantity, 'g') });
    });
  }
  batch('usual-older', '2026-10-20T12:00:00Z', [['mvt:08.019', '10'], ['mvt:03.205', '200']]);
  batch('usual-newer', '2026-10-21T12:00:00Z', [['mvt:08.019', '10'], ['mvt:03.205', '200']]);
  batch('latest', '2026-10-22T12:00:00Z', [['mvt:05.016', '150'], ['mvt:06.144', '15']]);
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-frequency-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'touche-grasse', version: 2, foods: [], recipes: [], logs, draft: emptyDraft(() => 'fixture-draft') })) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto('/');
  const shortcuts = page.getByTestId('repeat-meal'); await expect(shortcuts).toHaveCount(2);
  await expect(shortcuts.nth(0)).toContainText('Olivenolje'); await expect(shortcuts.nth(0)).toContainText('311 kcal');
  await expect(shortcuts.nth(1)).toContainText('Pasta');
  await expect(shortcuts.nth(0)).toBeInViewport({ ratio: 1 }); await expect(shortcuts.nth(1)).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'today-two-frequent-meals-390.png') });
  await shortcuts.nth(0).click(); await expect(page.getByTestId('log-row')).toHaveCount(2);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('311');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(0);
});
