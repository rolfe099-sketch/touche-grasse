import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applyMealDestination, makeMealEdit, mealEditSchema } from '../src/domain/mealEditor';
import { calendarKey } from '../src/domain/calendarDay';
import { Food, foodNutrition, LogEntry } from '../src/domain/model';
import catalog from '../src/data/catalog.json';

const oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!;
const now = new Date(2026, 10, 5, 18, 30);
function entry(): LogEntry {
  return { id: randomUUID(), batchId: 'meal', recordedAt: new Date(2026, 10, 4, 8, 45).toISOString(), meal: 'Frokost', snapshot: { kind: 'food', ingredient: { id: 'oil', food: oil, quantity: '10', unit: 'g' } }, nutrition: foodNutrition(oil, '10', 'g') };
}
it('changes only the selected destination, retaining snapshots, nutrition and identity', () => {
  const original = entry(), before = structuredClone(original);
  const moved = applyMealDestination(original, { loggingDate: '2026-11-03', meal: 'Lunsj' }, now);
  expect(moved).toMatchObject({ id: original.id, batchId: original.batchId, meal: 'Lunsj', timePrecision: 'day', snapshot: original.snapshot, nutrition: original.nutrition });
  expect(calendarKey(new Date(moved.recordedAt))).toBe('2026-11-03'); expect(new Date(moved.recordedAt).getHours()).toBe(12);
  expect(original).toEqual(before);
});
it('moving an old meal to today still leaves the eating time unspecified', () => {
  const moved = applyMealDestination(entry(), { loggingDate: '2026-11-05' }, now);
  expect(moved.timePrecision).toBe('day'); expect(new Date(moved.recordedAt).getHours()).toBe(12);
  expect(moved.recordedAt).not.toBe(now.toISOString());
});
it('a meal-only correction preserves the exact original timestamp and precision', () => {
  for (const original of [entry(), { ...entry(), timePrecision: 'day' as const }]) {
    const moved = applyMealDestination(original, { meal: 'Middag' }, now);
    expect(moved.recordedAt).toBe(original.recordedAt); expect(moved.timePrecision).toBe(original.timePrecision);
    expect(moved.snapshot).toEqual(original.snapshot); expect(moved.nutrition).toEqual(original.nutrition);
  }
});
it('choosing the original day does not replace a known time with noon', () => {
  const original = entry(); expect(applyMealDestination(original, { loggingDate: '2026-11-04' }, now)).toEqual(original);
  expect(applyMealDestination(original, undefined, now)).toBe(original);
});
it('a date-only correction preserves each original meal type', () => {
  for (const meal of ['Frokost', 'Lunsj', 'Middag', 'Annet'] as const) expect(applyMealDestination({ ...entry(), meal }, { loggingDate: '2026-11-03' }, now).meal).toBe(meal);
});
it.each(['', '2026-02-30', '2026-11-06', '05/11/2026'])('rejects an invalid or future destination without mutating a record: %s', loggingDate => {
  const original = entry(), before = structuredClone(original);
  expect(() => applyMealDestination(original, { loggingDate }, now)).toThrow(); expect(original).toEqual(before);
});
it('keeps legacy editor drafts compatible and prevents diary destinations on recipe shortcuts', () => {
  const old = makeMealEdit([entry()], 'editor'); expect(mealEditSchema.parse(old)).toEqual(old);
  expect(mealEditSchema.parse({ ...old, destination: { loggingDate: '2026-11-03', meal: 'Middag' } }).destination).toEqual({ loggingDate: '2026-11-03', meal: 'Middag' });
  expect(() => mealEditSchema.parse({ ...old, target: 'shortcut', shortcutId: 'shortcut', destination: { meal: 'Middag' } })).toThrow('Only logged meals');
});
