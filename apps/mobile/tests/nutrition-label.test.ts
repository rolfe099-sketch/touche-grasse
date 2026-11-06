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
it('keeps mixed paragraph and positioned observations in reading order for a fresh scan', () => {
  const lines = ['Per 100 g', 'Energi', '2043 kJ/488 kcal', 'Fett', '23\ng', 'Karbohydrat 63 g', 'Protein 8 g', 'Kostfiber 0 g'];
  const blocks = lines.map((text, i) => ({ text, confidence: null, box: i === 2 ? null : { x: 10, y: i * 100, width: 500, height: text.includes('\n') ? 70 : 30 } }));
  const candidate = parseNutritionLabel({ engine: 'platform', text: lines.join('\n'), blocks });
  expect(candidate.columns[0].nutrition).toEqual({ kcal: '488', fat: '23', carbohydrate: '63', protein: '8', fiber: '0' });
});
it.each([false, true])('prefers printed kcal when another pass only retains the identical printed kJ (reversed: %s)', reversed => {
  const complete = 'Per 100 g\nEnergi 2043 kJ/488 kcal\nFett 23 g', partial = 'Per 100 g\nEnergi 2043 kJ\nFett 23 g';
  const candidate = parseNutritionLabel({ ...text(reversed ? partial : complete), alternative: { text: reversed ? complete : partial, blocks: [] } });
  expect(candidate.columns[0].nutrition.kcal).toBe('488');
  expect(candidate.columns[0].nutrition.fat).toBe('23');
});
it('does not reconcile genuinely different kJ or printed kcal readings as rounding', () => {
  for (const alternative of ['Energi 2044 kJ', 'Energi 2043 kJ/489 kcal']) {
    const candidate = parseNutritionLabel({ ...text('Per 100 g\nEnergi 2043 kJ/488 kcal'), alternative: { text: 'Per 100 g\n' + alternative, blocks: [] } });
    expect(candidate.columns[0].nutrition.kcal).toBeNull();
    expect(candidate.columns[0].issues.kcal).toContain('Conflicting');
  }
});
it('offers explicit unit confirmation for the reported Dr and absent-unit readings without filling nutrition', () => {
  const scan = parseNutritionLabel(text('Per 100 g\nProtein 5,6 Dr\nKostfiber 3,2'));
  const column = scan.columns[0];
  expect(column.nutrition.protein).toBeNull(); expect(column.nutrition.fiber).toBeNull(); expect(column.nutrition.kcal).toBeNull();
  expect(column.suggestions).toEqual({ protein: '5.6', fiber: '3.2' });
  const form = applyLabelColumn(emptyLabelForm(), scan, 0);
  expect(form.values.protein).toBe(''); expect(form.values.fiber).toBe('');
  const reviewed = reviewedLabelFood({ ...form, values: { ...form.values, protein: column.suggestions!.protein, fiber: column.suggestions!.fiber } });
  expect(reviewed.nutrition.protein).toBe('5.6'); expect(reviewed.nutrition.fiber).toBe('3.2'); expect(reviewed.nutrition.kcal).toBeNull();
  expect(reviewed.provenance.labelScan!.originalNutrition.protein).toBeNull(); expect(reviewed.provenance.nutrientSources.protein).toBe('User-confirmed label value');
});
it('retains exact normalized confirmation values from a measured serving without requiring rounded manual input', () => {
  const scan = parseNutritionLabel(text('Per portion 30 g\nProtein 5,6 Dr'));
  const form = applyLabelColumn(emptyLabelForm(), scan, 0), confirmed = scan.columns[0].suggestions!.protein;
  expect(confirmed.length).toBeGreaterThan(10);
  const reviewed = reviewedLabelFood({ ...form, values: { ...form.values, protein: confirmed } });
  expect(reviewed.nutrition.protein).toBe(confirmed); expect(reviewed.provenance.nutrientSources.protein).toBe('User-confirmed label value');
});
it.each(['5.6 ml', '5.6 kg', '<5.6 Dr', '5O Dr', '5.6 6.7 Dr'])('does not suggest grams for incompatible units or unclear numbers: %s', value => {
  const column = parseNutritionLabel(text('Per 100 g\nProtein ' + value)).columns[0];
  expect(column.nutrition.protein).toBeNull(); expect(column.suggestions?.protein).toBeUndefined();
});
it('blocks conflicting confirmation candidates and can offer a candidate from a clearer second reading', () => {
  const conflict = parseNutritionLabel({ ...text('Per 100 g\nProtein 5,6 Dr'), alternative: { text: 'Per 100 g\nProtein 6,5 Dr', blocks: [] } }).columns[0];
  expect(conflict.suggestions?.protein).toBeUndefined(); expect(conflict.issues.protein).toContain('Conflicting');
  const partial = parseNutritionLabel({ ...text('Per 100 g\nProtein'), alternative: { text: 'Per 100 g\nProtein 5,6 Dr', blocks: [] } }).columns[0];
  expect(partial.nutrition.protein).toBeNull(); expect(partial.suggestions?.protein).toBe('5.6'); expect(partial.evidence.protein).toContain('5,6 Dr');
});
it('recovers a labeled energy reading swallowed into a geometric header row without guessing other nutrients', () => {
  const lines = ['Per 100 g', 'energi 2043 kJ/488 kcal', 'Fett 23 g', 'Protein 5,6 Dr', 'Kostfiber 3,2'];
  const blocks = lines.map((text, i) => ({ text, confidence: null, box: { x: 10, y: i < 2 ? i * 5 : i * 100, width: 500, height: 30 } }));
  const column = parseNutritionLabel({ engine: 'platform', text: lines.join('\n'), blocks }).columns[0];
  expect(column.nutrition.kcal).toBe('488'); expect(column.evidence.kcal).toBe('energi 2043 kJ/488 kcal');
  expect(column.nutrition.protein).toBeNull(); expect(column.nutrition.fiber).toBeNull();
  expect(column.suggestions).toEqual({ protein: '5.6', fiber: '3.2' });
});
it('does not use text recovery to override energy conflicts, changed reference amounts or weak browser readings', () => {
  const block = (text: string, i: number, confidence: number | null = null) => ({ text, confidence, box: { x: 0, y: i * 100, width: 500, height: 30 } });
  const conflicting = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergi 488 kcal', blocks: ['Per 100 g', 'Energi 488 kcal', 'Energi 489 kcal'].map((s, i) => block(s, i)) }).columns[0];
  expect(conflicting.nutrition.kcal).toBeNull(); expect(conflicting.issues.kcal).toContain('Conflicting');
  const changed = parseNutritionLabel({ engine: 'platform', text: 'Per 100 ml\nEnergi 488 kcal', blocks: [block('Per 100 g irrelevant energi 488 kcal', 0)] }).columns[0];
  expect(changed.nutrition.kcal).toBeNull();
  const weak = parseNutritionLabel({ engine: 'tesseract', text: 'Per 100 g\nEnergi 488 kcal', blocks: [block('Per 100 g', 0, 95), block('Energi 488 kcal', 1, 50)] }).columns[0];
  expect(weak.nutrition.kcal).toBeNull();
  const weakNative = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergi 488 kcal', blocks: [block('Per 100 g irrelevant energi 488 kcal', 0, 50)] }).columns[0];
  expect(weakNative.nutrition.kcal).toBeNull();
});
it('repairs the current unfinished v2 readout on reload without another photo or overwriting corrections', () => {
  const scan = parseNutritionLabel(text('Per 100 g\nenergi 2043 kJ/488 kcal\nProtein 5,6 Dr\nKostfiber 3,2'));
  scan.parserVersion = 2; scan.columns[0].nutrition.kcal = null; delete scan.columns[0].evidence.kcal; delete scan.columns[0].suggestions!.protein;
  const before = { ...emptyLabelForm(), scan, column: 0 }, upgraded = upgradeLabelForm(before);
  expect(upgraded.values.kcal).toBe('488'); expect(upgraded.values.protein).toBe(''); expect(upgraded.values.fiber).toBe('');
  expect(upgraded.scan!.columns[0].suggestions!.protein).toBe('5.6'); expect(upgraded.scan!.columns[0].suggestions!.fiber).toBe('3.2');
  expect(upgraded.scan!.text).toBe(scan.text); expect(upgraded.scan!.scannedAt).toBe(scan.scannedAt);
  expect(upgradeLabelForm({ ...before, values: { ...before.values, kcal: '487', protein: '5.7' } }).values).toMatchObject({ kcal: '487', protein: '5.7' });
  expect(upgradeLabelForm(upgraded)).toBe(upgraded);
});
it('does not replace rejected energy or fill other macros while upgrading a v2 review', () => {
  const scan = parseNutritionLabel(text('Per 100 g\nEnergy 488 kcal\nProtein 5.6 g')); scan.parserVersion = 2;
  scan.columns[0].nutrition.kcal = null; scan.columns[0].issues.kcal = 'Conflicting readings'; scan.columns[0].nutrition.protein = null;
  const next = upgradeLabelForm({ ...emptyLabelForm(), scan, column: 0 });
  expect(next.values.kcal).toBe(''); expect(next.values.protein).toBe(''); expect(next.scan!.columns[0].issues.kcal).toBe('Conflicting readings');
});
