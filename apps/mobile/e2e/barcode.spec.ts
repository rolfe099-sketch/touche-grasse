import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { milkCode, milkProduct } from '../tests/barcode-fixture';
const endpoint = 'https://world.openfoodfacts.org/api/v3.6/product/**';
const output = path.resolve('../../verification/barcode');
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 393, height: 852 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function scan(page: Page, code = milkCode) {
  await page.goto('/entry'); await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill(code); await page.getByRole('button', { name: 'Find product', exact: true }).click();
}
async function backup(page: Page) {
  if (page.url().includes('/entry')) await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
test('new barcode is reviewed inline, corrected, persisted and reused offline without changing historical nutrition', async ({ page, context }) => {
  test.setTimeout(120000); // Full round trip includes label editing, downloads, reload and offline logging.
  let calls = 0;
  await page.route(endpoint, async route => { calls++; await route.fulfill({ json: milkProduct() }); });
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await scan(page); await expect(page.getByTestId('barcode-review')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Lettmelk 0,5% fett');
  await expect(page.getByRole('textbox', { name: 'Label fiber · g', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Label energy · kcal', exact: true }).fill('38');
  await page.getByRole('textbox', { name: 'Amount to add · ml', exact: true }).fill('250');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-review.png`) });
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await expect(page.getByTestId('meal-kcal')).toContainText('95');
  const saved = await backup(page); expect(saved.logs).toHaveLength(1); const oil = saved.logs[0];
  expect(saved.foods.find((food: { barcode?: string }) => food.barcode === milkCode).provenance.labelReview.originalNutrition.kcal).toBe('37');
  await page.goto('/entry'); await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('nutrition-kcal')).toHaveText('184');
  await page.getByRole('tab', { name: 'Library', exact: true }).click(); await page.getByRole('button', { name: 'Library foods', exact: true }).click();
  await page.getByRole('button', { name: 'Edit label for Lettmelk 0,5% fett', exact: true }).click();
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('39'); await page.getByRole('button', { name: 'Save label', exact: true }).click(); await expect(page).toHaveURL(/\/recipes$/);
  await page.getByRole('tab', { name: 'Today', exact: true }).click(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('184');
  await context.setOffline(true); await page.getByTestId('universal-log').click(); await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('07038010001918'); await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('100'); await expect(page.getByTestId('barcode-review')).toHaveCount(0);
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('nutrition-kcal')).toHaveText('223');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('184');
  await context.setOffline(false); const after = await backup(page);
  expect(after.logs.find((log: { id: string }) => log.id === oil.id)).toEqual(oil); expect(calls).toBe(1);
  expect(after.logs.find((log: { id: string }) => log.id !== oil.id).nutrition).toEqual({ kcal: '95', protein: '9', carbohydrate: '11.75', fat: '1.25', fiber: null });
});
test('unknown products, outage and invalid codes leave the existing draft intact and offer manual entry', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ status: 404, json: { status: 'failure', result: { id: 'product_not_found' } } }));
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click(); await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill(milkCode); await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('No product found'); await expect(page.getByRole('button', { name: 'Add this product', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('123'); await expect(page.getByRole('button', { name: 'Add this product', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find product', exact: true })).toBeDisabled();
  await page.route(endpoint, route => route.abort('internetdisconnected')); await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('3017620422003'); await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Saved products work offline'); await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await expect(page.getByTestId('quick-text')).toHaveValue('10g olive oil'); await expect(page.getByTestId('commit-food')).toBeEnabled();
});
test('editing a saved label from one draft row keeps other quantities and does not log food', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ json: milkProduct() })); await scan(page);
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('quantity-0')).toHaveValue('100');
  await page.getByTestId('quick-text').fill('10g olive oil'); await expect(page.getByTestId('quantity-0')).toHaveValue('10'); await expect(page.getByTestId('quantity-1')).toHaveValue('100');
  await page.getByRole('button', { name: 'Change food 2', exact: true }).click(); await page.getByRole('button', { name: 'Edit label', exact: true }).click();
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('40'); await page.getByRole('button', { name: 'Save label', exact: true }).click(); await expect(page).toHaveURL(/\/entry$/);
  await expect(page.getByTestId('quantity-0')).toHaveValue('10'); await expect(page.getByTestId('quantity-1')).toHaveValue('100'); await expect(page.getByTestId('meal-kcal')).toContainText('129');
  const saved = await backup(page); expect(saved.logs).toHaveLength(0); expect(saved.draft.lines[1].food.nutrition.kcal).toBe('40'); expect(saved.foods.find((food: { barcode?: string }) => food.barcode === milkCode).nutrition.kcal).toBe('40');
});
test('g/ml ambiguity loads separate sourced values and keeps edits without assuming density', async ({ page }) => {
  const response = milkProduct(), ml = response.product.nutrition.input_sets[0];
  response.product.nutrition.input_sets.unshift({ ...ml, per: '100g', per_unit: 'g', nutrients: { ...ml.nutrients, 'energy-kcal': { value: 50, unit: 'kcal' } } });
  await page.route(endpoint, route => route.fulfill({ json: response })); await scan(page);
  await expect(page.getByRole('button', { name: 'Confirm and add', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Label energy · kcal', exact: true })).toHaveValue('37');
  await page.getByRole('textbox', { name: 'Label energy · kcal', exact: true }).fill('38'); await page.getByRole('textbox', { name: 'Amount to add · ml', exact: true }).fill('250');
  await page.getByRole('button', { name: 'Per 100 g', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Label energy · kcal', exact: true })).toHaveValue('50');
  await expect(page.getByRole('textbox', { name: 'Amount to add · g', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Label energy · kcal', exact: true })).toHaveValue('38'); await expect(page.getByRole('textbox', { name: 'Amount to add · ml', exact: true })).toHaveValue('250');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('meal-kcal')).toContainText('95');
});
test('changing barcode or leaving Scan cancels a delayed lookup and never adds an unconfirmed product', async ({ page }) => {
  let finish: (() => Promise<void>) | undefined;
  await page.route(endpoint, route => new Promise<void>(resolve => { finish = async () => { try { await route.fulfill({ json: milkProduct() }); } catch { /* request already cancelled */ } resolve(); }; }));
  await scan(page); await expect(page.getByText('Looking up this barcode…', { exact: true })).toBeVisible();
  await expect.poll(() => !!finish).toBe(true); await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('3017620422003'); await finish!();
  await expect(page.getByTestId('barcode-review')).toHaveCount(0); await expect(page.getByTestId('quantity-0')).toHaveCount(0);
  finish = undefined; await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill(milkCode); await page.getByRole('button', { name: 'Find product', exact: true }).click(); await expect(page.getByText('Looking up this barcode…', { exact: true })).toBeVisible();
  await expect.poll(() => !!finish).toBe(true); await page.getByRole('button', { name: 'Type a meal', exact: true }).click(); await finish!();
  await expect(page.getByTestId('quantity-0')).toHaveCount(0); await expect(page.getByTestId('barcode-review')).toHaveCount(0);
});
test('prepared-only or estimated products require label entry and an explicit basis', async ({ page }) => {
  const response = milkProduct(); response.product.nutrition.input_sets[0].preparation = 'prepared';
  await page.route(endpoint, route => route.fulfill({ json: response })); await scan(page);
  await expect(page.getByRole('textbox', { name: 'Label energy · kcal', exact: true })).toHaveValue(''); await expect(page.getByRole('button', { name: 'Confirm and add', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click(); await page.getByRole('textbox', { name: 'Label energy · kcal', exact: true }).fill('37');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('quantity-0')).toHaveValue('100');
  await expect(page.getByTestId('meal-kcal')).toContainText('37'); await expect(page.getByTestId('meal-nutrition')).toContainText('Protein –');
});
test('live Open Food Facts lookup smoke (opt-in; real service, no request fixtures)', async ({ page }) => {
  test.skip(process.env.TG_LIVE_BARCODE !== '1', 'External service smoke is opt-in; CI uses deterministic API fixtures.');
  await scan(page); await expect(page.getByTestId('barcode-review')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Per 100 ml', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Label energy · kcal', exact: true })).toHaveValue('37');
  await page.screenshot({ path: path.join(output, 'live-product-review.png') });
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('commit-food')).toBeEnabled();
});
