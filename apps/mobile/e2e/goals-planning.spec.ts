import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { recipeIdeas } from '../src/domain/recipeIdeas';
import { D, nutrients, recipePortion } from '../src/domain/model';

const output = path.resolve('../../verification/goals-planning');
test.use({ timezoneId: 'UTC' });
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await page.emulateMedia({ reducedMotion: 'reduce' }); });
const shot = (n: string) => path.join(output, `${n}-${test.info().project.name || 'chromium'}.png`);
async function exported(page: Page) { await page.goto('/settings'); const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8')); }
async function plan(page: Page) { await page.goto('/'); await page.getByRole('button', { name: 'Meal planner', exact: true }).click(); await page.getByRole('button', { name: 'Plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Draft saved', { exact: true }).filter({ visible: true })).toBeVisible(); }
async function save(page: Page) { await page.getByRole('button', { name: 'Save planned meal', exact: true }).click(); await expect(page.getByText('Meal planned · nothing logged', { exact: true }).filter({ visible: true })).toBeVisible(); }

test('editable cut goals and training/rest schedules keep manual history and persist through reload', async ({ page }) => {
  await page.goto('/settings'); await page.getByRole('button', { name: 'Set up a goal', exact: true }).click(); await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await page.getByRole('textbox', { name: 'Maintenance estimate · kcal / day', exact: true }).fill('2500'); await page.getByRole('button', { name: 'Review starting targets', exact: true }).click();
  await page.getByRole('button', { name: 'Fri', exact: true }).click(); await page.getByRole('textbox', { name: 'Rest Fiber · g', exact: true }).fill('30');
  await page.getByRole('button', { name: 'Training targets', exact: true }).click(); await page.getByRole('textbox', { name: 'Training Energy · kcal', exact: true }).fill('2450'); await page.getByRole('textbox', { name: 'Training Fiber · g', exact: true }).fill('30');
  await page.screenshot({ path: shot('goal-review') }); await page.getByRole('button', { name: 'Save goal and schedule', exact: true }).click(); await expect(page.getByText('Goal saved from today', { exact: true }).filter({ visible: true })).toBeVisible();
  const data = await exported(page); expect(data.logs).toEqual([]); expect(data.goalPrograms).toHaveLength(1); expect(data.goalPrograms[0].rest.kcal).toBe('2250'); expect(data.goalPrograms[0].training.kcal).toBe('2450'); expect(data.goalPrograms[0].trainingDays).toEqual([4]);
  await page.reload(); await expect(page.getByText('Cut · Training day', { exact: true }).filter({ visible: true })).toBeVisible(); await expect(page.getByTestId('target-summary').first()).toContainText('2,450');
  await page.getByRole('button', { name: 'Edit daily targets', exact: true }).click(); await page.getByTestId('target-input-kcal').fill('2300'); await page.getByRole('button', { name: 'Save targets', exact: true }).click();
  // The editor closes only after the repository transaction succeeds. A click
  // alone is not an acknowledgement before a hard navigation in WebKit.
  await expect(page.getByTestId('target-editor')).toHaveCount(0); await expect(page.getByTestId('target-summary').first()).toContainText('2,300');
  const overridden = await exported(page); expect(overridden.goalPrograms).toEqual(data.goalPrograms); expect(overridden.targets.at(-1).values.kcal).toBe('2300');
});

test('the optional equation calculator produces a transparent editable estimate and never logs food', async ({ page }) => {
  await page.goto('/settings'); await page.getByRole('button', { name: 'Set up a goal', exact: true }).click(); await page.getByRole('button', { name: 'Estimate from body measurements', exact: true }).click();
  await page.getByRole('textbox', { name: 'Body weight · kg', exact: true }).fill('80'); await page.getByRole('textbox', { name: 'Height · cm', exact: true }).fill('180'); await page.getByRole('textbox', { name: 'Age · years', exact: true }).fill('30');
  await page.getByRole('button', { name: 'Male coefficient', exact: true }).click(); await page.getByRole('button', { name: 'I am an adult, not pregnant or breastfeeding', exact: true }).click(); await page.getByRole('button', { name: 'Review starting targets', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Rest Energy · kcal', exact: true })).toHaveValue('2494'); await page.getByRole('button', { name: 'Save goal and schedule', exact: true }).click(); await expect(page.getByText('Goal saved from today', { exact: true }).filter({ visible: true })).toBeVisible();
  const data = await exported(page); expect(data.goalPrograms[0].goal.method).toBe('mifflin-1990'); expect(data.goalPrograms[0].goal.estimate.weightKg).toBe('80'); expect(data.goalPrograms[0].trainingDays).toEqual([]); expect(data.logs).toEqual([]);
});

test('a three-tap recipe plan adds no eaten food; Today logs it in one tap and Undo reopens it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const actions: { action: string; scrollRequired: boolean }[] = [];
  const tap = async (label: string) => { const button = page.getByRole('button', { name: label, exact: true }), bounds = await button.boundingBox(); actions.push({ action: label, scrollRequired: !bounds || bounds.y < 0 || bounds.y + bounds.height > page.viewportSize()!.height - (new URL(page.url()).pathname === '/' ? 82 : 0) }); await button.click(); };
  await page.goto('/'); await tap('Meal planner'); await tap('Plan Chicken pesto pasta'); await expect(page.getByText('Draft saved', { exact: true }).filter({ visible: true })).toBeVisible(); await page.screenshot({ path: shot('plan-review') }); await tap('Save planned meal'); await expect(page.getByText('Meal planned · nothing logged', { exact: true }).filter({ visible: true })).toBeVisible();
  writeFileSync(path.join(output, `interactions-${test.info().project.name || 'chromium'}.json`), JSON.stringify({ viewport: page.viewportSize(), scope: 'Default recipe plan from Today; automated taps, not human completion time', taps: actions.length, actions }, null, 2));
  expect(actions).toHaveLength(3); expect(actions.every(a => !a.scrollRequired)).toBe(true); const data = await exported(page); expect(data.logs).toEqual([]); expect(data.mealPlans).toHaveLength(1);
  await page.goto('/'); await page.getByTestId('today-plans').scrollIntoViewIfNeeded(); await page.screenshot({ path: shot('today-planned') });
  await page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Planned meal logged', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Planned meal logged', { exact: true }).filter({ visible: true })).toBeVisible();
  const eaten = await exported(page); expect(eaten.logs).toHaveLength(1); const expected = recipePortion(recipeIdeas[0].recipe); for (const k of nutrients) expect(new D(eaten.logs[0].nutrition[k]).eq(expected[k]!)).toBe(true); expect(eaten.mealPlans[0].receipts).toHaveLength(2);
  await page.goto('/planner'); await expect(page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true })).toHaveCount(0); expect(errors).toEqual([]);
});

test('partial dates and quantities survive reload; future food needs an explicit Eat today action', async ({ page }) => {
  await plan(page); await page.getByRole('textbox', { name: 'Planned date · YYYY-MM-DD', exact: true }).fill('2026-'); await page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true }).fill('1,'); await expect(page.getByText('Draft saved', { exact: true }).filter({ visible: true })).toBeVisible(); await page.reload();
  await expect(page.getByRole('textbox', { name: 'Planned date · YYYY-MM-DD', exact: true })).toHaveValue('2026-'); await expect(page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true })).toHaveValue('1,'); await expect(page.getByRole('button', { name: 'Save planned meal', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Planned date · YYYY-MM-DD', exact: true }).fill('2026-11-09'); await page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true }).fill('2'); await save(page);
  await expect(page.getByRole('button', { name: 'Log plan Chicken pesto pasta today', exact: true })).toHaveText('Eat today'); await page.screenshot({ path: shot('future-plan') }); await page.getByRole('button', { name: 'Log plan Chicken pesto pasta today', exact: true }).click(); await expect(page.getByText('Planned meal logged', { exact: true }).filter({ visible: true })).toBeVisible();
  const data = await exported(page); expect(data.mealPlans[0].date).toBe('2026-11-09'); expect(data.logs[0].recordedAt.slice(0, 10)).toBe('2026-11-06'); expect(data.logs[0].snapshot.quantity).toBe('2');
});

test('plan corrections stay separate, cancel/restore works and backup restores goals and plans into a fresh store', async ({ page, browser }) => {
  await plan(page); await save(page); await page.getByRole('button', { name: 'Edit plan Chicken pesto pasta', exact: true }).click(); await page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true }).fill('0.5'); await save(page);
  await page.getByRole('button', { name: 'Cancel plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Plan cancelled', { exact: true }).filter({ visible: true })).toBeVisible(); await page.getByRole('button', { name: 'Show cancelled plans', exact: true }).click(); await page.getByRole('button', { name: 'Restore plan', exact: true }).click(); await expect(page.getByText('Plan restored', { exact: true }).filter({ visible: true })).toBeVisible();
  const data = await exported(page); expect(data.logs).toEqual([]); expect(data.mealPlans[0].items[0].quantity).toBe('0.5');
  const context = await browser.newContext(), other = await context.newPage(); await other.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); await other.goto('http://127.0.0.1:4173/settings');
  const filename = path.join(output, 'isolated-planner-backup.json'); writeFileSync(filename, JSON.stringify(data)); const chooser = other.waitForEvent('filechooser'); await other.getByRole('button', { name: 'Choose a backup file', exact: true }).click(); await (await chooser).setFiles(filename); await expect(other.getByText('1 meal plan', { exact: true }).filter({ visible: true })).toBeVisible(); await other.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(other.getByText('Backup restored', { exact: true }).filter({ visible: true })).toBeVisible(); await other.goto('http://127.0.0.1:4173/planner'); await expect(other.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true })).toBeVisible(); await context.close();
});

test('planner and goal controls fit a narrow viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 }); await plan(page); await expect(page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.screenshot({ path: shot('planner-narrow') });
  await page.goto('/settings'); await page.getByRole('button', { name: 'Set up a goal', exact: true }).click(); await page.getByRole('textbox', { name: 'Maintenance estimate · kcal / day', exact: true }).fill('2500'); await page.getByRole('button', { name: 'Review starting targets', exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('English food search uses the full Norwegian catalog and one amount edit leaves the other unchanged', async ({ page }) => {
  await page.goto('/planner'); await page.getByRole('button', { name: 'Foods', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a food to plan', exact: true }).fill('olive oil'); await page.getByRole('button', { name: 'Plan Olive oil', exact: true }).click();
  await page.getByRole('textbox', { name: 'Planned amount 1 · g', exact: true }).fill('10'); await page.getByRole('button', { name: 'Add more food', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a food to plan', exact: true }).fill('chicken fillet'); await page.getByRole('button', { name: 'Plan Chicken fillet, skinless · raw', exact: true }).click();
  await page.getByRole('textbox', { name: 'Planned amount 2 · g', exact: true }).fill('200'); await expect(page.getByRole('textbox', { name: 'Planned amount 1 · g', exact: true })).toHaveValue('10'); await save(page);
  const data = await exported(page); expect(data.logs).toEqual([]); expect(data.mealPlans[0].items.map((s: { ingredient: { quantity: string } }) => s.ingredient.quantity)).toEqual(['10', '200']); expect(data.mealPlans[0].items[1].ingredient.food.id).toBe('mvt:03.205'); expect(data.mealPlans[0].nutrition.kcal).toBe('311.2');
});

test('saved portions are not reserved by plans and insufficient stock blocks consumption without changing the diary', async ({ page }) => {
  await page.goto('/search'); await page.getByRole('button', { name: 'View recipe Chicken pesto pasta', exact: true }).click(); await page.getByRole('button', { name: 'Prepare batch', exact: true }).click(); await page.getByRole('button', { name: 'Save batch', exact: true }).click(); await expect(page.getByTestId('remaining-portions')).toContainText('6 servings left');
  await page.goto('/planner'); await page.getByRole('button', { name: 'Portions', exact: true }).click(); await page.getByRole('button', { name: 'Plan Chicken pesto pasta', exact: true }).click(); await page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true }).fill('6'); await save(page);
  await page.goto('/'); await page.getByRole('button', { name: 'Log one saved serving of Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Saved portion logged', { exact: true }).filter({ visible: true })).toBeVisible(); await page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByRole('alert').filter({ visible: true })).toContainText('exceeds');
  const before = await exported(page); expect(before.logs).toHaveLength(1); expect(before.mealPlans[0].loggedAt).toBeNull();
  await page.goto('/planner'); await page.getByRole('button', { name: 'Edit plan Chicken pesto pasta', exact: true }).click(); await page.getByRole('textbox', { name: 'Planned amount 1 · servings', exact: true }).fill('5'); await save(page); await page.getByRole('button', { name: 'Log plan Chicken pesto pasta', exact: true }).click(); await expect(page.getByText('Planned meal logged', { exact: true }).filter({ visible: true })).toBeVisible();
  const eaten = await exported(page); expect(eaten.logs).toHaveLength(2); const added = eaten.logs.find((l: { id: string }) => l.id !== before.logs[0].id); expect(added.preparedBatchId).toBe(eaten.preparedBatches[0].id); expect(added.nutrition).toEqual(recipePortion(recipeIdeas[0].recipe, '5'));
});

test('a split cooking draft must become saved portions before it can be planned as servings', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('60g olive oil'); await page.getByRole('button', { name: 'Split into servings', exact: true }).click(); await expect(page.getByTestId('batch-servings')).toHaveValue('6');
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.getByRole('button', { name: 'Meal planner', exact: true }).click(); await page.getByRole('button', { name: 'Usual meals', exact: true }).click(); await page.getByRole('button', { name: 'Plan Current Quick Log meal', exact: true }).click();
  await expect(page.getByRole('alert').filter({ visible: true })).toContainText('Save this batch in Quick Log first'); await expect(page.getByTestId('plan-editor')).toHaveCount(0);
  const data = await exported(page); expect(data.logs).toEqual([]); expect(data.mealPlans).toEqual([]); expect(data.draft.splitPlan.servingsText).toBe('6'); expect(data.draft.lines[0].quantityText).toBe('60');
});
