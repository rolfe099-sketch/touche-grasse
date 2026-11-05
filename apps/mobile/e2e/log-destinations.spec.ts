import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dayKey } from '../src/domain/model';
import { addDays } from '../src/domain/history';

const output = path.resolve('../../verification/log-destinations');
const key = (offset: number) => dayKey(addDays(new Date(), offset));
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function archive(page: Page) {
  if (page.url().includes('/entry')) await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('tab', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
async function destination(page: Page, value: string) { await expect(page.getByTestId('commit-destination')).toContainText(value); }

test('today stays fast; yesterday is one extra tap; the confirmed meal is remembered and the entire backdated meal undoes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByTestId('today-add').click();
  await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Change meal type, Dinner', exact: true }).click();
  await page.getByTestId('logging-destination').getByRole('button', { name: 'Breakfast', exact: true }).click();
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('89');
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('20g olive oil, 10g olive oil');
  await destination(page, 'Today · Breakfast');
  await page.getByTestId('logging-destination').getByRole('button', { name: 'Yesterday', exact: true }).click();
  await destination(page, 'Yesterday · Breakfast');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-yesterday-review.png`) });
  const button = await page.getByTestId('commit-food').boundingBox(); expect(button!.y + button!.height).toBeLessThanOrEqual(844);
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(new RegExp(`/history\\?.*date=${key(-1)}`));
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('268');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('–');
  const saved = await archive(page); expect(saved.logs).toHaveLength(1); expect(saved.logs[0].meal).toBe('Frokost'); expect(dayKey(new Date(saved.logs[0].recordedAt))).toBe(key(0));
  expect(saved.quickEntry.lastMeal).toBe('Frokost'); expect(saved.draft.loggingDate).toBeUndefined(); expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/); await page.getByTestId('today-add').click();
  await page.getByTestId('logging-destination').getByRole('button', { name: 'Yesterday', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('universal-log').click(); await expect(page.getByTestId('destination-conflict')).toHaveCount(0);
  await expect(page.getByTestId('logging-destination').getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-interactions.json`), JSON.stringify({ dimensions: '390x844', counting: 'One tap or completed text entry is one interaction; autofocus, starting from Today. Navigation to a historical day is excluded from its Log flow.', ordinaryMeal: { before: 3, after: 3, actions: ['Log', 'Enter meal', 'Log food'] }, yesterday: { before: 'Not available in Quick Log', after: 4, actions: ['Log', 'Enter meal', 'Yesterday', 'Log food'], additionalScrolls: 0 }, firstExplicitMeal: { after: 5, actions: ['Log', 'Enter meal', 'Open meal choices', 'Breakfast', 'Log food'] }, returningMeal: { after: 3, savedInteractions: 2 }, selectedHistoryDay: { after: 3, extraDateInteractions: 0 }, timing: 'Automated workflow counts, not human completion-time measurements' }, null, 2));
});

test('History carries its selected day while an existing draft requires an explicit date decision and survives reopening', async ({ page }) => {
  await page.goto(`/history?date=${key(-1)}&scope=day`); await page.getByTestId('universal-log').click();
  await page.getByTestId('quick-text').fill('10g olive oil'); await destination(page, 'Yesterday');
  const saved = await archive(page); expect(saved.draft.loggingDate).toBe(key(-1));
  await page.reload(); await page.goto(`/history?date=${key(-2)}&scope=day`); await expect(page).toHaveURL(new RegExp(`date=${key(-2)}`));
  await page.getByTestId('universal-log').click();
  const conflict = page.getByTestId('destination-conflict'); await expect(conflict).toBeVisible(); await expect(page.getByTestId('commit-food')).toBeDisabled();
  await expect(page.getByTestId('quantity-0')).toHaveValue('10');
  await conflict.getByRole('button', { name: 'Keep draft date', exact: true }).click(); await destination(page, 'Yesterday');
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/history/);
  await page.getByTestId('universal-log').click(); await conflict.getByRole('button', { name: `Use ${key(-2)}`, exact: true }).click();
  await destination(page, key(-2)); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(new RegExp(`date=${key(-2)}`));
  const logged = await archive(page); expect(logged.logs).toHaveLength(1); expect(dayKey(new Date(logged.logs[0].recordedAt))).toBe(key(-2)); expect(logged.logs[0].nutrition.kcal).toBe('89.2');
});

test('inline calendar rejects future dates and stores a custom day and adjusted repeat without changing source nutrition', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('universal-log').click(); await page.getByRole('button', { name: 'Adjust recent meal 1', exact: true }).click();
  await expect(page.getByTestId('repeat-review')).toBeVisible();
  await page.getByRole('button', { name: 'Choose logging date', exact: true }).click();
  await page.getByRole('textbox', { name: 'Logging date (YYYY-MM-DD)', exact: true }).fill('');
  await page.getByRole('button', { name: 'Use date', exact: true }).click(); await expect(page.getByText('Use a date in YYYY-MM-DD format.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Logging date (YYYY-MM-DD)', exact: true }).fill(key(1));
  await page.getByRole('button', { name: 'Use date', exact: true }).click(); await expect(page.getByText('Choose today or an earlier date to log food.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Logging date (YYYY-MM-DD)', exact: true }).fill(key(-3)); await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await page.getByTestId('repeat-amount-0').fill('20');
  await expect(page.getByTestId('repeat-totals')).toContainText('178 kcal');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-dated-repeat.png`) });
  await page.getByRole('button', { name: `Log adjusted meal ${key(-3)}`, exact: true }).click(); await expect(page).toHaveURL(new RegExp(`date=${key(-3)}`));
  const saved = await archive(page); expect(saved.logs).toHaveLength(2);
  const original = saved.logs.find((entry: { recordedAt: string }) => dayKey(new Date(entry.recordedAt)) === key(0));
  const repeated = saved.logs.find((entry: { recordedAt: string }) => dayKey(new Date(entry.recordedAt)) === key(-3));
  expect(original.nutrition.kcal).toBe('89.2'); expect(original.snapshot.ingredient.quantity).toBe('10'); expect(repeated.nutrition.kcal).toBe('178.4'); expect(repeated.snapshot.ingredient.quantity).toBe('20');
});

test('typed natural-language destinations and speech use the same review; invalid terminal commands cannot partially move a meal', async ({ page }) => {
  await page.addInitScript(() => { class Speech { onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void; start() { this.onstart?.(); Object.assign(window, { deliverSpeech: (text: string) => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); this.onend?.(); } }); } stop() { this.onend?.(); } abort() { this.onend?.(); } } Object.assign(window, { SpeechRecognition: Speech }); });
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('200g chicken to yesterday’s dinner');
  await expect(page.getByTestId('quantity-0')).toHaveValue('200'); await destination(page, 'Yesterday · Dinner'); await expect(page.getByTestId('entry-search')).toHaveValue('chicken');
  await page.getByTestId('choice-0-mvt:03.205').click(); await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await page.waitForFunction(() => typeof (window as unknown as { deliverSpeech?: unknown }).deliverSpeech === 'function');
  await page.evaluate(() => (window as unknown as { deliverSpeech: (text: string) => void }).deliverSpeech('Set meal to breakfast then log this for tomorrow'));
  await expect(page.getByText('Use today, yesterday or a date in YYYY-MM-DD format. Future food cannot be logged.', { exact: true })).toBeVisible();
  await destination(page, 'Yesterday · Dinner'); await expect(page.getByTestId('quantity-0')).toHaveValue('200');
  await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await page.evaluate(() => (window as unknown as { deliverSpeech: (text: string) => void }).deliverSpeech('Set meal to breakfast then log this'));
  await expect(page).toHaveURL(new RegExp(`date=${key(-1)}`));
  const saved = await archive(page); expect(saved.logs).toHaveLength(1); expect(saved.logs[0].meal).toBe('Frokost'); expect(dayKey(new Date(saved.logs[0].recordedAt))).toBe(key(-1)); expect(saved.logs[0].snapshot.ingredient.quantity).toBe('200');
});
