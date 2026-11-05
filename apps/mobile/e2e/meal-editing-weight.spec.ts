import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { dayKey, display, emptyDraft, Food, foodNutrition, LogEntry, recipePortion, total } from '../src/domain/model';
import { addDays, localDate, startOfWeek } from '../src/domain/history';
import { daySignature } from '../src/domain/dailyWorkflows';
const output = path.resolve('../../verification/meal-editing-weight'), today = localDate('2026-11-05');
const food = (id: string) => (catalog as Food[]).find(item => item.id === id)!;
const chicken = food('mvt:03.205'), oil = food('mvt:08.019'), pasta = food('mvt:05.016');
function entry(food: Food, quantity: string, id: string, date = today): LogEntry { return { id, batchId: 'meal', recordedAt: date.toISOString(), meal: 'Lunsj', snapshot: { kind: 'food', ingredient: { id, food, quantity, unit: 'g' } }, nutrition: foodNutrition(food, quantity, 'g') }; }
function fixture() {
  const logs = [entry(chicken, '200', 'chicken'), entry(oil, '10', 'oil')];
  return { format: 'touche-grasse', version: 2, foods: [chicken, oil], recipes: [], logs, draft: emptyDraft(() => 'ordinary'), shortcuts: [{ id: 'shortcut', name: 'Lunch', entries: logs, pinned: true, createdAt: today.toISOString(), updatedAt: today.toISOString(), deletedAt: null }] };
}
async function restore(page: Page, value: unknown) {
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-meal-weight-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible();
}
async function backup(page: Page) {
  if (!page.url().endsWith('/settings')) {
    if (page.url().includes('/entry') || page.url().includes('/log?')) await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Your data and settings', exact: true }).click();
  }
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('shortcut product replacement, independent amounts, add/remove and saved review preserve ordinary drafts and diary snapshots', async ({ page }) => {
  test.setTimeout(120000); const original = fixture(); original.draft.lines = [{ id: 'unfinished', query: 'olive oil', food: oil, quantityText: '5', unit: 'g' }]; await restore(page, original);
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Edit foods in Lunch', exact: true }).click();
  await page.getByRole('button', { name: 'Change food 1', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a food', exact: true }).fill('pasta');
  await page.getByRole('button', { name: `Choose replacement ${pasta.name}`, exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Edit amount 1', exact: true })).toHaveValue('200'); await expect(page.getByRole('textbox', { name: 'Edit amount 2', exact: true })).toHaveValue('10');
  await page.getByRole('textbox', { name: 'Edit amount 1', exact: true }).fill('150');
  await page.getByRole('button', { name: 'Add food to edited meal', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a food', exact: true }).fill('olive oil'); await page.getByRole('button', { name: `Choose replacement ${oil.name}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit amount 3', exact: true }).fill('5'); await page.getByRole('button', { name: 'Remove food 2', exact: true }).click();
  await expect(page.getByTestId('edit-totals')).toContainText(display(total([foodNutrition(pasta, '150', 'g'), foodNutrition(oil, '5', 'g')]).kcal, 0));
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-shortcut-food-editor.png`) });
  await page.getByRole('button', { name: 'Save shortcut changes', exact: true }).click(); await expect(page.getByTestId('library-shortcuts')).toBeVisible();
  const saved = await backup(page); expect(saved.logs).toEqual(original.logs); expect(saved.draft).toEqual(original.draft); expect(saved.shortcuts[0].entries).toHaveLength(2); expect(saved.shortcuts[0].entries[0].snapshot.ingredient.food.id).toBe(pasta.id);
  await page.goto('/'); await page.getByRole('button', { name: 'Log shortcut Lunch', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText(display(total([...original.logs.map(entry => entry.nutrition), ...saved.shortcuts[0].entries.map((entry: LogEntry) => entry.nutrition)]).kcal, 0));
});

test('correct a logged saved serving, audit its original ingredients, undo and log the next unchanged batch portion', async ({ page }) => {
  test.setTimeout(120000); const recipe = { id: 'recipe', name: 'Six portions', servings: '6', cookedWeightGrams: '600', ingredients: [{ id: 'chicken', food: chicken, quantity: '200', unit: 'g' as const }, { id: 'oil', food: oil, quantity: '60', unit: 'g' as const }], steps: [], favorite: false };
  const portion: LogEntry = { id: 'portion', batchId: 'portion', preparedBatchId: 'batch', recordedAt: today.toISOString(), meal: 'Lunsj', snapshot: { kind: 'recipe', recipe, quantity: '1', unit: 'servings' }, nutrition: recipePortion(recipe) };
  await restore(page, { ...fixture(), shortcuts: [], logs: [portion], preparedBatches: [{ id: 'batch', recipe, meal: 'Lunsj', createdAt: today.toISOString() }] });
  await page.goto('/'); await page.getByRole('button', { name: 'View Six portions entry', exact: true }).click(); await page.getByRole('button', { name: 'Edit ingredients', exact: true }).click();
  await expect(page.getByText(/Whole recipe · 6 servings/)).toBeVisible();
  await page.getByRole('button', { name: 'Change ingredient 1.1', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a food', exact: true }).fill('pasta'); await page.getByRole('button', { name: `Choose replacement ${pasta.name}`, exact: true }).click();
  await page.getByRole('textbox', { name: 'Ingredient amount 1.1', exact: true }).fill('300'); await expect(page.getByRole('textbox', { name: 'Ingredient amount 1.2', exact: true })).toHaveValue('60');
  await page.getByRole('button', { name: 'Save meal correction', exact: true }).click(); await expect(page.getByTestId('log-screen')).toBeVisible();
  const corrected = await backup(page); expect(corrected.logs[0].batchRecipe).toEqual(recipe); expect(corrected.preparedBatches[0].recipe).toEqual(recipe); expect(corrected.mealCorrections[0].previous[0]).toEqual(portion);
  await page.goto('/'); await expect(page.getByTestId('today-portions')).toContainText('5 servings left'); await page.getByRole('button', { name: 'Undo meal correction', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText(display(portion.nutrition.kcal, 0));
  await page.getByRole('button', { name: 'Log one saved serving of Six portions', exact: true }).click(); await expect(page.getByTestId('today-portions')).toContainText('4 servings left');
  const after = await backup(page); expect(after.logs.every((entry: LogEntry) => JSON.stringify(entry.nutrition) === JSON.stringify(portion.nutrition))).toBe(true);
});

test('weight means, correction, reversible deletion and unfinished input persist without changing food intake', async ({ page }) => {
  test.setTimeout(120000); const original = fixture(), weighIns = [[-10, '80'], [-8, '82'], [-5, '81'], [0, '79']].map(([offset, kg]) => ({ id: dayKey(addDays(today, Number(offset))), kg, recordedAt: today.toISOString(), deletedAt: null, previous: [] }));
  await restore(page, { ...original, weighIns }); await page.goto('/history?view=weight&scope=week&date=2026-11-05');
  await expect(page.getByTestId('weight-mean')).toHaveText('80 kg'); await expect(page.getByTestId('weight-change')).toContainText('-1 kg');
  await page.getByRole('button', { name: 'Log weight', exact: true }).click(); await page.getByRole('textbox', { name: 'Weight · kg', exact: true }).fill('78.5'); await page.getByRole('button', { name: 'Save weigh-in', exact: true }).click();
  await expect(page.getByTestId('weight-mean')).toHaveText('79.75 kg'); await expect(page.getByTestId('support-link').locator('svg')).toBeVisible(); await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-weight-trends.png`) });
  await page.getByRole('button', { name: 'Delete weigh-in 2026-11-05', exact: true }).click(); await expect(page.getByTestId('weight-mean')).toHaveText('– kg'); await page.getByRole('button', { name: 'Toggle deleted weigh-ins', exact: true }).click(); await page.getByRole('button', { name: 'Restore weigh-in 2026-11-05', exact: true }).click(); await expect(page.getByTestId('weight-mean')).toHaveText('79.75 kg');
  await page.getByRole('button', { name: 'Log weight', exact: true }).click(); await page.getByRole('textbox', { name: 'Weight · kg', exact: true }).fill('78,'); const saved = await backup(page); expect(saved.quickEntry.weightDraft.amount).toBe('78,'); expect(saved.logs).toEqual(original.logs);
  await page.goto('/history?view=weight&scope=week&date=2026-11-05'); await page.reload(); await expect(page.getByRole('textbox', { name: 'Weight · kg', exact: true })).toHaveValue('78,');
  await page.getByRole('button', { name: 'Cancel weigh-in', exact: true }).click(); await expect(page.getByTestId('weight-editor')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous week', exact: true }).click(); await page.getByRole('button', { name: 'Lifetime', exact: true }).click();
  await expect(page.getByTestId('weight-latest')).toHaveText('78.5 kg');
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Log weight', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Weight · kg', exact: true })).toHaveValue('78.5'); await expect(page.getByRole('textbox', { name: 'Weight · kg', exact: true })).toBeFocused();
});

test('weekly feedback uses complete days only and a feature-rich backup restores edits, weigh-ins and correction history', async ({ page, browser }) => {
  test.setTimeout(150000); const logs: LogEntry[] = [], reviews = [], start = startOfWeek(today);
  for (const week of [0, -7]) for (let i = 0; i < 3; i++) { const date = addDays(start, week + i), log = entry(oil, week ? '20' : '10', `week-${week}-${i}`, date); logs.push(log); reviews.push({ id: dayKey(date), complete: true, signature: daySignature([log], dayKey(date)), updatedAt: today.toISOString() }); }
  logs.push(entry(oil, '100', 'partial', today)); await restore(page, { ...fixture(), logs, dayReviews: reviews });
  await page.goto('/history?scope=week&date=2026-11-05'); await expect(page.getByTestId('weekly-summary')).toContainText('3 complete days this week · 3 last week'); await expect(page.getByTestId('weekly-summary')).toContainText('Energy: 89 kcal / complete day (-89 vs last week)');
  await page.goto('/log?id=partial'); await page.getByRole('button', { name: 'Edit ingredients', exact: true }).click(); await page.getByRole('textbox', { name: 'Edit amount 1', exact: true }).fill('150'); await page.getByRole('button', { name: 'Save meal correction', exact: true }).click(); await expect(page.getByTestId('log-screen')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Logged amount', exact: true })).toHaveValue('150');
  await page.goto('/history?view=weight&scope=week&date=2026-11-05'); await page.getByRole('button', { name: 'Log weight', exact: true }).click(); await page.getByRole('textbox', { name: 'Weight · kg', exact: true }).fill('80'); await page.getByRole('button', { name: 'Save weigh-in', exact: true }).click(); await expect(page.getByTestId('weight-latest')).toHaveText('80 kg');
  await page.getByRole('button', { name: 'Log weight', exact: true }).click(); await page.getByRole('textbox', { name: 'Weight · kg', exact: true }).fill('80,');
  await page.getByRole('tab', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: 'Edit foods in Lunch', exact: true }).click(); await page.getByRole('textbox', { name: 'Edit amount 1', exact: true }).fill('15,');
  const saved = await backup(page); expect(saved.weighIns).toHaveLength(1); expect(saved.mealCorrections).toHaveLength(1); expect(saved.quickEntry.weightDraft.amount).toBe('80,');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), fresh = await context.newPage(); await fresh.clock.setFixedTime(new Date('2026-11-05T12:00:00Z')); await restore(fresh, saved); await fresh.goto('/entry');
  await expect(fresh.getByRole('textbox', { name: 'Edit amount 1', exact: true })).toHaveValue('15,'); await expect(fresh.getByRole('button', { name: 'Save shortcut changes', exact: true })).toBeDisabled();
  await fresh.getByRole('button', { name: 'Discard edit', exact: true }).click(); await fresh.goto('/history?view=weight&date=2026-11-05&scope=week'); await expect(fresh.getByRole('textbox', { name: 'Weight · kg', exact: true })).toHaveValue('80,');
  const recovered = await backup(fresh), byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect(recovered.logs.sort(byId)).toEqual(saved.logs.sort(byId)); expect(recovered.mealCorrections).toEqual(saved.mealCorrections); expect(recovered.weighIns).toEqual(saved.weighIns);
  await context.close();
});
