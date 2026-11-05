import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { dayKey } from '../src/domain/model';
const output = path.resolve('../../verification/daily-workflows');
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function archive(page: Page) {
  if (page.url().includes('/entry')) await page.getByRole('button', { name: 'Back', exact: true }).click();
  if (!page.url().endsWith('/settings')) { await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); }
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
async function create(page: Page) {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil, 20g olive oil');
  await expect(page.getByTestId('commit-food')).toBeEnabled(); await page.getByRole('button', { name: 'Save meal shortcut', exact: true }).click();
  await page.getByRole('textbox', { name: 'Shortcut name', exact: true }).fill('My breakfast');
  await page.getByRole('button', { name: 'Save to Today', exact: true }).click(); await expect(page.getByText('Shortcut saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.getByTestId('today-shortcuts')).toContainText('My breakfast');
}

test('named shortcut: save without eating, one-tap log above fold, adjust, undo, rename and reversible deletion', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await create(page); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('–');
  const button = page.getByRole('button', { name: 'Log shortcut My breakfast', exact: true });
  const bounds = await button.boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThan(760);
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-today-shortcuts.png`) });
  await button.click(); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('268');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('–');
  await page.getByRole('button', { name: 'Adjust shortcut My breakfast', exact: true }).click();
  await expect(page).toHaveURL(/\/entry/); await expect(page.getByTestId('repeat-review')).toBeVisible();
  await page.getByTestId('repeat-amount-0').click(); await page.getByTestId('repeat-amount-0').fill('15');
  await expect(page.getByTestId('repeat-amount-1')).toHaveValue('20'); await expect(page.getByTestId('repeat-totals')).toContainText('312 kcal');
  const amount = await page.getByTestId('repeat-amount-1').boundingBox(); expect(amount!.y + amount!.height).toBeLessThan(760);
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-shortcut-adjustment.png`) });
  await page.getByRole('button', { name: 'Log adjusted meal today', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('312');
  const saved = await archive(page); expect(saved.logs).toHaveLength(2); expect(saved.shortcuts[0].entries[0].nutrition.kcal).toBe('89.2'); expect(saved.draft.lines[0].quantityText).toBe('10');
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Rename shortcut My breakfast', exact: true }).click();
  await page.getByRole('textbox', { name: 'New shortcut name', exact: true }).fill('Morning oats'); await page.getByRole('button', { name: 'Save name', exact: true }).click(); await expect(page.getByText('Shortcut renamed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete shortcut Morning oats', exact: true }).click(); await expect(page.getByTestId('library-shortcuts').getByTestId('meal-shortcut')).toHaveCount(0);
  await page.getByTestId('library-shortcuts').getByRole('button', { name: 'Deleted', exact: true }).click(); await page.getByRole('button', { name: 'Restore shortcut Morning oats', exact: true }).click();
  await expect(page.getByText('Shortcut restored', { exact: true })).toBeVisible(); await page.reload();
  await expect(page.getByTestId('library-shortcuts')).toContainText('Morning oats'); expect(errors).toEqual([]);
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-interactions.json`), JSON.stringify({ dimensions: '390x844', unchanged: { actions: ['Log shortcut'], interactions: 1, scrolls: 0 }, adjusted: { actions: ['Adjust shortcut', 'Focus amount', 'Enter quantity', 'Log adjusted meal'], interactions: 4, scrolls: 0 }, savedAmountsChange: 'Optional explicit Update saved amounts; one-off changes do not overwrite the shortcut', timing: 'Browser automation; not a human cooking-time benchmark' }, null, 2));
});

test('complete days exclude partial intake from averages, reopen on new food, and survive restore', async ({ page }) => {
  test.setTimeout(120000); await create(page); await page.getByRole('button', { name: 'Log shortcut My breakfast', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('268');
  await page.getByRole('button', { name: 'Mark complete', exact: true }).click(); await expect(page.getByTestId('day-completion')).toContainText('Day complete');
  const saved = await archive(page); expect(saved.dayReviews).toHaveLength(1);
  await page.goto(`/history?date=${dayKey(new Date())}&scope=week`);
  await expect(page.getByText('Average per complete day', { exact: true })).toBeVisible(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('268');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-complete-day-history.png`) });
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await page.getByRole('button', { name: 'Log shortcut My breakfast', exact: true }).click();
  await expect(page.getByTestId('day-completion')).toContainText('Changed since review'); await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('day-completion')).toContainText('Day complete');
  await page.getByRole('button', { name: 'Reopen day', exact: true }).click(); await expect(page.getByTestId('day-completion')).toContainText('Not marked complete');
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-reviewed-day.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
  await expect(page.getByText(/2 diary entries · 0 recipes · 1 shortcuts · 1 reviewed days/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto(`/history?date=${dayKey(new Date())}&scope=week`); await expect(page.getByTestId('nutrition-kcal')).toHaveText('–');
  await page.getByRole('button', { name: 'All recorded days', exact: true }).click(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('268'); await expect(page.getByText(/Partial days are included; these averages may understate intake/)).toBeVisible();
});

test('voice shortcut command uses the actual entry adapter; library archive can be restored without changing history', async ({ page }) => {
  test.setTimeout(120000);
  await page.addInitScript(() => { class Speech { onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void; start() { this.onstart?.(); Object.assign(window, { deliverSpeech: (text: string) => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); this.onend?.(); } }); } stop() { this.onend?.(); } abort() { this.onend?.(); } } Object.assign(window, { SpeechRecognition: Speech }); });
  await create(page); await page.getByRole('button', { name: 'Log with voice', exact: true }).click();
  await page.waitForFunction(() => typeof (window as unknown as { deliverSpeech?: unknown }).deliverSpeech === 'function');
  await page.evaluate(() => (window as unknown as { deliverSpeech: (text: string) => void }).deliverSpeech('Log my breakfast'));
  await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('268');
  const saved = await archive(page); await page.goto('/recipes'); await page.getByRole('button', { name: 'Library foods', exact: true }).click();
  // Shortcut snapshots need not populate personal foods; add the original draft
  // through the real log action before testing reversible library archiving.
  await page.goto('/entry'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Library foods', exact: true }).click();
  const archiveButton = page.getByRole('button', { name: /^Archive food / }).first(); await archiveButton.click(); await expect(page.getByRole('button', { name: /^Archive food / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archived foods and recipes', exact: true }).click(); await page.getByRole('button', { name: /^Restore food / }).click(); await expect(page.getByRole('button', { name: /^Restore food / })).toHaveCount(0);
  const after = await archive(page); expect(after.logs.filter((item: { id: string }) => saved.logs.some((original: { id: string }) => original.id === item.id))).toEqual(saved.logs);
});
