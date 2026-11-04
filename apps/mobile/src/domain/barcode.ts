import { z } from 'zod';
import { D, Food, Nutrition, nutrients, nutritionSchema, parseAmount, positive, validateFood } from './model';

export function barcodeKey(value: string): string {
  const code = value.trim().replace(/[\s-]/g, '');
  if (!/^\d{8,14}$/.test(code)) throw new Error('Enter an 8–14 digit barcode.');
  const digits = code.replace(/^0+/, '') || '0';
  return digits.padStart(digits.length <= 8 ? 8 : 13, '0');
}
export function sameBarcode(a: string, b: string): boolean {
  try { return barcodeKey(a) === barcodeKey(b); } catch { return false; }
}
export function validRemoteBarcode(value: string): boolean {
  const code = value.trim().replace(/[\s-]/g, '');
  if (![8, 12, 13, 14].includes(code.length) || !/^\d+$/.test(code) || /^0+$/.test(code)) return false;
  const sum = [...code.slice(0, -1)].reverse().reduce((n, digit, i) => n + Number(digit) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(code.at(-1));
}
const profileSchema = z.object({ nutrition: nutritionSchema, referenceUnit: z.enum(['g', 'ml']), nutritionSource: z.string().max(200), notes: z.array(z.string().max(300)).max(12) });
export const barcodeCandidateSchema = z.object({
  barcode: z.string(), name: z.string().max(300), brand: z.string().max(300), quantity: z.string().max(100),
  aliases: z.array(z.string().max(200)).max(5).default([]),
  nutrition: nutritionSchema, referenceUnit: z.enum(['g', 'ml']).nullable(),
  nutritionSource: z.string().max(200), retrievedAt: z.iso.datetime(), sourceURL: z.string(),
  notes: z.array(z.string().max(300)).max(12),
  profiles: z.array(profileSchema).max(2).default([]),
});
export type BarcodeCandidate = z.infer<typeof barcodeCandidateSchema>;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, length: number) => typeof value === 'string' ? value.trim().slice(0, length) : '';
function number(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const input = String(value);
  if (input.length > 100 || !/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(input)) return null;
  if (/e/i.test(input) && Math.abs(Number(input.split(/e/i)[1])) > 12) return null;
  try { const n = new D(input); return n.isFinite() && n.gte(0) && n.lte(1000000) ? n.toFixed() : null; } catch { return null; }
}
// Import one explicit manufacturer/packaging set. Aggregated, estimated and
// prepared values must never silently enter an as-sold product record.
export function parseBarcodeProduct(payload: unknown, requested: string, at = new Date()): BarcodeCandidate | null {
  const body = object(payload), product = object(body.product);
  if (object(body.result).id === 'product_not_found' || body.status === 0) return null;
  if (!Object.keys(product).length) throw new Error('The product service returned an unreadable record.');
  if (!sameBarcode(String(product.code ?? body.code ?? ''), requested)) throw new Error('The returned barcode does not match. Check the package.');
  const barcode = barcodeKey(requested), nutrition = object(product.nutrition);
  const sets = Array.isArray(nutrition.input_sets) ? nutrition.input_sets.slice(0, 100).map(object) : [];
  const allowed = sets.filter(set => ['manufacturer', 'packaging'].includes(String(set.source)) && set.preparation === 'as_sold');
  const basis = (set: Record<string, unknown>): { unit: 'g' | 'ml'; quantity: string } | null => {
    if (set.per === '100g' || set.per === '100ml') {
      const unit = set.per === '100g' ? 'g' : 'ml';
      if ((set.per_unit != null && set.per_unit !== unit) || (set.per_quantity != null && number(set.per_quantity) !== '100')) return null;
      return { unit, quantity: '100' };
    }
    const quantity = number(set.per_quantity);
    return set.per === 'serving' && quantity && new D(quantity).gt(0) && (set.per_unit === 'g' || set.per_unit === 'ml') ? { unit: set.per_unit, quantity } : null;
  };
  const completeness = (item: Record<string, unknown>) => {
    const entries = object(item.nutrients), known = (key: string, units: string[]) => { const nutrient = object(entries[key]); return number(nutrient.value) !== null && units.includes(String(nutrient.unit)); };
    return Number(known('energy-kcal', ['kcal']) || known('energy-kj', ['kJ']) || known('energy', ['kJ'])) + ['proteins', 'carbohydrates', 'fat', 'fiber'].filter(key => known(key, ['g', 'mg', 'µg', 'μg', 'ug'])).length;
  };
  const ranked = allowed.filter(item => basis(item)).sort((a, b) => completeness(b) - completeness(a) || Number(b.source === 'manufacturer') - Number(a.source === 'manufacturer') || Number(b.last_updated_t ?? 0) - Number(a.last_updated_t ?? 0));
  function profile(set: Record<string, unknown>) {
  const reference = basis(set)!, values = object(set.nutrients), notes: string[] = [];
  const read = (key: string, unit: string): string | null => {
    const item = object(values[key]), n = number(item.value);
    if (n === null) return null;
    const factor = item.unit === unit ? '1' : unit === 'g' && item.unit === 'mg' ? '0.001' : unit === 'g' && ['µg', 'μg', 'ug'].includes(String(item.unit)) ? '0.000001' : null;
    return factor && reference ? new D(n).times(factor).times(100).div(reference.quantity).toFixed() : null;
  };
  let kcal = read('energy-kcal', 'kcal');
  if (kcal === null) {
    const kj = read('energy-kj', 'kJ') ?? read('energy', 'kJ');
    if (kj !== null) { kcal = new D(kj).div('4.184').toFixed(); notes.push('Energy converted from the reported kJ value.'); }
  }
  const sourceNutrition: Nutrition = { kcal, protein: read('proteins', 'g'), carbohydrate: read('carbohydrates', 'g'), fat: read('fat', 'g'), fiber: read('fiber', 'g') };
  if (reference.quantity !== '100') notes.push(`Converted from a measured ${reference.quantity} ${reference.unit} serving to 100 ${reference.unit}.`);
  if (nutrients.some(key => sourceNutrition[key] == null)) notes.push('Blank values are unknown, not zero.');
  return profileSchema.parse({ nutrition: sourceNutrition, referenceUnit: reference.unit, nutritionSource: `${set.source} · as sold · ${reference.quantity} ${reference.unit}`, notes });
  }
  const profiles = (['g', 'ml'] as const).flatMap(unit => { const set = ranked.find(item => basis(item)?.unit === unit); return set ? [profile(set)] : []; });
  const selected = profiles.length === 1 ? profiles[0] : null;
  const empty: Nutrition = { kcal: null, protein: null, carbohydrate: null, fat: null, fiber: null };
  const name = text(product.product_name_nb, 300) || text(product.product_name_en, 300) || text(product.product_name, 300);
  const aliases = [...new Set([product.product_name_nb, product.product_name_en, product.product_name, product.brands].map(value => text(value, 200)).filter(value => value && value !== name))];
  return barcodeCandidateSchema.parse({ barcode, name, aliases, profiles, brand: text(product.brands, 300), quantity: text(product.quantity, 100), nutrition: selected?.nutrition ?? empty,
    referenceUnit: selected?.referenceUnit ?? null, nutritionSource: selected?.nutritionSource ?? 'No single label basis selected',
    retrievedAt: at.toISOString(), sourceURL: `https://world.openfoodfacts.org/product/${barcode}`, notes: selected?.notes ?? [profiles.length > 1 ? 'Choose the g/ml basis printed on your package to load its label values.' : 'No supported as-sold label values. Enter the package values and choose g or ml.'] });
}
export type BarcodeReviewValues = { name: string; referenceUnit: 'g' | 'ml' | null; nutrition: Record<typeof nutrients[number], string>; amount: string };
export function confirmBarcodeProduct(candidate: BarcodeCandidate, values: BarcodeReviewValues, at = new Date()): { food: Food; amount: string } {
  const parsed = barcodeCandidateSchema.parse(candidate), profile = parsed.profiles.find(item => item.referenceUnit === values.referenceUnit);
  const original = profile ? { ...parsed, ...profile } : parsed;
  if (!values.name.trim()) throw new Error('Enter the product name from the package.');
  if (!values.referenceUnit) throw new Error('Choose per 100 g or per 100 ml from the package.');
  const amount = parseAmount(values.amount); if (!amount) throw new Error('Check the amount to add.'); positive(amount);
  const nutrition = Object.fromEntries(nutrients.map(key => {
    const input = values.nutrition[key].trim(), parsed = input ? input === original.nutrition[key] ? input : parseAmount(input) : null;
    if (input && parsed === null) throw new Error('Check the nutrition values. Leave unknown values blank.');
    return [key, parsed];
  })) as Nutrition;
  if (!nutrients.some(key => nutrition[key] != null)) throw new Error('Enter at least one nutrition value from the label.');
  const food = validateFood({ id: `off:${original.barcode}`, name: values.name, aliases: original.aliases, barcode: original.barcode,
    referenceUnit: values.referenceUnit, nutrition, gramsPerMeasure: {}, provenance: { source: 'openFoodFacts', sourceID: original.barcode, sourceURL: original.sourceURL,
      retrievedAt: original.retrievedAt, license: 'ODbL-1.0',
      labelReview: { confirmedAt: at.toISOString(), originalName: original.name, originalNutrition: original.nutrition, originalReferenceUnit: original.referenceUnit, nutritionSource: original.nutritionSource },
      nutrientSources: Object.fromEntries(nutrients.filter(key => nutrition[key] != null).map(key => [key, values.referenceUnit === original.referenceUnit && nutrition[key] === original.nutrition[key] ? `Open Food Facts · ${original.nutritionSource} · label reviewed` : 'User-confirmed package label'])) } });
  return { food, amount };
}
