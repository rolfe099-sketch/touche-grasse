import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { D, nutrients, recipePortion, recipeTotal } from '../src/domain/model';
import { recipeIdeaCopyId, recipeIdeas } from '../src/domain/recipeIdeas';

const output = path.resolve('../../verification/discover');
const first = recipeIdeas[0], copyId = recipeIdeaCopyId(first.recipe);
async function ideas(page: Page) { await page.goto('/search'); await page.getByRole('button', { name: 'Meal ideas', exact: true }).click(); }
async function exported(page: Page) { await page.goto('/settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8')); }
const file = (name: string) => path.join(output, `${name}-${test.info().project.name || 'chromium'}.png`);
async function storedDraft(page: Page) {
  return page.evaluate(() => new Promise<{ amount: string; food?: string }[]>((resolve, reject) => {
    const open = indexedDB.open('touche-grasse-v1'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readonly'), request = tx.objectStore('records').get('draft:active'); tx.oncomplete = () => { resolve((request.result?.value.lines ?? []).map((line: { quantityText: string; food?: { id: string } }) => ({ amount: line.quantityText, food: line.food?.id }))); db.close(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
  }));
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('ingredient categories, nutrition limits and inline amounts preserve the one-tap add path', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const qrDownloads: string[] = []; page.on('request', request => { if (/cdn\.jsdelivr\.net\/npm\/jsqr/.test(request.url())) qrDownloads.push(request.url()); });
  await page.goto('/search'); await page.getByRole('button', { name: 'Explore Meat', exact: true }).click();
  await expect(page.getByTestId('food-mvt:03.205')).toBeVisible(); await expect(page.getByTestId('food-mvt:03.126')).toBeVisible(); await expect(page.getByTestId('food-mvt:03.242')).toHaveCount(0);
  await page.getByRole('button', { name: 'Nutrition filters', exact: true }).click(); await page.getByRole('textbox', { name: 'Minimum g', exact: true }).fill('22');
  await page.getByRole('button', { name: 'Sort foods by protein', exact: true }).click();
  await expect(page.getByTestId('food-mvt:03.126')).toHaveCount(0); await expect(page.getByTestId('food-mvt:03.205')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hide filters', exact: true }).click();
  await page.getByRole('button', { name: 'Details for Chicken fillet, skinless · raw', exact: true }).click();
  await page.getByRole('textbox', { name: 'Amount · g', exact: true }).fill('150');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('166');
  await page.screenshot({ path: file('ingredient-details') });
  await page.getByRole('button', { name: 'Add 150 g', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('150'); await expect(page.getByTestId('meal-kcal')).toHaveText('166 kcal');
  // A computed preview is not a persistence acknowledgement. Wait for the real
  // IndexedDB commit before the helper deliberately replaces the entire page.
  await expect.poll(() => storedDraft(page)).toEqual([{ amount: '150', food: 'mvt:03.205' }]);
  const draft = await exported(page); expect(draft.logs).toEqual([]); expect(draft.draft.lines[0].food.id).toBe('mvt:03.205'); expect(draft.draft.lines[0].quantityText).toBe('150');
  await page.goto('/search'); await page.getByTestId('search-input').fill('olive oil'); await page.getByRole('button', { name: 'Select Olive oil', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('150'); await expect(page.getByTestId('quantity-1')).toHaveValue('100'); expect(errors).toEqual([]); expect(qrDownloads).toEqual([]);
});

test('recipe search, source-based details and an editable Library copy survive reload without overwriting corrections', async ({ page }) => {
  await ideas(page); await expect(page.getByTestId('idea-chicken-pesto-pasta')).toBeVisible(); await page.screenshot({ path: file('meal-ideas') });
  await page.getByRole('textbox', { name: 'Search meal ideas', exact: true }).fill('kylling'); await expect(page.getByTestId('idea-chicken-pesto-pasta')).toHaveCount(1); await expect(page.getByTestId('idea-salmon-bulgur')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search meal ideas', exact: true }).fill('chicken breast'); await expect(page.getByTestId('idea-chicken-pesto-pasta')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search meal ideas', exact: true }).fill('kyllingbryst'); await expect(page.getByTestId('idea-chicken-pesto-pasta')).toHaveCount(1);
  await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click();
  await expect(page.getByTestId('idea-nutrition').getByTestId('nutrition-kcal')).toHaveText('638');
  await page.screenshot({ path: file('recipe-review') });
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open saved copy', exact: true })).toBeVisible();
  const saved = await exported(page); expect(saved.recipes).toHaveLength(1); expect(saved.logs).toEqual([]); expect(saved.preparedBatches ?? []).toEqual([]); expect(saved.recipes[0].id).toBe(copyId);
  await ideas(page); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click(); await page.getByRole('button', { name: 'Open saved copy', exact: true }).click();
  await page.getByTestId('recipe-quantity-0').fill('800'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open recipe Chicken pesto pasta', exact: true })).toBeVisible();
  await ideas(page); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click(); await expect(page.getByTestId('idea-nutrition').getByTestId('nutrition-kcal')).toHaveText('638');
  await page.getByRole('button', { name: 'Open saved copy', exact: true }).click(); await expect(page.getByTestId('recipe-quantity-0')).toHaveValue('800');
  await page.reload(); await expect(page.getByTestId('recipe-quantity-0')).toHaveValue('800'); const edited = await exported(page); expect(edited.recipes).toHaveLength(1); expect(edited.recipes[0].ingredients[0].quantity).toBe('800'); expect(edited.logs).toEqual([]);
  await page.goto(`/recipe?id=${encodeURIComponent(copyId)}`); await page.getByTestId('recipe-quantity-0').fill('750'); await expect(page.getByTestId('recipe-save-status')).toHaveText('Draft saved on this device.');
  await ideas(page); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click(); await page.getByRole('button', { name: 'Prepare batch', exact: true }).click();
  await expect(page.getByTestId('batch-preview')).toContainText('610.25 kcal per serving'); await page.getByRole('button', { name: 'Edit recipe', exact: true }).click(); await expect(page.getByTestId('recipe-quantity-0')).toHaveValue('750');
});

test('preparing a recipe creates uneaten portions; logging and Undo preserve exactly one sixth of the original snapshot', async ({ page }) => {
  const interactions: string[] = [], positions: { action: string; scrollRequired: boolean }[] = [];
  const tap = async (name: string) => { const target = page.getByRole('button', { name, exact: true }); const bounds = await target.boundingBox(); const bottom = page.viewportSize()!.height - (new URL(page.url()).pathname === '/search' ? 82 : 0); positions.push({ action: name, scrollRequired: !bounds || bounds.y < 0 || bounds.y + bounds.height > bottom }); await target.click(); interactions.push(name); };
  await page.goto('/search'); await tap('Meal ideas'); await tap('View recipe Chicken pesto pasta'); await tap('Prepare batch');
  await expect(page.getByTestId('split-panel')).toBeVisible(); await expect(page.getByTestId('batch-servings')).toHaveValue('6');
  await page.screenshot({ path: file('batch-setup') });
  await tap('Save batch'); await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await expect(page.getByTestId('portion-preview')).toContainText('638 kcal'); await page.screenshot({ path: file('prepared-batch') });
  await tap('Log 1 serving'); await expect(page.getByTestId('remaining-portions')).toContainText('5 servings left');
  const archive = await exported(page); expect(archive.logs).toHaveLength(1); expect(archive.preparedBatches).toHaveLength(1);
  const all = recipeTotal(first.recipe); for (const nutrient of nutrients) expect(archive.logs[0].nutrition[nutrient]).toBe(new D(all[nutrient]!).div(6).toFixed());
  expect(archive.logs[0].nutrition).toEqual(recipePortion(first.recipe)); expect(archive.preparedBatches[0].recipe.cookedWeightGrams).toBeNull();
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(1); await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('log-row')).toHaveCount(0);
  const undone = await exported(page); expect(undone.logs).toEqual([]); expect(undone.preparedBatches).toHaveLength(1);
  expect(positions.every(p => !p.scrollRequired)).toBe(true);
  writeFileSync(path.join(output, `interactions-${test.info().project.name || 'chromium'}.json`), JSON.stringify({ viewport: page.viewportSize(), scope: 'From Discover, no optional changes; automated actions, not human time', actions: interactions, positions, tapsToSaveBatch: 4, tapsToLogFirstPortion: 5, scrollsRequired: positions.filter(p => p.scrollRequired).length, nutrition: archive.logs[0].nutrition, total: all }, null, 2));
});

test('recipe collection and saves work with the network unavailable, without silently logging food', async ({ page }) => {
  await ideas(page); await page.context().setOffline(true);
  try {
    await page.getByRole('textbox', { name: 'Search meal ideas', exact: true }).fill('tofu');
    await page.getByRole('button', { name: 'View recipe Tofu & red lentil pot', exact: true }).click();
    await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open saved copy', exact: true })).toBeVisible();
  } finally { await page.context().setOffline(false); }
  const saved = await exported(page); expect(saved.logs).toEqual([]); expect(saved.recipes).toHaveLength(1); expect(saved.recipes[0].name).toBe('Tofu & red lentil pot');
});

test('compact widths and enlarged browser text keep recipe actions readable and reachable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 }); await ideas(page); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click();
  await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll<HTMLElement>('[dir="auto"],input')).map(element => { const style = getComputedStyle(element); return { element, size: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) }; });
    for (const { element, size, line } of values) { element.style.fontSize = `${size * 1.7}px`; element.style.lineHeight = Number.isFinite(line) ? `${line * 1.7}px` : '1.3'; }
  });
  for (const label of ['Save recipe', 'Prepare batch']) { const button = page.getByRole('button', { name: label, exact: true }); await button.scrollIntoViewIfNeeded(); const bounds = await button.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: file('large-text') }); await page.getByRole('button', { name: 'Save recipe', exact: true }).click(); await expect(page.getByRole('button', { name: 'Open saved copy', exact: true })).toBeVisible();
});
