import { test, expect } from '@playwright/test';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { pestoSelections, pestoSubtotal } from '../tests/pesto-fixture';
const screenshots = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/design-revision');
test('real food → 10g → log → repeat → undo → relaunch → offline cold reload', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('today-add')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Discover', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'today-empty-390.png'), fullPage: true });
  await page.getByTestId('today-add').click();
  const searchStart = performance.now();
  await page.getByTestId('entry-search').fill('olivenolje');
  await expect(page.getByTestId('food-mvt:08.019')).toBeVisible();
  writeFileSync(path.join(screenshots, 'browser-search-timing.json'), JSON.stringify({ description: 'Desktop Chromium fill-to-visible result, includes Playwright overhead; not an iPhone benchmark', milliseconds: performance.now() - searchStart }, null, 2));
  await page.screenshot({ path: path.join(screenshots, 'quick-entry-search-390.png'), fullPage: true });
  await page.getByTestId('food-mvt:08.019').click();
  await page.getByTestId('quantity-0').fill('10');
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('89');
  await expect(page.getByText('9.9')).toBeVisible();
  await page.getByRole('button', { name: 'Log Olivenolje again', exact: true }).first().click();
  await expect(page.getByTestId('log-row')).toHaveCount(2);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('178');
  await page.getByRole('button', { name: 'Undo last log' }).click();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await page.screenshot({ path: path.join(screenshots, 'today-logged-390.png'), fullPage: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.getByTestId('log-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Log Olivenolje again', exact: true }).first().click();
  await expect(page.getByTestId('log-row')).toHaveCount(2);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('178');
  expect(errors).toEqual([]);
});

test('retained structured draft survives corrections and reload', async ({ page }) => {
  await page.goto('/entry'); await expect(page.getByTestId('quick-text')).toBeVisible();
  await page.getByTestId('quick-text').fill('200g kylling, 100g pasta, 15,5g pesto, 10g olivenolje');
  await expect(page.getByTestId('quantity-2')).toHaveValue('15,5');
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await page.getByTestId('quantity-0').fill('250');
  await page.getByRole('button', { name: 'Change food 4', exact: true }).click();
  await page.getByTestId('food-mvt:08.019').click();
  await expect(page.getByTestId('quantity-3')).toHaveValue('10');
  // A visible leave/reopen round trip must retain the structured amounts.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('today-add').click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await page.reload();
  await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await expect(page.getByTestId('quantity-1')).toHaveValue('100');
  await expect(page.getByTestId('quantity-2')).toHaveValue('15,5');
});

test('recipe creation, edit, portion logging, backup export and restoration', async ({ page }) => {
  await page.goto('/recipe');
  await page.getByRole('textbox', { name: 'Recipe name' }).fill('Olivenolje til matlaging');
  await page.getByRole('textbox', { name: 'Number of servings' }).fill('6');
  await page.getByRole('textbox', { name: 'Add an ingredient' }).fill('olivenolje');
  await page.getByTestId('food-mvt:08.019').click();
  await page.getByRole('textbox', { name: 'Ingredient 1 amount', exact: true }).fill('60');
  await page.getByRole('textbox', { name: 'Preparation · one step per line' }).fill('Mål opp oljen.\nFordel i seks porsjoner.');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByText('Olivenolje til matlaging', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshots, 'recipes-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Log one serving', exact: true }).click();
  await expect(page.getByText('One serving logged', { exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('89');
  await page.goto('/recipes'); await page.getByRole('button', { name: /^Open recipe / }).click();
  await page.getByRole('textbox', { name: 'Ingredient 1 amount', exact: true }).fill('120');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  // Wait for the acknowledged save and its redirect before a hard navigation.
  await expect(page).toHaveURL(/\/recipes$/);
  await page.goto('/'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('89');
  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadPromise; const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a backup file' }).click();
  await (await chooser).setFiles(backupPath!);
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click();
  await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(1);
});

test('pesto meal prep: resolve measured ingredients, retain unknown stock, edit and log subtotal', async ({ page }) => {
  await page.goto('/entry');
  await page.getByTestId('quick-text').fill('1200g kylling, 400g pasta, 140g pesto, 200g crème fraîche, 100g soltørkede tomater, 125g mozzarella, 40g parmesan, kraft og krydder');
  for (const [index, [id, , query]] of pestoSelections.entries()) {
    await page.getByRole('button', { name: `Change food ${index + 1}`, exact: true }).click();
    await page.getByTestId('entry-search').fill(query);
    await page.getByTestId(`food-${id}`).click();
  }
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await expect(page.getByTestId('quantity-7')).toHaveValue('');
  // Explicitly test a labelled subtotal; never silently resolve or zero the missing ingredient.
  await page.getByRole('button', { name: 'Remove kraft og krydder', exact: true }).click();
  await page.getByRole('button', { name: 'Make a recipe', exact: true }).click();
  await page.getByRole('textbox', { name: 'Recipe name' }).fill(pestoSubtotal().name);
  await page.getByRole('textbox', { name: 'Number of servings' }).fill('6');
  await page.getByRole('textbox', { name: 'Preparation · one step per line' }).fill(pestoSubtotal().steps[0]);
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('785');
  await page.getByRole('textbox', { name: 'Ingredient 3 amount', exact: true }).fill('150');
  await expect(page.getByRole('textbox', { name: 'Ingredient 1 amount', exact: true })).toHaveValue('1200');
  await expect(page.getByRole('textbox', { name: 'Ingredient 7 amount', exact: true })).toHaveValue('40');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('794');
  await page.getByRole('textbox', { name: 'Recipe name' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, 'pesto-recipe-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Log one serving', exact: true }).click();
  await page.goto('/'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('794');
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(1);
});

test('manual per-100ml food, unknown nutrient and cached barcode round trip', async ({ page }) => {
  await page.goto('/entry');
  await page.getByRole('button', { name: 'Create a food', exact: true }).click();
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Testetikett · kun testdata');
  await page.getByRole('textbox', { name: 'Barcode (optional)', exact: true }).fill('1234567890123');
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click();
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('40');
  await page.getByRole('textbox', { name: 'Protein · g', exact: true }).fill('0');
  await page.getByRole('textbox', { name: 'Carbs · g', exact: true }).fill('10');
  await page.getByRole('textbox', { name: 'Amount to add · ml', exact: true }).fill('250');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('100');
  await expect(page.getByText('– means a nutrient value is unknown.', { exact: true })).toBeVisible();
  await page.getByTestId('today-add').click();
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('1234567890123');
  await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('100');
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('140');
  await expect(page.getByTestId('log-row')).toHaveCount(2);
});
