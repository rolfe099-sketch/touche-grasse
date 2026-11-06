import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Food, foodNutrition, LogEntry, recipePortion, recipeSchema, Recipe } from '../src/domain/model';
import { makeRepeatReview, repeatAvailability, repeatReviewSchema, reviewRepeatedMeal } from '../src/domain/repeatMeal';
import { yesterdayMealEntries } from '../src/domain/commands';
const oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!;
function foodEntry(): LogEntry { return { id: randomUUID(), batchId: 'original', recordedAt: '2026-11-03T08:00:00Z', meal: 'Frokost', snapshot: { kind: 'food', ingredient: { id: 'ingredient', food: { ...oil, nutrition: { ...oil.nutrition, fiber: null } }, quantity: '10', unit: 'g' } }, nutrition: { ...foodNutrition(oil, '10', 'g'), fiber: null } }; }
it('changes only the selected amount and calculates from the captured food and recipe values', () => {
  const recipe: Recipe = recipeSchema.parse({ id: 'recipe', name: 'Six portions', ingredients: [{ id: 'oil', food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: '600', steps: [], favorite: false });
  const food = foodEntry(), portion: LogEntry = { ...food, id: 'portion', preparedBatchId: 'finite', snapshot: { kind: 'recipe', recipe, quantity: '1', unit: 'servings' }, nutrition: recipePortion(recipe, '1', 'servings') };
  const review = makeRepeatReview([food, portion], 'review'), original = structuredClone(review);
  const progress = reviewRepeatedMeal({ ...review, amounts: ['15,5', '2'] });
  expect(progress.valid).toBe(true); expect(progress.rows[0].snapshot?.kind === 'food' && progress.rows[0].snapshot.ingredient.quantity).toBe('15.5');
  expect(progress.rows[1].snapshot?.kind === 'recipe' && progress.rows[1].snapshot.quantity).toBe('2');
  expect(progress.nutrition.kcal).toBe('316.66'); expect(progress.nutrition.fiber).toBeNull(); expect(review).toEqual(original);
  const batches = [{ id: 'finite', recipe, meal: portion.meal, createdAt: portion.recordedAt }];
  expect(repeatAvailability(review, batches, [portion])).toBeNull();
  expect(repeatAvailability({ ...review, amounts: ['10', '6'] }, batches, [portion])).toContain('remaining');
  expect(repeatAvailability(review, [], [])).toContain('missing');
  expect(reviewRepeatedMeal({ ...review, amounts: ['10', '100'] }).rows[0].nutrition).toEqual(food.nutrition);
  expect(reviewRepeatedMeal({ ...makeRepeatReview([{ ...portion, snapshot: { kind: 'recipe', recipe, quantity: '100', unit: 'g' } }], 'weight'), amounts: ['200'] }).nutrition.kcal).toBe('178.4');
});
it('retains invalid draft text but blocks zero, unsupported and implausible quantities', () => {
  const review = makeRepeatReview([foodEntry()], 'review');
  for (const amount of ['', '0', '-1', '1e9', '1000001']) expect(reviewRepeatedMeal({ ...review, amounts: [amount] }).valid).toBe(false);
  expect(() => repeatReviewSchema.parse({ ...review, amounts: [] })).toThrow();
  expect(() => makeRepeatReview([review.entries[0], review.entries[0]], 'duplicate')).toThrow();
});
it('selects all and only yesterday’s requested meal using local calendar boundaries', () => {
  const now = new Date(2026, 10, 4, 0, 10), prior = new Date(2026, 10, 3, 23, 55);
  const wanted = { ...foodEntry(), recordedAt: prior.toISOString() }, second = { ...wanted, id: 'second', batchId: 'second' };
  const today = { ...wanted, id: 'today', recordedAt: now.toISOString() }, lunch = { ...wanted, id: 'lunch', meal: 'Lunsj' as const };
  expect(yesterdayMealEntries([today, wanted, lunch, second], 'Frokost', now)).toEqual([wanted, second]);
  expect(yesterdayMealEntries([today], 'Frokost', now)).toEqual([]);
});
