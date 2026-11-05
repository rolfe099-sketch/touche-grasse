import { z } from 'zod';
import { D, Food, LogEntry, foodSchema, logSchema, nutrients, parseAmount, snapshotNutrition, structuredCopy, total } from './model';

// Entry snapshots are the last valid structure. Text amounts may be unfinished;
// their cached nutrition is never used to save or log an edited meal.
export const editRowSchema = z.object({ entry: logSchema, amount: z.string().max(100), ingredients: z.record(z.string().max(200), z.string().max(100)) });
export const mealEditSchema = z.object({ id: z.string().min(1), target: z.enum(['shortcut', 'logs']), shortcutId: z.string().optional(),
  original: z.array(logSchema).min(1).max(200), rows: z.array(editRowSchema).max(200) });
export type MealEdit = z.infer<typeof mealEditSchema>;
export type EditRow = z.infer<typeof editRowSchema>;
export const mealCorrectionSchema = z.object({ id: z.string().min(1), correctedAt: z.iso.datetime(), previous: z.array(logSchema).min(1).max(200), applied: z.array(logSchema).min(1).max(200), revertedAt: z.iso.datetime().nullable() });
export type MealCorrection = z.infer<typeof mealCorrectionSchema>;
export function editRow(entry: LogEntry): EditRow {
  return { entry: structuredCopy(entry), amount: entry.snapshot.kind === 'food' ? entry.snapshot.ingredient.quantity : entry.snapshot.quantity, ingredients: {} };
}
export function makeMealEdit(entries: LogEntry[], id: string, shortcutId?: string): MealEdit {
  return mealEditSchema.parse({ id, target: shortcutId ? 'shortcut' : 'logs', shortcutId, original: structuredCopy(entries), rows: entries.map(editRow) });
}
function amount(text: string, previous: string) {
  // Keep untouched legacy decimals exact, including recurring recipe fractions.
  const value = text === previous ? previous : parseAmount(text);
  if (value === null) throw new Error('Check amount');
  return value;
}
export function reviewMealEdit(edit: MealEdit) {
  const rows = edit.rows.map(row => {
    try {
      const snapshot = structuredCopy(row.entry.snapshot);
      if (snapshot.kind === 'food') snapshot.ingredient.quantity = amount(row.amount, snapshot.ingredient.quantity);
      else {
        snapshot.quantity = amount(row.amount, snapshot.quantity);
        snapshot.recipe.ingredients = snapshot.recipe.ingredients.map(ingredient => ({ ...ingredient, quantity: amount(row.ingredients[ingredient.id] ?? ingredient.quantity, ingredient.quantity) }));
      }
      return { row, snapshot, nutrition: snapshotNutrition(snapshot), error: null };
    } catch (reason) { return { row, snapshot: null, nutrition: null, error: reason instanceof Error ? reason.message : 'Check this ingredient' }; }
  });
  return { rows, valid: !!rows.length && rows.every(row => !row.error) && new Set(rows.map(row => row.row.entry.id)).size === rows.length,
    nutrition: total(rows.flatMap(row => row.nutrition ? [row.nutrition] : [])) };
}
export function replaceEditFood(row: EditRow, food: Food, ingredientId?: string): EditRow {
  const next = structuredCopy(row), selected = foodSchema.parse(food);
  if (next.entry.snapshot.kind === 'food') next.entry.snapshot.ingredient.food = selected;
  else next.entry.snapshot.recipe.ingredients = next.entry.snapshot.recipe.ingredients.map(ingredient => ingredient.id === ingredientId ? { ...ingredient, food: selected } : ingredient);
  return next; // Keep amounts/units. An unavailable conversion must be resolved explicitly.
}
export function validateLogCalculation(entry: LogEntry) {
  for (const value of [entry, ...(entry.corrections ?? []).map(correction => correction.previous)]) {
    const computed = snapshotNutrition(value.snapshot);
    if (nutrients.some(key => (computed[key] == null) !== (value.nutrition[key] == null) || (computed[key] != null && value.nutrition[key] != null && !new D(computed[key]!).eq(value.nutrition[key]!)))) throw new Error('The backup contains an invalid nutrition calculation.');
  }
}
