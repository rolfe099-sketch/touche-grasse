import { expect, it } from 'vitest';
import { applyLabelColumn, canMergeLabelColumn, LabelForm, labelFormSchema, mergeLabelColumn, parseNutritionLabel, receiveLabelScan, reviewedLabelFood } from '../src/domain/nutritionLabel';

const scan = (text: string) => parseNutritionLabel({ engine: 'platform', text, blocks: [] });
const empty = (): LabelForm => ({ id: 'food', name: 'Test food', barcode: '', basis: 'g', amount: '15', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } });
it('stages rescans without changing readings, manual corrections, unknowns, amount or identity', () => {
  const original = applyLabelColumn(empty(), scan('Per 100 g\nEnergy 400 kcal\nFat 20 g\nProtein 25 g'), 0);
  const form: LabelForm = { ...original, values: { ...original.values, fat: '23', protein: '' }, edited: ['fat', 'protein'] };
  const candidate = scan('Per 100 g\nEnergy 488 kcal\nFat 24 g\nProtein 5.6 g\nFiber 3.2 g');
  const pending = receiveLabelScan(form, candidate); expect(pending.values).toEqual(form.values); expect(pending.scan).toEqual(original.scan);
  expect(pending.rescan).toEqual(candidate); expect(labelFormSchema.parse(pending)).toEqual(pending);
  const merged = mergeLabelColumn(pending, candidate, 0);
  expect(merged.values).toEqual({ kcal: '400', fat: '23', protein: '', carbohydrate: '', fiber: '3.2' });
  expect(merged.amount).toBe('15'); expect(merged.id).toBe('food'); expect(merged.rescan).toBeUndefined();
  const food = reviewedLabelFood(merged);
  expect(food.nutrition.protein).toBeNull(); expect(food.provenance.nutrientSources.fat).toBe('User-confirmed label value');
  expect(food.provenance.labelScan?.originalNutrition.kcal).toBe('488');
});
it('does not erase a good scan when the next photo has no usable reference column', () => {
  const form = receiveLabelScan(empty(), scan('Per 100 g\nEnergy 488 kcal\nFat 23 g'));
  const pending = receiveLabelScan(form, scan('unreadable'));
  expect(pending.values).toEqual(form.values); expect(pending.scan).toEqual(form.scan);
  expect(() => mergeLabelColumn(pending, pending.rescan!, 0)).toThrow('Different units');
});
it('requires explicit replacement for grams vs millilitres and raw vs prepared columns', () => {
  const form = receiveLabelScan(empty(), scan('Per 100 g\nEnergy 400 kcal'));
  for (const candidate of [scan('Per 100 ml\nEnergy 200 kcal'), { ...form.scan!, columns: [{ ...form.scan!.columns[0], prepared: true }] }]) {
    expect(canMergeLabelColumn(form, candidate, 0)).toBe(false);
    expect(() => mergeLabelColumn(form, candidate, 0)).toThrow('Different units');
  }
  const replaced = applyLabelColumn(form, scan('Per 100 ml\nEnergy 200 kcal'), 0);
  expect(replaced.basis).toBe('ml'); expect(replaced.amount).toBe(''); expect(replaced.values.fat).toBe('');
});
it('preserves manually entered records on the first photo and preserves explicit zero', () => {
  const form = empty(); form.values.fat = '0';
  const candidate = scan('Per 100 g\nEnergy 488 kcal\nFat 23 g');
  const pending = receiveLabelScan(form, candidate); expect(pending.rescan).toEqual(candidate); expect(pending.values.fat).toBe('0');
  expect(mergeLabelColumn(pending, candidate, 0).values.fat).toBe('0');
});
