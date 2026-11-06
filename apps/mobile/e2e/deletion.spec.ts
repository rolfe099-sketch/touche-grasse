import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('../../verification/deletion');
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 393, height: 852 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function log(page: Page, text: string) {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill(text);
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
}
async function backup(page: Page) {
  await page.goto('/settings'); const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}

test('one-tap row deletion preserves other entries and persistent undo restores the exact snapshot', async ({ page }) => {
  let dialogs = 0; page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await log(page, '10g olive oil'); await log(page, '20g olive oil');
  const before = await backup(page); await page.goto('/');
  const row = page.getByTestId('log-row').filter({ hasText: '10 g ·' });
  const remove = row.getByRole('button', { name: /^Delete / });
  await expect(remove).toBeInViewport({ ratio: 1 }); const bounds = (await remove.boundingBox())!; expect(bounds.width).toBe(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
  await remove.click(); await expect(page.getByText('Entry deleted', { exact: true })).toBeVisible();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('178'); await expect(page.getByTestId('log-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Undo deletion', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: path.join(output, 'today-deleted-393.png') });
  await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click(); await page.reload();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('178');
  await page.getByRole('button', { name: 'Undo deletion', exact: true }).click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('268'); await expect(page.getByTestId('log-row')).toHaveCount(2);
  const after = await backup(page);
  expect(after.logs.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))).toEqual(before.logs.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)));
  expect(after.foods).toEqual(before.foods); expect(after.quickEntry).toEqual(before.quickEntry); expect(dialogs).toBe(0);
  writeFileSync(path.join(output, 'row-delete-proof.json'), JSON.stringify({ deleteActions: 1, undoActions: 1, dialogs, snapshotRestored: true, persistedUndo: true, otherEntriesRetained: true }, null, 2));
});

test('one-tap grouped meal deletion and undo keep all its ingredients together', async ({ page }) => {
  await log(page, '10g olive oil, 20g olive oil');
  await expect(page.getByTestId('meal-summary')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Dinner meal, 2 entries', exact: true }).click();
  await expect(page.getByText('Meal deleted', { exact: true })).toBeVisible(); await expect(page.getByTestId('meal-summary')).toHaveCount(0);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('–'); await page.reload();
  await page.getByRole('button', { name: 'Undo deletion', exact: true }).click();
  await expect(page.getByTestId('meal-summary')).toContainText('2 foods'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('268');
  await page.getByTestId('meal-summary').click(); await expect(page.getByTestId('log-row').filter({ visible: true })).toHaveCount(2);
});

test('delete from historical entry details and restore its corrected nutrition without changing its date', async ({ page }) => {
  await log(page, '10g olive oil'); await page.getByRole('button', { name: /^View .* entry$/ }).click();
  await page.getByRole('textbox', { name: 'Logged amount', exact: true }).fill('20');
  await page.getByRole('textbox', { name: 'Date (YYYY-MM-DD)', exact: true }).fill('2026-10-05');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const before = await backup(page); await page.goto('/history?date=2026-10-05&scope=day');
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('178');
  await page.getByRole('button', { name: /^View .* entry$/ }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Delete entry', exact: true }).click();
  await expect(page.getByTestId('history-screen').getByTestId('log-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo deletion', exact: true }).click();
  await expect(page.getByTestId('history-screen').getByTestId('nutrition-kcal')).toHaveText('178');
  const after = await backup(page); expect(after.logs).toEqual(before.logs);
});

test('deleting a saved serving returns inventory and undo consumes exactly that serving again', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('60g olive oil');
  await page.getByRole('button', { name: 'Split into servings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Batch name', exact: true }).fill('Deletion batch');
  await page.getByTestId('batch-servings').fill('6'); await page.getByTestId('save-batch').click();
  await expect(page.getByText('Batch saved · nothing logged', { exact: true })).toBeVisible();
  await page.goto('/'); await page.getByRole('button', { name: 'Log one saved serving of Deletion batch', exact: true }).click();
  await expect(page.getByTestId('today-portions')).toContainText('5 servings left');
  await page.getByRole('button', { name: 'Delete Deletion batch entry', exact: true }).click();
  await expect(page.getByTestId('today-portions')).toContainText('6 servings left'); await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.reload(); await page.getByRole('button', { name: 'Undo deletion', exact: true }).click();
  await expect(page.getByTestId('today-portions')).toContainText('5 servings left'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('89');
});
