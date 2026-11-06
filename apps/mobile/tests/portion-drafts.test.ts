import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Food, PreparedBatch } from '../src/domain/model';
import { openPortionReview, portionDraftDate, portionDraftsSchema, portionFormSchema, switchPortionUnit, validatePortionDrafts } from '../src/domain/portionDraft';
const batch: PreparedBatch = { id: 'batch', createdAt: '2026-11-06T12:00:00Z', meal: 'Middag', recipe: { id: 'recipe', name: 'Six portions', ingredients: [{ id: 'oil', food: catalog.find(f => f.id === 'mvt:08.019')! as Food, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: '600', steps: [], favorite: false } };
it('keeps editable partial values separate from validation for eating and from default portions', () => {
  const value = portionFormSchema.parse({ quantities: { servings: '2,', g: '' }, unit: 'g', dateText: '2026-' });
  const review = openPortionReview(batch, [], { id: 'retained', value }, randomUUID);
  const legacyBatchId = 'legacy:' + 'x'.repeat(220); expect(portionDraftsSchema.parse({ [legacyBatchId]: { id: 'retained', value } })[legacyBatchId].value).toEqual(value);
  expect(review.value).toEqual(value); expect(review.id).toBe('retained');
  const reset = openPortionReview(batch, [], { id: 'retained', value: null }, randomUUID);
  expect(reset.id).not.toBe('retained'); expect(reset.baseId).toBe('retained'); expect(reset.value).toEqual({ quantities: { servings: '1', g: '' }, unit: 'servings' });
});
it('automatic Today follows midnight while an explicit date remains on its selected day', () => {
  const form = openPortionReview(batch, [], undefined, randomUUID).value;
  expect(portionDraftDate(form, new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06');
  expect(portionDraftDate(form, new Date(2026, 10, 7, 0, 1))).toBe('2026-11-07');
  expect(portionDraftDate({ ...form, dateText: '2026-11-06' }, new Date(2026, 10, 7, 0, 1))).toBe('2026-11-06');
  expect(portionDraftDate({ ...form, dateText: '' })).toBe('');
});
it('unit switches retain the date and preserve previous amounts when a conversion is unrepresentable', () => {
  const form = { quantities: { servings: '2', g: '' }, unit: 'servings' as const, dateText: '2026-11-07' };
  expect(switchPortionUnit(batch, form, 'g')).toEqual({ ...form, unit: 'g', quantities: { servings: '2', g: '200' } });
  const recurring = { ...batch, recipe: { ...batch.recipe, cookedWeightGrams: '1000' } };
  const blank = switchPortionUnit(recurring, { ...form, quantities: { servings: '1', g: '' } }, 'g');
  expect(blank.quantities.g).toBe(''); expect(switchPortionUnit(recurring, blank, 'servings').quantities.servings).toBe('1');
  expect(() => validatePortionDrafts({ missing: { id: 'x', value: form } }, [batch])).toThrow('missing');
});
