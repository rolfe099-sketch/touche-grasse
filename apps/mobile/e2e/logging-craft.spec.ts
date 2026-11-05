import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dayKey, LogEntry } from '../src/domain/model';
import { addDays } from '../src/domain/history';

const output = path.resolve('../../verification/logging-craft');
const key = (offset: number) => dayKey(addDays(new Date(), offset));
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function archive(page: Page) {
  if (page.url().includes('/entry')) await page.getByRole('button', { name: 'Back', exact: true }).click();
  if (page.url().includes('/log?')) await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Your data and settings', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
async function openMealEditor(page: Page) {
  const summary = page.getByTestId('meal-summary');
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
  await page.getByRole('button', { name: 'Edit Dinner meal', exact: true }).click();
}
async function createMeal(page: Page) {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (const [index, id] of [[0, 'mvt:03.205'], [1, 'mvt:05.016'], [2, 'mvt:06.144']] as const) await page.getByTestId(`choice-${index}-${id}`).click();
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('1,116');
}

test('a five-ingredient meal moves in one save with exact snapshots, retained draft, completion markers and persistent Undo', async ({ page }) => {
  await createMeal(page); await page.getByRole('button', { name: 'Mark complete', exact: true }).click();
  const before = await archive(page); expect(before.logs).toHaveLength(5);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await openMealEditor(page);
  const editor = page.getByTestId('meal-editor'); await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await editor.getByRole('button', { name: 'Change meal type, Dinner', exact: true }).click(); await editor.getByRole('button', { name: 'Lunch', exact: true }).click();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-whole-meal-move.png`) });
  await page.getByRole('button', { name: 'Save meal correction', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/history' && url.searchParams.get('date') === key(-1));
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('1,116');
  const moved = await archive(page); expect(moved.logs).toHaveLength(5); expect(moved.mealCorrections).toHaveLength(1);
  for (const original of before.logs as LogEntry[]) {
    const after = moved.logs.find((entry: LogEntry) => entry.id === original.id)!;
    expect(dayKey(new Date(after.recordedAt))).toBe(key(-1)); expect(after.meal).toBe('Lunsj'); expect(after.timePrecision).toBe('day');
    expect(after.snapshot).toEqual(original.snapshot); expect(after.nutrition).toEqual(original.nutrition); expect(after.batchId).toBe(original.batchId);
  }
  expect(moved.draft).toEqual(before.draft); expect(moved.mealCorrections[0].previous).toEqual(before.logs);
  await page.reload(); await page.goto('/'); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('–');
  await page.getByRole('button', { name: 'Undo meal correction', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('1,116'); await expect(page.getByTestId('day-completion')).toContainText('Day complete');
  const restored = await archive(page); expect(restored.logs).toEqual(expect.arrayContaining(before.logs)); expect(restored.logs).toHaveLength(5);
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-move-interactions.json`), JSON.stringify({ dimensions: '390x844', fromGroupedTodayDiary: { actions: ['Expand meal', 'Edit meal', 'Yesterday', 'Open meal choices', 'Lunch', 'Save correction'], interactions: 6, ingredientsMoved: 5 }, before: 'Date and meal changes required correcting each ingredient separately; no atomic group move', after: 'One save moves every selected ingredient; Undo restores exact original records', unchangedNutrition: true, automatedTiming: 'Not a human speed benchmark' }, null, 2));
});

test('discarding or resetting a whole-meal destination leaves its original day, time and Undo intact', async ({ page }) => {
  await createMeal(page); const original = await archive(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/); await openMealEditor(page);
  await page.getByTestId('meal-editor').getByRole('button', { name: 'Yesterday', exact: true }).click();
  await page.getByRole('button', { name: 'Keep original day and meal', exact: true }).click(); await page.getByRole('button', { name: 'Save meal correction', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Undo last log', exact: true })).toBeVisible();
  const unchanged = await archive(page); expect(unchanged.logs).toEqual(original.logs); expect(unchanged.mealCorrections).toEqual([]);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/); await openMealEditor(page);
  await page.getByTestId('meal-editor').getByRole('button', { name: 'Yesterday', exact: true }).click(); await page.getByRole('button', { name: 'Discard edit', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  const discarded = await archive(page); expect(discarded.logs).toEqual(original.logs); expect(discarded.mealCorrections).toEqual([]); expect(discarded.quickEntry.mealEdit).toBeUndefined();
});

test('destination controls keep 44-point targets, clear keyboard focus and fit narrow layouts', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil');
  const destination = page.getByTestId('logging-destination');
  for (const name of ['Today', 'Yesterday', 'Choose logging date', 'Change meal type, Dinner']) {
    const button = destination.getByRole('button', { name, exact: true }); const bounds = await button.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await destination.getByRole('button', { name: 'Choose logging date', exact: true }).click(); await expect(page.getByTestId('quick-text')).not.toBeFocused();
  await expect(page.getByTestId('logging-calendar')).toBeVisible();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-calendar.png`) });
  await page.setViewportSize({ width: 320, height: 700 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); expect(overflow).toBe(false);
  await page.getByRole('textbox', { name: 'Logging date (YYYY-MM-DD)', exact: true }).fill(key(1)); await page.getByRole('button', { name: 'Use date', exact: true }).click(); await expect(page.getByText('Choose today or an earlier date to log food.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Logging date (YYYY-MM-DD)', exact: true }).fill(key(-2)); await page.getByRole('button', { name: 'Use date', exact: true }).click(); await expect(page.getByTestId('commit-destination')).toContainText(key(-2));
});
