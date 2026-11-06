import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import catalog from '../src/data/catalog.json';
import { dayKey, emptyDraft, Food, foodNutrition, LogEntry, Recipe } from '../src/domain/model';
import { daySignature } from '../src/domain/dailyWorkflows';

const output = path.resolve('../../verification/accessibility-finish'), before = process.env.TG_ACCESSIBILITY_BEFORE === '1';
test.use({ timezoneId: 'UTC' });
const at = new Date('2026-11-06T12:00:00Z'), key = dayKey(at);
const chicken = (catalog as Food[]).find(food => food.id === 'mvt:03.205')!;
const oil: Food = structuredClone((catalog as Food[]).find(food => food.id === 'mvt:08.019')!); delete oil.nutrition.fiber;
const recipe: Recipe = { id: 'recipe', name: 'Chicken and olive oil for work lunches', ingredients: [{ id: 'chicken', food: chicken, quantity: '600', unit: 'g' }, { id: 'oil', food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: null, steps: ['Prepare the measured ingredients.'], favorite: false };
function fixture() {
  const logs: LogEntry[] = [chicken, oil].map((food, index) => ({ id: `entry-${index}`, batchId: 'meal', recordedAt: at.toISOString(), meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: `ingredient-${index}`, food, quantity: index ? '15' : '100', unit: 'g' } }, nutrition: foodNutrition(food, index ? '15' : '100', 'g') }));
  return { format: 'touche-grasse', version: 2, foods: [chicken, oil], recipes: [recipe], logs, draft: emptyDraft(() => 'ordinary'), targets: [{ id: 'targets', effectiveOn: key, recordedAt: at.toISOString(), values: { kcal: '2400', protein: '140', carbohydrate: '300', fat: '80', fiber: '30' } }], dayReviews: [{ id: key, complete: true, signature: daySignature(logs, key), updatedAt: at.toISOString() }], shortcuts: [{ id: 'shortcut', name: 'Chicken and olive oil for work lunches', entries: logs, pinned: true, createdAt: at.toISOString(), updatedAt: at.toISOString(), deletedAt: null }] };
}
async function restore(page: Page) {
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  const file = path.join(output, 'isolated-accessibility-fixture.json'); writeFileSync(file, JSON.stringify(fixture())); await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible();
}
async function enlargeText(page: Page) {
  // Browser text stress, not a simulation or claim of iOS Dynamic Type.
  await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll<HTMLElement>('div,span,input,textarea')).map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
    for (const { element, size, line } of values) { element.style.fontSize = `${size * 1.7}px`; element.style.lineHeight = Number.isFinite(line) ? `${line * 1.7}px` : '1.3'; }
  });
}
async function archive(page: Page) {
  await page.goto('/settings');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
}
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 320, height: 700 }); await page.clock.setFixedTime(at); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('main pages retain meaningful nutrient summaries, readable enlarged text and adequate search/chart targets', async ({ page }) => {
  await restore(page); const observations: Record<string, unknown> = {}, failures: string[] = [];
  for (const [name, route] of [['today', '/'], ['library', '/recipes'], ['discover', '/search'], ['history', `/history?date=${key}&scope=week`]] as const) {
    await page.goto(route); await expect(page.getByRole('heading', { name: ({ today: 'Today', library: 'Library', discover: 'Discover', history: 'History' })[name], exact: true })).toBeVisible();
    if (name === 'today') {
      const overview = page.getByTestId('today-overview'); await expect(overview.getByTestId('nutrition-kcal')).toHaveText('245');
      const count = await overview.getByRole('group', { name: /^(Protein|Carbs|Fat|Fiber):/ }).count(); observations.nutrientSummaries = count;
      if (!before) await expect(overview.getByRole('group', { name: 'Fiber: unknown. Target 30 grams. Remaining amount is unknown.', exact: true })).toBeVisible();
      if (count !== 4) failures.push('Today needs four named nutrient summary groups.');
    }
    if (name === 'library' || name === 'discover') {
      const input = page.getByRole('textbox', { name: name === 'library' ? 'Search your library' : 'Search foods', exact: true }); const bounds = await input.boundingBox(); observations[`${name}Search`] = bounds;
      if (!bounds || bounds.height < 44) failures.push(`${name} search input is shorter than 44 points.`);
    }
    if (name === 'history') {
      const open = page.getByRole('button', { name: /^Open (Mon|Tue|Wed|Thu|Fri|Sat|Sun)/ }); await open.scrollIntoViewIfNeeded(); const bounds = await open.boundingBox(); observations.historyOpenDay = bounds;
      if (!bounds || bounds.width < 44 || bounds.height < 44) failures.push('History open-day action needs a 44-point target.');
    }
    if (!before) { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-${name}-390.png`) }); await page.setViewportSize({ width: 320, height: 700 }); }
    await enlargeText(page); await page.screenshot({ path: path.join(output, `${before ? 'before' : test.info().project.name || 'chromium'}-${name}-large-text.png`) });
    if (name === 'history' && !before) {
      const energy = (await page.getByRole('button', { name: 'Chart kcal', exact: true }).boundingBox())!, fat = (await page.getByRole('button', { name: 'Chart fat', exact: true }).boundingBox())!;
      expect(fat.y).toBeGreaterThan(energy.y);
      for (const metric of ['kcal', 'protein', 'carbs', 'fat', 'fiber']) {
        const contained = await page.getByRole('button', { name: `Chart ${metric}`, exact: true }).evaluate(element => { const parent = element.getBoundingClientRect(), label = element.lastElementChild!.getBoundingClientRect(); return label.left >= parent.left - 1 && label.right <= parent.right + 1; });
        expect(contained, `${metric} label stays inside its target`).toBe(true);
      }
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) failures.push(`${name} has horizontal page overflow.`);
  }
  writeFileSync(path.join(output, `${before ? 'before' : test.info().project.name || 'chromium'}-audit.json`), JSON.stringify({ dimensions: '320x700', browserTextMultiplier: 1.7, observations, failures }, null, 2));
  expect(failures).toEqual([]);
});

test('search clears in one tap, keeps focus, accepts Return and opens an editable draft without eating it', async ({ page }) => {
  await restore(page); await page.goto('/search');
  const input = page.getByRole('textbox', { name: 'Search foods', exact: true });
  await input.fill('olivenolje'); await expect(page.getByRole('button', { name: 'Select Olive oil', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear food search', exact: true }).click(); await expect(input).toHaveValue(''); await expect(input).toBeFocused();
  await input.fill('olive oil'); await input.press('Enter'); await expect(input).not.toBeFocused();
  await page.getByRole('button', { name: 'Select Olive oil', exact: true }).click();
  await page.getByTestId('quantity-0').click(); await page.keyboard.insertText('15'); await expect(page.getByTestId('quantity-0')).toHaveValue('15');
  await expect(page.getByTestId('commit-food')).toBeEnabled();
  await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('15');
  const saved = await archive(page); expect(saved.logs).toEqual(fixture().logs); expect(saved.draft.lines[0].quantityText).toBe('15');
  await page.goto('/recipes'); const library = page.getByRole('textbox', { name: 'Search your library', exact: true });
  await library.fill('work lunches'); await expect(page.getByRole('button', { name: `Edit recipe ${recipe.name}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear library search', exact: true }).click(); await expect(library).toHaveValue(''); await expect(library).toBeFocused();
});

test('narrow forms give values room, cancel safely and preserve all historical snapshots', async ({ page }) => {
  await restore(page); await page.goto('/');
  for (const label of ['Today', 'Library', 'Discover', 'History']) {
    const tab = page.getByRole('tab', { name: label, exact: true }); const box = (await tab.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('tab', { name: 'Today', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Edit daily targets', exact: true }).click();
  const protein = page.getByTestId('target-input-protein'); expect((await protein.boundingBox())!.width).toBeGreaterThan(250);
  await protein.click(); await page.keyboard.insertText('155'); await expect(protein).toHaveValue('155');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-targets-320.png`) });
  await page.getByRole('button', { name: 'Cancel targets', exact: true }).click();
  await page.goto('/log?id=entry-0');
  const amount = page.getByRole('textbox', { name: 'Logged amount', exact: true }); expect((await amount.boundingBox())!.width).toBeGreaterThan(250);
  await amount.fill('125'); await expect(page.getByRole('textbox', { name: 'Time (HH:MM)', exact: true })).toHaveValue('12:00');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-correction-320.png`) });
  await page.goto(`/history?date=${key}&scope=week&view=weight`); await page.getByRole('button', { name: 'Log weight', exact: true }).click();
  const weight = page.getByRole('textbox', { name: 'Weight · kg', exact: true }); expect((await weight.boundingBox())!.width).toBeGreaterThan(250);
  await weight.fill('80.5'); await page.getByRole('button', { name: 'Cancel weigh-in', exact: true }).click();
  const saved = await archive(page); expect(saved.logs).toEqual(fixture().logs); expect(saved.targets).toEqual(fixture().targets); expect(saved.weighIns).toEqual([]);
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00Z')); await page.goto('/');
  await expect(page.getByTestId('today-day-2026-11-08')).toBeInViewport({ ratio: 1 });
});
