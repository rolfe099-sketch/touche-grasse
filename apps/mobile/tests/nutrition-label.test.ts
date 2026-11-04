import { expect, it } from 'vitest';
import { applyLabelColumn, labelDocumentSchema, LabelDocument, LabelForm, parseNutritionLabel, reviewedLabelFood, upgradeLabelForm } from '../src/domain/nutritionLabel';
import { labelTableCrop } from '../src/domain/labelCrop';
import realReading from './fixtures/label-reading.json';
import { foodNutrition } from '../src/domain/model';
const text = (text: string): LabelDocument => ({ text, engine: 'platform', blocks: [] });
export const label = 'Næringsinnhold per 100 g\nEnergi 1680 kJ / 400 kcal\nFett 20 g\nHvorav mettede fettsyrer 6,5 g\nKarbohydrat 30 g\nHvorav sukkerarter 2,5 g\nProtein 25 g\nKostfiber 5 g\nSalt 1,2 g';
export const emptyLabelForm = (): LabelForm => ({ id: 'label-food', name: 'Reviewed label', barcode: '7038010001918', basis: 'g', amount: '15', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } });
it('reads Norwegian and English label names, decimal commas and printed kcal without using sub-nutrients', () => {
  const result = parseNutritionLabel(text(label)); expect(result.columns).toHaveLength(1);
  expect(result.columns[0].nutrition).toEqual({ kcal: '400', protein: '25', carbohydrate: '30', fat: '20', fiber: '5' });
  const food = reviewedLabelFood(applyLabelColumn(emptyLabelForm(), result, 0));
  expect(food.provenance.source).toBe('confirmedOCR'); expect(food.provenance.labelScan?.originalNutrition.kcal).toBe('400');
  expect(foodNutrition(food, '15', 'g')).toEqual({ kcal: '60', protein: '3.75', carbohydrate: '4.5', fat: '3', fiber: '0.75' });
  expect(parseNutritionLabel(text('Nutrition per 100 g\nDietary fibre 6,5 g\nCarbohydrates 30 g\nFat 20 g\nProtein 25 g\nEnergy 400 kcal')).columns[0].nutrition.fiber).toBe('6.5');
});
it('keeps two columns separate and normalizes only explicitly measured serving weights', () => {
  const result = parseNutritionLabel(text('Per 100 g | Per portion 30 g\nEnergy 400 kcal | 120 kcal\nFat 20 g | 6 g\nCarbohydrate 30 g | 9 g\nProtein 25 g | 7,5 g\nFiber 5 g | 1,5 g'));
  expect(result.columns).toHaveLength(2); expect(result.columns[1].amount).toBe('30'); expect(result.columns[1].nutrition).toEqual(result.columns[0].nutrition);
  expect(() => reviewedLabelFood({ ...emptyLabelForm(), scan: result })).toThrow('Choose a label column');
  expect(parseNutritionLabel(text('Per serving\nEnergy 120 kcal\nFat 6 g')).columns).toEqual([]);
});
it('uses reported kJ and explicit mg without inferring energy, density, fiber or serving size', () => {
  const result = parseNutritionLabel(text('Nutrition per 100 ml\nEnergy 200 kJ\nProtein 3600 mg\nFat 0 g'));
  expect(result.columns[0].unit).toBe('ml'); expect(result.columns[0].nutrition.kcal).toBe('47.8011472275334608030592734225621414914');
  expect(result.columns[0].nutrition.protein).toBe('3.6'); expect(result.columns[0].nutrition.fiber).toBeNull(); expect(result.columns[0].nutrition.fat).toBe('0');
  const form = applyLabelColumn(emptyLabelForm(), result, 0); expect(form.amount).toBe('');
  const food = reviewedLabelFood(form); expect(() => foodNutrition(food, '10', 'g')).toThrow('conversion');
});
it.each(['9O g', '<0.5 g', '-5 g', '0 5 g', '180 g', '20 g 25%', '20 g | 6 g'])('leaves uncertain, implausible or unaligned values unknown: %s', value => {
  const column = parseNutritionLabel(text(`Per 100 g\nFat ${value}`)).columns[0]; expect(column.nutrition.fat).toBeNull(); expect(column.issues.fat).toBeTruthy();
});
it('does not quietly overwrite conflicting duplicate rows and never fills other nutrients from energy', () => {
  const column = parseNutritionLabel(text('Per 100 g\nEnergy 400 kcal\nFat 20 g\nFett 25 g')).columns[0];
  expect(column.nutrition.fat).toBeNull(); expect(column.issues.fat).toContain('Conflicting'); expect(column.nutrition.protein).toBeNull();
});
it('groups separate OCR cells by geometry and discards low-confidence numeric rows', () => {
  const blocks: LabelDocument['blocks'] = [ ['Per 100 g', 200, 0, 90], ['Fat', 0, 50, 99], ['20 g', 200, 50, 75], ['Protein', 0, 100, 95], ['25 g', 200, 100, 95] ].map(([s, x, y, confidence]) => ({ text: String(s) + '\n', confidence: Number(confidence), box: { x: Number(x), y: Number(y), width: 120, height: 25 } }));
  const column = parseNutritionLabel({ engine: 'tesseract', text: 'Per 100 g\nFat 20 g\nProtein 25 g', blocks }).columns[0];
  expect(column.nutrition.fat).toBeNull(); expect(column.nutrition.protein).toBe('25');
});
it('retains prepared alternatives explicitly and records corrections without replacing the source reading', () => {
  const scan = parseNutritionLabel(text('Per 100 g | Per 100 g prepared\nFat 20 g | 5 g\nEnergy 400 kcal | 100 kcal'));
  expect(scan.columns.map(c => c.prepared)).toEqual([false, true]);
  const form = applyLabelColumn(emptyLabelForm(), scan, 1); form.values.kcal = '101'; const food = reviewedLabelFood(form);
  expect(food.nutrition.kcal).toBe('101'); expect(food.provenance.labelScan?.originalNutrition.kcal).toBe('100'); expect(food.provenance.labelScan?.basis).toContain('prepared');
});
it('accepts an independently clear language reading without lowering the confidence threshold', () => {
  const primary = { ...text('Per 100 g\nFat 20g'), blocks: [{ text: 'Per 100 g', confidence: 95, box: null }, { text: 'Fat 20g', confidence: 67, box: null }] };
  const result = parseNutritionLabel({ ...primary, alternative: { text: 'Per 100 g\nFett 20g', blocks: [] } });
  expect(result.columns[0].nutrition.fat).toBe('20'); expect(result.columns[0].issues.fat).toBeUndefined();
});
it('does not select between two confident but conflicting language readings', () => {
  const result = parseNutritionLabel({ ...text('Per 100 g\nFat 20g'), alternative: { text: 'Per 100 g\nFett 25g', blocks: [] } });
  expect(result.columns[0].nutrition.fat).toBeNull(); expect(result.columns[0].issues.fat).toContain('Conflicting');
});
it('does not erase a bound or ambiguous column detected by the other reading', () => {
  for (const value of ['<0.5 g', '0.5 g | 0.1 g']) {
    const result = parseNutritionLabel({ ...text(`Per 100 g\nFat ${value}`), alternative: { text: 'Per 100 g\nFett 0.5 g', blocks: [] } });
    expect(result.columns[0].nutrition.fat).toBeNull();
  }
});
it('requires manual clarification when language passes disagree about the reference amount', () => {
  const result = parseNutritionLabel({ ...text('Per 100 g\nFat 20g'), alternative: { text: 'Per 100 ml\nFett 20g', blocks: [] } });
  expect(result.columns).toEqual([]); expect(result.notice).toContain('Reference amounts disagree');
});
it('resolves the captured real-engine unit-reading failure using an independently clear full-table reading', () => {
  const candidate = parseNutritionLabel(labelDocumentSchema.parse(realReading));
  expect(candidate.columns[0].nutrition).toEqual({ kcal: '400', protein: '25', carbohydrate: '30', fat: '20', fiber: '5' });
});
const separated = 'NÆRINGSINNHOLD PR. 100 g:\nEnergi\n2043 kJ/488 kcal\nFett\n23 g\nhvorav\n-mettede fettsyrer\n10 g\n-enumettede fettsyrer\n8,5 g\n-flerumettede fettsyrer\n3,1 g\nKarbohydrater\n63\nhvorav sukkerarter\n34\nKostfiber\nProtein\nSalt\n8';
it('pairs the reported separate heading/value rows without stealing sub-nutrients or numbers across headings', () => {
  const column = parseNutritionLabel(text(separated)).columns[0];
  expect(column.nutrition.kcal).toBe('488'); expect(column.nutrition.fat).toBe('23');
  expect(column.nutrition.carbohydrate).toBeNull(); expect(column.suggestions?.carbohydrate).toBe('63');
  expect(column.nutrition.protein).toBeNull(); expect(column.nutrition.fiber).toBeNull(); expect(column.suggestions?.protein).toBeUndefined();
});
it('uses units explicitly declared in a heading and preserves their stated energy order', () => {
  const column = parseNutritionLabel(text('Per 100 g\nEnergi (kJ/kcal)\n2043 / 488\nFett (g)\n23\nProtein\n8\ng')).columns[0];
  expect(column.nutrition.kcal).toBe('488'); expect(column.nutrition.fat).toBe('23'); expect(column.nutrition.protein).toBe('8');
});
it('repairs retained native scan drafts without replacing user corrections or inventing missing units', () => {
  const scan = parseNutritionLabel(text(separated)); delete scan.parserVersion;
  scan.columns[0].nutrition.kcal = null; scan.columns[0].nutrition.fat = null;
  const old = { ...emptyLabelForm(), scan, column: 0 }, upgraded = upgradeLabelForm(old);
  expect(upgraded.values.kcal).toBe('488'); expect(upgraded.values.fat).toBe('23'); expect(upgraded.values.carbohydrate).toBe('');
  expect(upgradeLabelForm({ ...old, values: { ...old.values, kcal: '487' } }).values.kcal).toBe('487');
  expect(upgradeLabelForm(upgraded)).toBe(upgraded);
});
it('includes all table columns in a bounded closer crop and skips an already full-frame table', () => {
  const blocks = [['Per 100 g', 300, 400, 500], ['Fett', 300, 500, 100], ['23 g', 900, 500, 100], ['Protein', 300, 700, 200], ['8 g', 1200, 700, 80]].map(([text, x, y, width]) => ({ text: String(text), box: { x: Number(x), y: Number(y), width: Number(width), height: 50 }, confidence: null }));
  const crop = labelTableCrop({ engine: 'platform', text: '', blocks }, { width: 2000, height: 3000 });
  expect(crop).not.toBeNull(); expect(crop!.originX).toBeLessThan(300); expect(crop!.originX + crop!.width).toBeGreaterThan(1280); expect(crop!.originY + crop!.height).toBeLessThanOrEqual(3000);
  expect(labelTableCrop({ engine: 'platform', text: '', blocks }, { width: 0, height: 0 })).toBeNull();
});
