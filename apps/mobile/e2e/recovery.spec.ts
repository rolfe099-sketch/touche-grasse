import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const output = path.resolve('../../verification/recovery');
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 393, height: 852 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function backup(page: Page) {
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
test('automatic copies survive primary database loss and merge exact diary records without duplicate recovery', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  const before = await backup(page); await expect(page.getByTestId('recovery-count')).toContainText('1 copy', { timeout: 15000 });
  await page.getByRole('button', { name: 'View recovery copies', exact: true }).click(); const copy = page.getByTestId('recovery-copy').first(); await expect(copy).toContainText('Automatic copy');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-copies.png`) });
  // Only this isolated Playwright context's test diary is removed. The recovery
  // database uses a different name; no user/browser/native database is touched.
  await page.evaluate(() => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('touche-grasse-v1'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }));
  await page.reload(); await expect(page.getByTestId('recovery-count')).toContainText('1 copy');
  await page.getByRole('button', { name: 'View recovery copies', exact: true }).click(); await page.getByRole('button', { name: /^Review recovery / }).first().click();
  await expect(page.getByTestId('recovery-confirm')).toContainText('1 diary entry'); await page.getByRole('button', { name: 'Recover missing records', exact: true }).click(); await expect(page.getByText('Recovery merged', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('89');
  const after = await backup(page); expect(after.logs).toEqual(before.logs);
  // The pre-restore copy is retained separately from the recovered state.
  await expect(page.getByTestId('recovery-count')).toHaveText(/[2-6] copies available/); await page.getByRole('button', { name: 'View recovery copies', exact: true }).click();
  await expect(page.getByTestId('recovery-copy').filter({ hasText: 'Before restore' })).toHaveCount(1);
  const original = page.getByTestId('recovery-copy').filter({ hasText: 'Automatic copy' }).first(); await original.getByRole('button', { name: /^Review recovery / }).click(); await page.getByRole('button', { name: 'Recover missing records', exact: true }).click(); await expect(page.getByText('Recovery merged', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(1);
});
test('recovery preserves newer records and a current draft and supports exporting an older copy', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await backup(page); await page.getByRole('button', { name: 'Create recovery copy now', exact: true }).click(); await expect(page.getByText('Recovery copy saved', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'View recovery copies', exact: true }).click(); const chosen = page.getByTestId('recovery-copy').first(); const label = await chosen.getByRole('button', { name: /^Review recovery / }).getAttribute('aria-label');
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('20g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('200g chicken'); await page.getByRole('button', { name: 'Back', exact: true }).click(); const before = await backup(page);
  await page.getByRole('button', { name: 'View recovery copies', exact: true }).click(); const row = page.getByTestId('recovery-copy').filter({ has: page.getByRole('button', { name: label!, exact: true }) });
  const downloading = page.waitForEvent('download'); await row.getByRole('button', { name: /^Export recovery / }).click(); const exported = JSON.parse(readFileSync((await (await downloading).path())!, 'utf8')); expect(exported.logs).toHaveLength(1);
  await page.getByRole('button', { name: label!, exact: true }).click(); await page.getByRole('button', { name: 'Recover missing records', exact: true }).click(); await expect(page.getByText('Recovery merged', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click(); const after = await backup(page); const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect(after.logs.sort(byId)).toEqual(before.logs.sort(byId)); expect(after.draft).toEqual(before.draft);
});
