import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { D, display, Food, foodNutrition, nutritionSchema, Recipe, recipePortion, recipeTotal, scale, scaleRatio, total, validateFood } from '../src/domain/model';
import { historyIndex, monthlyTrend, periodSummary } from '../src/domain/history';

const food = (id: string) => catalog.find(f => f.id === `mvt:${id}`)! as Food;
const batch: Recipe = { id: 'fiber-batch', name: 'Chicken pesto pasta', servings: '6', cookedWeightGrams: '600', steps: [], favorite: false,
  ingredients: ['03.205', '05.016', '06.144', '08.019', '01.200'].map((id, i) => ({ id, food: food(id), quantity: ['200', '150', '15', '10', '50'][i], unit: 'g' })) };

it('imports exact dietary fiber quantities and provenance from the captured official records, including zero and unknown', () => {
  const source = JSON.parse(readFileSync('../../Fixtures/matvaretabellen-foods-nb.json', 'utf8')).foods as { foodId: string; constituents: { nutrientId: string; quantity?: number; unit?: string; sourceId?: string }[] }[];
  const records = new Map(source.map(f => [f.foodId, f]));
  for (const record of catalog) {
    const fiber = records.get(record.provenance.sourceID)!.constituents.find(n => n.nutrientId === 'Fiber');
    if (fiber?.quantity === undefined) expect(record.nutrition.fiber).toBeNull();
    else expect(new D(record.nutrition.fiber!).eq(String(fiber.quantity))).toBe(true);
    if (fiber?.quantity !== undefined) expect(fiber.unit).toBe('g');
    expect(record.provenance.nutrientSources.fiber).toBe(fiber?.sourceId ?? '');
  }
});
it('scales fiber by exact serving and measured cooked weight without changing energy or carbohydrates', () => {
  const all = recipeTotal(batch), one = recipePortion(batch);
  expect(all.fiber).toBe('6.135'); expect(one.fiber).toBe('1.0225');
  expect(all.kcal).toBe('1116.25'); expect(all.carbohydrate).toBe('105.375');
  expect(recipePortion(batch, '100', 'g')).toEqual(one);
  expect(recipePortion(batch, '2').fiber).toBe('2.045');
  expect(recipePortion({ ...batch, cookedWeightGrams: '300' }, '50', 'g')).toEqual(one);
  expect(new D(one.fiber!).times(6).toFixed()).toBe(all.fiber);
  expect(foodNutrition(food('08.019'), '10', 'g').fiber).toBe('0');
});
it('keeps legacy missing and explicit unknown fiber distinct from verified zero', () => {
  const legacy = { kcal: '100', protein: '10', carbohydrate: '10', fat: '2' };
  expect(nutritionSchema.parse(legacy)).toEqual(legacy);
  expect(scale(legacy, 2).fiber).toBeNull(); expect(scaleRatio(legacy, 1, 6).fiber).toBeNull();
  expect(total([legacy, { ...legacy, fiber: '2' }]).fiber).toBeNull();
  expect(total([{ ...legacy, fiber: null }, { ...legacy, fiber: '0' }]).fiber).toBeNull();
  expect(total([{ ...legacy, fiber: '0' }]).fiber).toBe('0');
  expect(display(undefined)).toBe('–'); expect(display('0')).toBe('0');
});
it('validates manual fiber and respects per-100ml units', () => {
  for (const fiber of ['-1', 'NaN', '101']) expect(() => validateFood({ ...food('05.016'), nutrition: { ...food('05.016').nutrition, fiber } })).toThrow();
  const drink: Food = { ...food('05.016'), referenceUnit: 'ml', nutrition: { ...food('05.016').nutrition, fiber: '1.25' } };
  expect(foodNutrition(drink, '250', 'ml').fiber).toBe('3.125');
  expect(() => foodNutrition(drink, '250', 'g')).toThrow('conversion');
});
it('includes fiber in daily, period and lifetime averages without treating unrecorded data as zero', () => {
  const log = { id: randomUUID(), batchId: randomUUID(), recordedAt: '2026-10-28T12:00:00Z', meal: 'Lunsj' as const,
    snapshot: { kind: 'recipe' as const, recipe: batch, quantity: '1', unit: 'servings' as const }, nutrition: recipePortion(batch) };
  const index = historyIndex([log]);
  expect(index.days[0].nutrition.fiber).toBe('1.0225');
  expect(periodSummary(index, [new Date(log.recordedAt)]).average?.fiber).toBe('1.0225');
  expect(monthlyTrend(index)[0].average?.fiber).toBe('1.0225');
  const missing = { ...log.nutrition }; delete missing.fiber;
  expect(historyIndex([log, { ...log, id: randomUUID(), nutrition: missing }]).days[0].nutrition.fiber).toBeNull();
});
