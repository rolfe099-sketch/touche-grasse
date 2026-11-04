import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { D, emptyDraft, Food, foodNutrition, LogEntry, nutrients, PreparedBatch, recipePortion, recipeTotal, total } from '../src/domain/model';
import { FoodIndex } from '../src/domain/search';
import { emptyPreferences, matchIngredient, reviewInput } from '../src/domain/quickEntry';
import { assertBatchCapacity, batchBalance, portionFits, validateBatch } from '../src/domain/portions';
import { cookingRecordAllowed } from '../src/domain/foodLanguage';
const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));
export const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', 'mvt:08.019', 'mvt:01.200'];
const amounts = ['200', '150', '15', '10', '50'];
function batch(): PreparedBatch { return { id: 'test-batch', createdAt: '2026-10-23T12:00:00Z', meal: 'Middag', recipe: { id: 'test-recipe', name: 'Six servings', servings: '6', cookedWeightGrams: '600', steps: [], favorite: false, ingredients: ids.map((id, i) => ({ id: String(i), food: index.get(id)!, quantity: amounts[i], unit: 'g' })) } }; }
function log(b: PreparedBatch, quantity: string, unit: 'g' | 'servings'): LogEntry { return { id: randomUUID(), batchId: randomUUID(), preparedBatchId: b.id, meal: b.meal, recordedAt: b.createdAt, snapshot: { kind: 'recipe', recipe: b.recipe, quantity, unit }, nutrition: recipePortion(b.recipe, quantity, unit) }; }
it('prefers raw clean cuts/dry pasta and excludes unlisted cooking fat, even from a remembered product', () => {
  expect(index.search('chicken')[0].id).toBe(ids[0]); expect(index.search('chicken breast')[0].id).toBe(ids[0]); expect(index.search('pasta')[0].id).toBe(ids[1]);
  expect(index.search('chicken cooked')[0].id).toBe('mvt:03.418');
  for (const query of ['chicken', 'chicken breast', 'chicken cooked', 'chicken fried without fat']) expect(index.search(query).some(food => food.id === 'mvt:03.242')).toBe(false);
  expect(index.search('chicken fried in fat')[0].id).toBe('mvt:03.242');
  const prefs = { matches: { chicken: { foodId: 'mvt:03.242', confirmedAt: new Date().toISOString() } }, favorites: ['mvt:03.242'] };
  expect(matchIngredient('chicken', index, prefs).food).toBeNull();
  for (const query of ['salmon', 'rice', 'beef', 'egg', 'cod']) expect(index.search(query)[0].aliases[0]).toMatch(/raw|uncooked/);
  expect(index.search('cod').some(food => /breaded|breadcrumbs|battered/.test(food.aliases[0]))).toBe(false);
  const butter = { ...index.get(ids[0])!, name: 'Chicken in butter', aliases: [] };
  expect(cookingRecordAllowed('chicken oil', butter)).toBe(false); expect(cookingRecordAllowed('chicken in butter', butter)).toBe(true);
});
it('keeps raw/cooked weights distinct, counts only entered ingredients and never infers absorption or yield', () => {
  expect(foodNutrition(index.get(ids[0])!, '200', 'g').kcal).toBe('222');
  expect(foodNutrition(index.get('mvt:03.418')!, '200', 'g').kcal).toBe('270');
  const draft = reviewInput({ kind: 'text', text: '200g chicken breast, 150g dry pasta, 15g pesto, 10g olive oil, 50g parmesan' }, emptyDraft(randomUUID), index, emptyPreferences(), randomUUID);
  expect(draft.lines).toHaveLength(5);
  expect(recipeTotal(batch().recipe)).toEqual(total(ids.map((id, i) => foodNutrition(index.get(id)!, amounts[i], 'g'))));
  const b = batch(), all = recipeTotal(b.recipe); expect(all.kcal).toBe('1116.25');
  b.recipe.cookedWeightGrams = '900'; expect(recipeTotal(b.recipe)).toEqual(all);
});
it('records exactly the decimal one-sixth and scales gram portions only from measured final weight', () => {
  const b = batch(), all = recipeTotal(b.recipe), one = recipePortion(b.recipe);
  for (const key of nutrients) expect(one[key]).toBe(new D(all[key]!).div(6).toFixed());
  expect(recipePortion(b.recipe, '100', 'g')).toEqual(one);
  expect(recipePortion(b.recipe, '200', 'g')).toEqual(recipePortion(b.recipe, '2'));
  b.recipe.cookedWeightGrams = null;
  expect(() => recipePortion(b.recipe, '1', 'g')).toThrow('cooked batch weight'); expect(() => portionFits(b, [], '1', 'g')).toThrow('measured');
});
it('conserves mixed grams/servings without a recurring residual and rejects overdraw', () => {
  const b = batch(), logs = [log(b, '1', 'servings'), log(b, '100', 'g')];
  expect(batchBalance(b, logs).servings.toFixed()).toBe('4'); expect(batchBalance(b, logs).grams?.toFixed()).toBe('400');
  logs.push(log(b, '400', 'g')); expect(batchBalance(b, logs).numerator.toFixed()).toBe('0');
  expect(() => portionFits(b, logs, '0.000001', 'g')).toThrow('exceeds');
  expect(() => assertBatchCapacity([b], [...logs, log(b, '1', 'servings')])).toThrow('exceeds');
});
it('supports custom fractional serving counts without requiring or inventing a cooked weight', () => {
  const b = batch(); b.recipe.servings = '2.5'; b.recipe.cookedWeightGrams = null; validateBatch(b);
  const all = recipeTotal(b.recipe), one = recipePortion(b.recipe);
  for (const key of nutrients) expect(one[key]).toBe(new D(all[key]!).div('2.5').toFixed());
  const logs = [log(b, '1.25', 'servings')]; expect(batchBalance(b, logs).servings.toFixed()).toBe('1.25');
  portionFits(b, logs, '1.25', 'servings'); expect(() => portionFits(b, logs, '1.250001', 'servings')).toThrow('exceeds');
});
it('preserves unknown nutrients, validates custom counts and protects original batch snapshots', () => {
  const b = batch(); b.recipe.ingredients[0].food = { ...b.recipe.ingredients[0].food, nutrition: { ...b.recipe.ingredients[0].food.nutrition, protein: null } };
  expect(recipePortion(b.recipe).protein).toBeNull();
  expect(() => validateBatch({ ...b, recipe: { ...b.recipe, servings: '0' } })).toThrow();
  expect(() => validateBatch({ ...b, recipe: { ...b.recipe, cookedWeightGrams: '0' } })).toThrow();
  expect(() => validateBatch({ ...b, recipe: { ...b.recipe, servings: '1.1234567' } })).toThrow('six');
  const entry = log(b, '1', 'servings'); if (entry.snapshot.kind === 'recipe') entry.snapshot.recipe = { ...entry.snapshot.recipe, servings: '12' };
  expect(() => assertBatchCapacity([b], [entry])).toThrow('original batch');
  expect(() => assertBatchCapacity([], [log(b, '1', 'servings')])).toThrow('missing');
});
