import { test, expect, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { D, display, emptyDraft, Food, LogEntry, Recipe, recipePortion, total } from '../src/domain/model';
import { addDays } from '../src/domain/history';
const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/dark-redesign');
const food = (id: string) => catalog.find(record => record.id === id)! as Food;
const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', 'mvt:08.019', 'mvt:01.200'];
const chicken: Recipe = { id: 'qa:chicken', name: 'Chicken & pesto pasta', ingredients: ids.map((id, i) => ({ id: `qa:ingredient-${i}`, food: food(id), quantity: ['200', '150', '15', '10', '50'][i], unit: 'g' })), servings: '6', cookedWeightGrams: '600', steps: ['Cook the measured ingredients. Weigh the final batch before using gram portions.'], favorite: true };
const yogurt: Recipe = { id: 'qa:yogurt', name: 'Yogurt & blueberries', ingredients: [{ id: 'qa:y', food: food('mvt:01.334'), quantity: '200', unit: 'g' }, { id: 'qa:b', food: food('mvt:06.502'), quantity: '75', unit: 'g' }], servings: '1', cookedWeightGrams: null, steps: [], favorite: false };
function fixture() {
  const logs: LogEntry[] = [];
  for (const offset of [-8, -5, -3, -1, 0]) {
    const date = addDays(new Date(), offset); date.setHours(8, 30, 0, 0);
    logs.push({ id: randomUUID(), batchId: randomUUID(), recordedAt: date.toISOString(), meal: 'Frokost', snapshot: { kind: 'recipe', recipe: yogurt, quantity: '1', unit: 'servings' }, nutrition: recipePortion(yogurt) });
    date.setHours(12, 40); logs.push({ id: randomUUID(), batchId: randomUUID(), ...(offset === 0 ? { preparedBatchId: 'qa:saved-batch' } : {}), recordedAt: date.toISOString(), meal: 'Lunsj', snapshot: { kind: 'recipe', recipe: chicken, quantity: '1', unit: 'servings' }, nutrition: recipePortion(chicken) });
  }
  return { format: 'touche-grasse', version: 2, foods: [...chicken.ingredients, ...yogurt.ingredients].map(i => i.food), recipes: [chicken, yogurt], logs, draft: emptyDraft(randomUUID), preparedBatches: [{ id: 'qa:saved-batch', createdAt: new Date().toISOString(), meal: 'Lunsj', recipe: chicken }] };
}
async function restore(page: Page) {
  const archive = fixture(); await page.goto('/settings'); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-design-qa.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible(); return archive;
}
async function exportJSON(page: Page) { await page.goto('/settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8')); }
async function apply(page: Page, text: string) { if (!(await page.getByTestId('voice-command').isVisible())) await page.getByRole('button', { name: 'Type commands', exact: true }).click(); await page.getByTestId('voice-command').fill(text); await page.getByRole('button', { name: 'Apply meal command', exact: true }).click(); }

test('redesigned navigation, Today one-tap saved portion, Library search and four history scopes preserve source snapshots', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByTestId('today-overview')).toBeVisible(); await page.screenshot({ path: path.join(output, 'today-empty-390.png') });
  const archive = await restore(page); await page.goto('/');
  const expected = total([recipePortion(chicken), recipePortion(yogurt)]);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText(display(expected.kcal, 0));
  for (const row of await page.getByTestId('log-row').all()) await expect(row).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('tab')).toHaveText(['Today', 'Library', 'Discover', 'History']);
  const log = page.getByRole('button', { name: 'Log one saved serving of Chicken & pesto pasta', exact: true }); await expect(log).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('today-portions')).toContainText('5 servings left'); await page.screenshot({ path: path.join(output, 'today-390.png') });
  await log.click(); await expect(page.getByTestId('today-portions')).toContainText('4 servings left');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('today-portions')).toContainText('5 servings left');
  await page.getByRole('tab', { name: 'Library', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Search your library' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase servings to log', exact: true }).click(); await expect(page.getByTestId('portion-amount')).toHaveValue('2');
  await expect(page.getByTestId('remaining-portions')).toContainText('5 servings left'); await page.getByRole('button', { name: 'Decrease servings to log', exact: true }).click(); await expect(page.getByTestId('portion-amount')).toHaveValue('1');
  await page.getByRole('button', { name: 'Library recipes', exact: true }).click(); await page.screenshot({ path: path.join(output, 'library-390.png') });
  await page.getByRole('button', { name: 'Library foods', exact: true }).click(); await page.getByRole('textbox', { name: 'Search your library' }).fill('olive'); await expect(page.getByTestId('food-mvt:08.019')).toBeVisible();
  await page.getByRole('tab', { name: 'Discover', exact: true }).click(); await expect(page.getByRole('button', { name: 'Explore Ingredients', exact: true })).toBeVisible(); await page.screenshot({ path: path.join(output, 'discover-390.png') });
  await page.getByTestId('search-input').fill('kylling'); await expect(page.getByTestId('food-mvt:03.205')).toBeVisible();
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  for (const name of ['Day', 'Week', 'Month', 'Lifetime']) { await page.getByRole('button', { name, exact: true }).click(); await expect(page.getByTestId('history-screen')).toBeVisible(); if (name === 'Week') await page.screenshot({ path: path.join(output, 'history-390.png') }); }
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByTestId('universal-log').click(); await expect(page.getByTestId('voice-start')).toBeVisible(); await page.screenshot({ path: path.join(output, 'log-390.png') });
  await page.getByRole('button', { name: 'Type commands', exact: true }).click(); await page.screenshot({ path: path.join(output, 'voice-390.png') }); await page.getByRole('button', { name: 'Hide commands', exact: true }).click();
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click(); await expect(page.getByTestId('inline-scanner')).toBeVisible(); await expect(page).toHaveURL(/\/entry$/);
  const backup = await exportJSON(page); expect(backup.logs).toHaveLength(archive.logs.length); expect(backup.logs.find((item: LogEntry) => item.id === archive.logs[0].id)).toEqual(archive.logs[0]);
  await page.setViewportSize({ width: 430, height: 932 }); await page.goto('/');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText(display(expected.kcal, 0));
  for (const row of await page.getByTestId('log-row').all()) await expect(row).toBeInViewport({ ratio: 1 });
  const center = (await page.getByTestId('universal-log').boundingBox())!;
  expect(Math.abs(center.x + center.width / 2 - 215)).toBeLessThan(1);
  await page.screenshot({ path: path.join(output, 'today-430.png') });
  expect(errors).toEqual([]); writeFileSync(path.join(output, 'interaction-proof.json'), JSON.stringify({ viewport: '390x844', todaySavedPortion: { actions: 1, scrolls: 0, before: 5, after: 4, undo: 5 }, nutrition: expected, historicalLogsPreserved: archive.logs.length, runtimeErrors: errors }, null, 2));
});

test('simulated speech adapter final events and typed commands share verified review, recipe building and finite portions', async ({ page }) => {
  // This verifies adapter events, not microphone/audio recognition accuracy. No fixture provider ships in the app.
  await page.addInitScript(() => {
    class RecognitionFixture {
      static session: RecognitionFixture; onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void; onerror?: (event: unknown) => void;
      constructor() { RecognitionFixture.session = this; } start() { this.onstart?.(); } stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: RecognitionFixture, qaSpeech: (text: string, final: boolean) => { const session = RecognitionFixture.session; session.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] }); if (final) session.onend?.(); } });
  });
  await page.goto('/'); await page.getByTestId('universal-log').click(); await page.getByTestId('voice-start').click();
  await page.evaluate(() => (window as unknown as { qaSpeech: (text: string, final: boolean) => void }).qaSpeech('Add 200', false)); await expect(page.getByTestId('quantity-0')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { qaSpeech: (text: string, final: boolean) => void }).qaSpeech('Add 200 grams of chicken and 10 grams of olive oil', true));
  await expect(page.getByTestId('quantity-0')).toHaveValue('200'); await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.getByTestId('choice-0-mvt:03.205').click(); await expect(page.getByTestId('commit-food')).toBeEnabled();
  await apply(page, 'Change chicken to 250 grams'); await expect(page.getByTestId('quantity-0')).toHaveValue('250'); await expect(page.getByTestId('quantity-1')).toHaveValue('10');
  await apply(page, 'Start a recipe called Chicken supper'); await expect(page.getByText('Chicken supper', { exact: true })).toBeVisible();
  await apply(page, 'Split into six servings'); await expect(page.getByTestId('batch-servings')).toHaveValue('6');
  await apply(page, 'Final cooked weight 600g'); await expect(page.getByTestId('batch-weight')).toHaveValue('600');
  await apply(page, 'Save recipe'); await expect(page.getByRole('textbox', { name: 'Recipe name', exact: true })).toHaveValue('Chicken supper');
  await expect(page.getByRole('textbox', { name: 'Number of servings', exact: true })).toHaveValue('6');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await expect(page).toHaveURL(/\/recipes$/);
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.getByTestId('today-add').click(); await page.getByTestId('save-batch').click(); await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await page.goto('/'); const portion = page.getByRole('button', { name: 'Log one saved serving of Chicken supper', exact: true }); await expect(portion).toBeInViewport({ ratio: 1 }); await portion.click();
  await expect(page.getByTestId('log-row')).toHaveCount(1); const backup = await exportJSON(page);
  expect(backup.logs).toHaveLength(1); const all = total([recipePortion({ ...chicken, ingredients: [{ id: 'a', food: food(ids[0]), quantity: '250', unit: 'g' }, { id: 'b', food: food(ids[3]), quantity: '10', unit: 'g' }], servings: '1' })]);
  expect(backup.logs[0].nutrition.kcal).toBe(new D(all.kcal!).div(6).toFixed()); expect(backup.recipes).toHaveLength(1); expect(backup.preparedBatches).toHaveLength(1);
});
