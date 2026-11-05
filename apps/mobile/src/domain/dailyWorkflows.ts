import { z } from 'zod';
import { dayKey, LogEntry, logSchema, nutrients, snapshotNutrition } from './model';
import { normalize } from './search';

export const mealShortcutSchema = z.object({
  id: z.string().min(1).max(200), name: z.string().trim().min(1).max(80),
  entries: z.array(logSchema).min(1).max(200), pinned: z.boolean(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable(),
});
export type MealShortcut = z.infer<typeof mealShortcutSchema>;
export function validateShortcut(value: unknown): MealShortcut {
  const shortcut = mealShortcutSchema.parse(value);
  if (!normalize(shortcut.name)) throw new Error('Give this shortcut a name.');
  if (new Set(shortcut.entries.map(entry => entry.id)).size !== shortcut.entries.length) throw new Error('This shortcut has duplicate rows.');
  for (const entry of shortcut.entries) {
    const computed = snapshotNutrition(entry.snapshot);
    if (nutrients.some(key => (computed[key] ?? null) !== (entry.nutrition[key] ?? null))) throw new Error('The shortcut contains an invalid nutrition calculation.');
  }
  return shortcut;
}

export const dayReviewSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), complete: z.boolean(),
  signature: z.string().max(5000000), updatedAt: z.iso.datetime(),
});
export type DayReview = z.infer<typeof dayReviewSchema>;
// Completion applies to exactly the reviewed intake. Quantity, product, date,
// deletion or additions reopen it; undoing that change restores the same review.
// This is a canonical value, not a collision-prone checksum or calorie threshold.
export function daySignature(logs: LogEntry[], date: string) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(logs.filter(entry => dayKey(new Date(entry.recordedAt)) === date).sort((a, b) => a.id.localeCompare(b.id)).map(entry => ({
    id: entry.id, meal: entry.meal, recordedAt: entry.recordedAt, snapshot: entry.snapshot.kind === 'food'
      ? { kind: 'food', food: entry.snapshot.ingredient.food.id, quantity: entry.snapshot.ingredient.quantity, unit: entry.snapshot.ingredient.unit }
      : { kind: 'recipe', recipe: entry.snapshot.recipe.id, quantity: entry.snapshot.quantity, unit: entry.snapshot.unit, servings: entry.snapshot.recipe.servings, weight: entry.snapshot.recipe.cookedWeightGrams, ingredients: entry.snapshot.recipe.ingredients.map(ingredient => ({ food: ingredient.food.id, quantity: ingredient.quantity, unit: ingredient.unit })) },
    preparedBatchId: entry.preparedBatchId ?? null, nutrition: nutrients.map(key => entry.nutrition[key] ?? null),
  }))));
}
export function dayComplete(reviews: DayReview[], logs: LogEntry[], date: string) {
  const review = reviews.find(item => item.id === date);
  return !!review?.complete && review.signature === daySignature(logs, date);
}
