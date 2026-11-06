import { test, expect, Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { D, dayKey, Food, foodNutrition, nutrients, total } from '../src/domain/model';
import { addDays } from '../src/domain/history';
const output = path.resolve(process.env.TG_PORTIONS_OUTPUT ?? '../../verification/portions');
const input = '200g chicken breast, 150g dry pasta, 15g pesto, 10g olive oil, 50g parmesan';
const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', 'mvt:08.019', 'mvt:01.200'];
const amounts = ['200', '150', '15', '10', '50'];
const all = total(ids.map((id, i) => foodNutrition(catalog.find(food => food.id === id)! as Food, amounts[i], 'g')));
async function meal(page: Page) {
  await page.goto('/'); await page.getByTestId('today-add').click(); await page.getByTestId('quick-text').fill(input);
  for (let row = 0; row < 3; row++) await page.getByTestId(`choice-${row}-${ids[row]}`).click();
  await expect(page.getByTestId('meal-kcal')).toHaveText('1,116 kcal'); await expect(page.getByTestId('commit-food')).toBeEnabled();
}
async function archive(page: Page) {
  await page.goto('/settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
}
// A hard browser reload cancels pending page work. Observe the actual stored
// draft before testing restart persistence, rather than treating a preview as a
// transaction acknowledgement. No production test hooks are involved.
async function splitSaved(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('touche-grasse-v1', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('records', 'readonly'), read = tx.objectStore('records').get('draft:active');
      tx.oncomplete = () => { db.close(); resolve(read.result?.value?.splitPlan); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }))).toMatchObject({ servingsText: '6', cookedWeightText: '600' });
}

test('Quick Entry creates six saved servings without logging, consumes only chosen amounts and retains the rest across dates/reload', async ({ page }) => {
  await meal(page); await page.getByRole('button', { name: 'Split into servings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Batch name', exact: true }).fill('Six-serving chicken pasta');
  await page.getByTestId('batch-servings').fill('6'); await page.getByTestId('batch-weight').fill('600');
  await expect(page.getByTestId('batch-preview')).toContainText('186.04 kcal per serving'); await expect(page.getByTestId('batch-preview')).toContainText('1.86 kcal per gram');
  await splitSaved(page); await page.reload(); await expect(page.getByTestId('batch-servings')).toHaveValue('6'); await expect(page.getByTestId('batch-weight')).toHaveValue('600');
  await expect(page.getByTestId('commit-food')).toHaveCount(0);
  await page.getByTestId('save-batch').click(); await expect(page.getByTestId('remaining-portions')).toHaveText('6 servings left · 600 g');
  await page.screenshot({ path: path.join(output, 'six-servings-created-390.png') });
  await page.getByRole('button', { name: 'Save remaining for later', exact: true }).click();
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(0); await expect(page.getByTestId('nutrition-kcal')).toHaveText('–');
  await page.goto('/recipes'); await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await page.getByTestId('log-portion').click(); await expect(page.getByTestId('remaining-portions')).toContainText('5 servings left');
  await page.screenshot({ path: path.join(output, 'one-of-six-logged-390.png') });
  const first = await archive(page); expect(first.logs).toHaveLength(1); expect(first.preparedBatches).toHaveLength(1);
  expect(first.logs[0].snapshot.quantity).toBe('1'); expect(first.logs[0].snapshot.recipe.ingredients.map((i: { food: { id: string } }) => i.food.id)).toEqual(ids);
  for (const key of nutrients) expect(first.logs[0].nutrition[key]).toBe(new D(all[key]!).div(6).toFixed());
  await page.goto('/'); await expect(page.getByTestId('nutrition-kcal')).toHaveText('186');
  await page.goto('/recipes'); await page.getByRole('button', { name: 'Undo last portion', exact: true }).click();
  await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await page.getByTestId('log-portion').click();
  const tomorrow = dayKey(addDays(new Date(), 1));
  await page.getByTestId('portion-amount').fill('2'); await page.getByRole('button', { name: 'Choose date', exact: true }).click(); await page.getByTestId('portion-date').fill(tomorrow);
  await page.getByTestId('log-portion').click(); await expect(page.getByTestId('remaining-portions')).toContainText('3 servings left');
  await page.reload(); await expect(page.getByTestId('remaining-portions')).toContainText('3 servings left');
  await page.getByRole('button', { name: 'Grams', exact: true }).click(); await page.getByTestId('portion-amount').fill('100');
  await expect(page.getByTestId('portion-preview')).toContainText('186.04 kcal'); await page.getByTestId('log-portion').click(); await expect(page.getByTestId('remaining-portions')).toContainText('2 servings left');
  await page.getByTestId('portion-amount').fill('201'); await expect(page.getByTestId('log-portion')).toBeDisabled();
  await page.getByTestId('portion-amount').fill('200'); await page.getByTestId('log-portion').click();
  await expect(page.getByTestId('remaining-portions')).toContainText('0 servings left'); await page.reload();
  await page.getByRole('button', { name: 'Undo last portion', exact: true }).click(); await expect(page.getByTestId('remaining-portions')).toContainText('2 servings left');
  const backup = await archive(page); expect(backup.logs).toHaveLength(3); expect(backup.logs.some((l: { recordedAt: string }) => dayKey(new Date(l.recordedAt)) === tomorrow)).toBe(true);
  writeFileSync(path.join(output, 'six-serving-proof.json'), JSON.stringify({ input, total: all, oneServing: first.logs[0].nutrition, sourceIds: ids, logCountAfterBatchCreation: 0, savedServingCount: 6, remainingAfterOne: 5, finalRemaining: 2, futureDate: tomorrow, batch: backup.preparedBatches[0], loggedPortions: backup.logs }, null, 2));
});
test('recipes can create a finite batch independently of their reusable template, with no assumed cooked weight', async ({ page }) => {
  await meal(page); await page.getByRole('button', { name: 'Make a recipe', exact: true }).click();
  await page.getByRole('textbox', { name: 'Recipe name', exact: true }).fill('Six-serving recipe'); await page.getByRole('textbox', { name: 'Number of servings', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await page.getByRole('button', { name: 'Open recipe Six-serving recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Split into servings', exact: true }).click(); await expect(page.getByTestId('batch-servings')).toHaveValue('6');
  await expect(page.getByTestId('batch-weight')).toHaveValue(''); await page.getByTestId('save-batch').click();
  await expect(page.getByTestId('remaining-portions').filter({ visible: true })).toHaveText('6 servings left'); await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(1); // Existing recipe editor unit control remains; the saved-batch panel has no gram option.
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.goto('/recipes'); await expect(page.getByRole('button', { name: 'Grams', exact: true })).toHaveCount(0);
  await page.getByTestId('log-portion').click(); await expect(page.getByTestId('remaining-portions')).toContainText('5 servings left');
  const backup = await archive(page); expect(backup.recipes).toHaveLength(1); expect(backup.preparedBatches).toHaveLength(1); expect(backup.logs).toHaveLength(1);
  for (const key of nutrients) expect(backup.logs[0].nutrition[key]).toBe(new D(all[key]!).div(6).toFixed());
});
