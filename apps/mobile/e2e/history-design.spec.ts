import { expect, Page, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import catalog from '../src/data/catalog.json';
import { dayKey, display, emptyDraft, Food, foodNutrition, LogEntry, recipePortion } from '../src/domain/model';
import { pestoSubtotal } from '../tests/pesto-fixture';

const screenshots = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/design-revision');
const food = (id: string) => catalog.find(f => f.id === id)! as Food;
const at = (date: string, time = '12:30') => new Date(`${date}T${time}:00`).toISOString();
// All fixture records live in isolated browser contexts and are imported through the real restore UI.
// Quantities are test inputs. Nutrients always come from the captured catalog, never invented values.
function historyArchive() {
  const recipe = { ...pestoSubtotal(), name: 'Pesto chicken pasta · measured subtotal', favorite: true, steps: ['Cut the raw chicken into strips. Cook the dry pasta.', 'Combine the seven measured ingredients and divide into six servings.', 'Verification recipe: stock and seasonings are excluded until amounts are known.'] };
  const logs: LogEntry[] = [];
  function add(date: string, id: string, quantity: string, meal: LogEntry['meal'] = 'Middag') {
    const source = food(id); logs.push({ id: randomUUID(), batchId: randomUUID(), recordedAt: at(date, meal === 'Lunsj' ? '12:30' : '18:20'), meal, snapshot: { kind: 'food', ingredient: { id: randomUUID(), food: source, quantity, unit: 'g' } }, nutrition: foodNutrition(source, quantity, 'g') });
  }
  for (const [i, date] of ['2026-09-04', '2026-09-08', '2026-09-20', '2026-10-02', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-19', '2026-10-21', '2026-10-23'].entries()) {
    add(date, 'mvt:03.205', String(180 + i * 10)); add(date, 'mvt:05.016', String(90 + i * 5), 'Lunsj');
  }
  const today = dayKey(new Date());
  logs.push({ id: randomUUID(), batchId: randomUUID(), recordedAt: at(today, '18:10'), meal: 'Middag', snapshot: { kind: 'recipe', recipe, quantity: '1', unit: 'servings' }, nutrition: recipePortion(recipe) });
  add(today, 'mvt:06.103', '60', 'Lunsj');
  return { format: 'touche-grasse', version: 2, profile: { firstUsedAt: at('2026-09-01') }, foods: recipe.ingredients.map(i => i.food), recipes: [recipe], logs, draft: emptyDraft(randomUUID) };
}
async function importArchive(page: Page) {
  const archive = historyArchive();
  await page.goto('/settings');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-verification-history.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  return archive;
}

test('real historical backup → four scopes → chart selection → calendar → auditable correction', async ({ page }) => {
  if (process.env.TG_STILL_REDUCED === '1') await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const archive = await importArchive(page);
  await page.goto('/'); await page.getByTestId('today-add').waitFor();
  await page.screenshot({ path: path.join(screenshots, 'today-populated-390.png') });
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  // The archive uses October dates; do not depend on the wall-clock month.
  await page.goto('/history?date=2026-10-05&scope=month');
  await expect(page.getByText('Shaded days are recorded or reviewed. Tap a date to open its diary.', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'history-month-390.png') });
  await page.getByTestId('calendar-2026-10-05').click();
  const expected = foodNutrition(food('mvt:03.205'), '220', 'g');
  await expect(page.getByTestId('history-screen').getByTestId('log-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'View Kylling, filet, uten skinn, rå entry', exact: true }).filter({ visible: true }).click();
  await expect(page.getByTestId('log-screen').getByTestId('nutrition-kcal')).toHaveText(display(expected.kcal, 0));
  await page.getByRole('textbox', { name: 'Logged amount', exact: true }).fill('440');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await page.reload(); await expect(page.getByText('440 g', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'View Kylling, filet, uten skinn, rå entry', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'View 1 correction', exact: true }).click();
  await expect(page.getByText(/Previous: 220 g/)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  const selectionStart = performance.now();
  await page.getByTestId('chart-2026-10-08').click();
  await expect(page.getByTestId('chart-2026-10-08')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Open Thu 8 Oct', exact: true })).toBeVisible();
  writeFileSync(path.join(screenshots, 'chart-selection-timing.json'), JSON.stringify({ description: 'Desktop Chromium click-to-tooltip including Playwright overhead; not an iPhone benchmark', milliseconds: performance.now() - selectionStart }, null, 2));
  await page.screenshot({ path: path.join(screenshots, 'history-week-390.png') });
  await page.getByRole('button', { name: 'Lifetime', exact: true }).click();
  await expect(page.getByText('meals recorded', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'history-all-time-390.png') });
  await page.getByRole('button', { name: 'Go to first logged day', exact: true }).click();
  await expect(page.getByTestId('history-screen').getByTestId('log-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Choose history date', exact: true }).click();
  await page.getByRole('textbox', { name: 'Jump to date (YYYY-MM-DD)', exact: true }).fill('2026-09-05');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.getByText('No food recorded on this day', { exact: true })).toBeVisible();
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('–');
  expect(archive.logs.length).toBeGreaterThan(1); expect(errors).toEqual([]);
});

test('cookbook layout, inline amounts, retained recipe edits and English search aliases', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await importArchive(page); await page.goto('/recipes');
  await page.getByRole('button', { name: /^Open recipe / }).click();
  await page.getByTestId('recipe-quantity-2').fill('150');
  await expect(page.getByTestId('recipe-quantity-0')).toHaveValue('1200');
  await expect(page.getByTestId('recipe-quantity-6')).toHaveValue('40');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /^Open recipe / }).click();
  await expect(page.getByTestId('recipe-quantity-2')).toHaveValue('150');
  await page.reload(); await expect(page.getByTestId('recipe-quantity-2')).toHaveValue('150');
  await page.screenshot({ path: path.join(screenshots, 'recipe-editor-390.png') });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: path.join(screenshots, 'recipe-editor-375.png') });
  await page.getByText('In the kitchen', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'recipe-preparation-375.png') });
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await page.screenshot({ path: path.join(screenshots, 'cookbook-375.png') });
  await page.getByRole('tab', { name: 'Discover', exact: true }).click(); await page.getByRole('button', { name: 'Ingredients', exact: true }).click();
  await page.getByTestId('search-input').fill('olive oil');
  await expect(page.getByTestId('food-mvt:08.019')).toBeVisible();
});

test('user-selected recipe photo survives save, reload and backup export', async ({ page }) => {
  await page.goto('/recipe');
  await page.getByRole('textbox', { name: 'Recipe name', exact: true }).fill('Photo persistence · test only');
  await page.getByRole('textbox', { name: 'Add an ingredient', exact: true }).fill('olivenolje');
  await page.getByTestId('food-mvt:08.019').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add your photo', exact: true }).click();
  // A tiny synthetic PNG tests file plumbing; it is never shipped as food photography.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH0sAAAAASUVORK5CYII=', 'base64');
  await (await chooser).setFiles({ name: 'test-pixel.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByLabel('Your recipe photo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/); await page.reload();
  await expect(page.getByLabel('Your photo of Photo persistence · test only', { exact: true })).toBeVisible();
  await page.goto('/settings'); const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await (await download).path();
  const { readFileSync } = await import('node:fs');
  const backup = JSON.parse(readFileSync(file!, 'utf8')); expect(backup.recipes[0].photo).toBe(`data:image/png;base64,${png.toString('base64')}`);
});

test('empty History reports missing intake and honours reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/history');
  await expect(page.getByText('0 of 7 days', { exact: true })).toBeVisible();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('–');
  await page.getByRole('button', { name: 'Lifetime', exact: true }).click();
  await expect(page.getByText('Your first recorded meal will start this view. There is no intake history yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to first logged day', exact: true })).toBeDisabled();
  await page.screenshot({ path: path.join(screenshots, 'history-empty-390.png') });
});

test('a retained cookbook draft and a new meal can be combined without losing either', async ({ page }) => {
  await page.goto('/recipe');
  await page.getByRole('textbox', { name: 'Recipe name', exact: true }).fill('An unfinished recipe');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('today-add').click(); await page.getByTestId('entry-search').fill('olivenolje');
  await page.getByTestId('food-mvt:08.019').click(); await page.getByTestId('quantity-0').fill('10');
  await page.getByRole('button', { name: 'Make a recipe', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Recipe name', exact: true })).toHaveValue('An unfinished recipe');
  await page.getByRole('button', { name: "Add this meal's ingredients", exact: true }).click();
  await expect(page.getByTestId('recipe-quantity-0')).toHaveValue('10');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open recipe An unfinished recipe', exact: true })).toBeVisible();
});
