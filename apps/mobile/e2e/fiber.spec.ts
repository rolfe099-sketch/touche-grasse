import { test, expect, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/fiber');
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function archive(page: Page) {
  await page.goto('/settings'); const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
}
test('verified fiber follows Quick Log into six servings, Today, history, reload and backup', async ({ page }) => {
  await page.goto('/entry');
  await page.getByTestId('quick-text').fill('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (const [i, id] of ['03.205', '05.016', '06.144'].entries()) await page.getByTestId(`choice-${i}-mvt:${id}`).click();
  await expect(page.getByTestId('meal-nutrition')).toContainText('Fiber 6.1 g');
  await expect(page.getByTestId('commit-food')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'quick-log-fiber-390.png') });
  await page.getByRole('button', { name: 'Split into servings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Batch name', exact: true }).fill('Chicken pesto pasta');
  await page.getByTestId('batch-servings').fill('6'); await page.getByTestId('batch-weight').fill('600');
  await expect(page.getByTestId('batch-preview')).toContainText('Fiber 1.02 g');
  await page.getByTestId('save-batch').click();
  await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Log one saved serving of Chicken pesto pasta', exact: true }).click();
  await expect(page.getByTestId('today-fiber')).toHaveText('1 g');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('186');
  await page.reload(); await expect(page.getByTestId('today-fiber')).toHaveText('1 g');
  await page.screenshot({ path: path.join(output, 'today-fiber-390.png') });
  await page.getByRole('tab', { name: 'History', exact: true }).click();
  await page.getByRole('button', { name: 'Chart fiber', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Chart fiber', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: path.join(output, 'history-fiber-390.png') });
  for (const scope of ['Month', 'Lifetime', 'Day']) { await page.getByRole('button', { name: scope, exact: true }).click(); await expect(page.getByTestId('history-screen').getByText('Fiber', { exact: true }).first()).toBeVisible(); }
  const backup = await archive(page);
  expect(backup.logs).toHaveLength(1); expect(backup.logs[0].nutrition.fiber).toBe('1.0225');
  expect(backup.logs[0].nutrition.kcal).toBe('186.0416666666666666666666666666666666667');
  writeFileSync(path.join(output, 'fiber-portion-proof.json'), JSON.stringify({ batchFiber: '6.135', servings: 6, oneServing: backup.logs[0].nutrition, remaining: 5 }, null, 2));
});

test('manual fiber scales per 100ml and zero remains different from an unknown value', async ({ page }) => {
  await page.goto('/manual');
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Fiber drink - test fixture');
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click();
  for (const [label, value] of [['Energy · kcal', '40'], ['Protein · g', '0'], ['Carbs · g', '10'], ['Fat · g', '0'], ['Fiber · g', '1.25']]) await page.getByRole('textbox', { name: label, exact: true }).fill(value);
  // A reference-unit change clears the amount rather than treating grams as ml.
  await expect(page.getByRole('textbox', { name: 'Amount to add · ml', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Amount to add · ml', exact: true }).fill('250');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('250'); await expect(page.getByTestId('meal-nutrition')).toContainText('Fiber 3.1 g');
  await page.getByTestId('commit-food').click(); await expect(page.getByTestId('today-fiber')).toHaveText('3.1 g');
  expect((await archive(page)).logs[0].nutrition.fiber).toBe('3.125');
  await page.goto('/'); await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('10g olive oil');
  await expect(page.getByTestId('meal-nutrition')).toContainText('Fiber 0 g');
  await page.getByTestId('commit-food').click(); await expect(page.getByTestId('today-fiber')).toHaveText('0 g');
});

test('a legacy backup retains unknown fiber and exact historical snapshots after restore and repeat', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('150g pasta');
  await page.getByTestId('choice-0-mvt:05.016').click(); await page.getByTestId('commit-food').click();
  const legacy = await archive(page);
  for (const food of legacy.foods) { delete food.nutrition.fiber; delete food.provenance.nutrientSources.fiber; }
  for (const log of legacy.logs) { delete log.nutrition.fiber; delete log.snapshot.ingredient.food.nutrition.fiber; delete log.snapshot.ingredient.food.provenance.nutrientSources.fiber; }
  // A fresh browser context models an existing installation restoring a pre-fiber archive.
  const context = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 } });
  const restored = await context.newPage(); await restored.goto('http://127.0.0.1:4173/settings');
  const chooser = restored.waitForEvent('filechooser'); await restored.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'legacy-fiber.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await restored.getByRole('button', { name: 'Confirm restore', exact: true }).click();
  await expect(restored.getByText('Backup restored', { exact: true })).toBeVisible();
  await restored.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(restored.getByTestId('today-fiber')).toHaveText('– g');
  await restored.reload(); await expect(restored.getByTestId('today-fiber')).toHaveText('– g');
  // Use an absolute URL because this isolated context has no test-runner baseURL.
  await restored.goto('http://127.0.0.1:4173/settings'); const download = restored.waitForEvent('download'); await restored.getByRole('button', { name: 'Export backup', exact: true }).click();
  const after = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
  expect(after.logs).toEqual(legacy.logs);
  await restored.goto('http://127.0.0.1:4173/'); await restored.getByRole('button', { name: /^Log .+ again$/ }).first().click();
  await expect(restored.getByTestId('today-fiber')).toHaveText('– g');
  await restored.getByTestId('universal-log').click(); await restored.getByTestId('quick-text').fill('150g pasta');
  await expect(restored.getByTestId('ingredient-choices')).toHaveCount(0);
  await expect(restored.getByTestId('meal-nutrition')).toContainText('Fiber 6 g');
  await context.close();
});
