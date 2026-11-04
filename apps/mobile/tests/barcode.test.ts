import { expect, it, vi } from 'vitest';
import { barcodeKey, BarcodeReviewValues, confirmBarcodeProduct, parseBarcodeProduct, sameBarcode, validRemoteBarcode } from '../src/domain/barcode';
import { BarcodeFetch, createBarcodeLookup } from '../src/domain/barcodeLookup';
import { foodNutrition } from '../src/domain/model';
import { milkCode, milkProduct } from './barcode-fixture';

const review = (): BarcodeReviewValues => ({ name: 'TINE Lettmelk', referenceUnit: 'ml', amount: '250', nutrition: { kcal: '37', protein: '3.6', carbohydrate: '4.7', fat: '0.5', fiber: '' } });
it('validates GTIN check digits and preserves equivalent leading-zero barcodes without changing legacy foods', () => {
  for (const code of [milkCode, '07038010001918', '3017620422003', '96385074', '034000470693']) expect(validRemoteBarcode(code)).toBe(true);
  for (const code of ['123', '1234567890123', '00000000', '7038010001919', '7038010001918x', '123456789']) expect(validRemoteBarcode(code)).toBe(false);
  expect(barcodeKey(' 0703 8010 001918 ')).toBe(milkCode);
  expect(sameBarcode('034000470693', '0034000470693')).toBe(true);
  expect(sameBarcode(milkCode, '7038010001642')).toBe(false);
  expect(sameBarcode('legacy-nondigits', milkCode)).toBe(false);
});
it('keeps explicit 100ml packaging values, Norwegian name and missing fiber without density assumptions', () => {
  const candidate = parseBarcodeProduct(milkProduct(), milkCode)!;
  expect(candidate.name).toBe('Lettmelk 0,5% fett'); expect(candidate.referenceUnit).toBe('ml');
  expect(candidate.nutrition).toEqual({ kcal: '37', protein: '3.6', carbohydrate: '4.7', fat: '0.5', fiber: null });
  const { food, amount } = confirmBarcodeProduct(candidate, review());
  expect(foodNutrition(food, amount, 'ml')).toEqual({ kcal: '92.5', protein: '9', carbohydrate: '11.75', fat: '1.25', fiber: null });
  expect(() => foodNutrition(food, '250', 'g')).toThrow('conversion');
  expect(food.provenance.labelReview?.originalNutrition).toEqual(candidate.nutrition); expect(food.provenance.license).toBe('ODbL-1.0');
});
it('uses one manufacturer or packaging as-sold set and rejects estimates, prepared and ambiguous reference amounts', () => {
  const payload = milkProduct(), original = payload.product.nutrition.input_sets[0];
  payload.product.nutrition.input_sets.unshift({ ...original, source: 'estimate', nutrients: { ...original.nutrients, 'energy-kcal': { value: 999, unit: 'kcal' } } });
  payload.product.nutrition.input_sets.unshift({ ...original, preparation: 'prepared', nutrients: { ...original.nutrients, 'energy-kcal': { value: 888, unit: 'kcal' } } });
  expect(parseBarcodeProduct(payload, milkCode)!.nutrition.kcal).toBe('37');
  payload.product.nutrition.input_sets = [{ ...original, per_unit: 'g' }];
  const unknown = parseBarcodeProduct(payload, milkCode)!; expect(unknown.referenceUnit).toBeNull(); expect(unknown.nutrition.kcal).toBeNull();
  expect(() => confirmBarcodeProduct(unknown, { ...review(), referenceUnit: null })).toThrow('Choose per 100');
  payload.product.nutrition.input_sets = [{ ...original, source: 'estimate' }]; expect(parseBarcodeProduct(payload, milkCode)!.nutrition.protein).toBeNull();
});
it('normalizes only measured serving amounts and reported nutrient units, including zero and kJ', () => {
  const payload = milkProduct(), set = payload.product.nutrition.input_sets[0];
  set.per = 'serving'; set.per_quantity = 250;
  set.nutrients = { 'energy-kcal': { value: 370, unit: 'kJ' }, proteins: { value: 9000, unit: 'mg' }, carbohydrates: { value: 0, unit: 'g' }, fat: { value: 1.25, unit: 'g' } };
  Object.assign(set.nutrients, { energy: { value: 418.4, unit: 'kJ' }, fiber: { value: '2e-1', unit: 'g' } });
  const candidate = parseBarcodeProduct(payload, milkCode)!;
  expect(candidate.nutrition).toEqual({ kcal: '40', protein: '3.6', carbohydrate: '0', fat: '0.5', fiber: '0.08' });
  expect(candidate.notes.join(' ')).toMatch(/250 ml/);
  set.per_quantity = 0; expect(parseBarcodeProduct(payload, milkCode)!.referenceUnit).toBeNull();
});
it('treats invalid, bounded and estimated text values as unknown and blocks implausible confirmed nutrition', () => {
  const payload = milkProduct(), set = payload.product.nutrition.input_sets[0];
  Object.assign(set.nutrients, { proteins: { value: '<0.5', unit: 'g' }, fat: { value: -1, unit: 'g' }, fiber: { value: '1e-9999999', unit: 'g' } });
  const candidate = parseBarcodeProduct(payload, milkCode)!;
  expect(candidate.nutrition.protein).toBeNull(); expect(candidate.nutrition.fat).toBeNull(); expect(candidate.nutrition.fiber).toBeNull();
  expect(() => confirmBarcodeProduct(candidate, { ...review(), referenceUnit: 'g', nutrition: { ...review().nutrition, protein: '80', carbohydrate: '80' } })).toThrow('exceed');
  expect(() => confirmBarcodeProduct(candidate, { ...review(), amount: '0' })).toThrow('greater than zero');
  expect(() => confirmBarcodeProduct(candidate, { ...review(), nutrition: { ...review().nutrition, kcal: 'abc' } })).toThrow('Check');
});
it('retains source lineage for label corrections without changing the downloaded candidate', () => {
  const candidate = parseBarcodeProduct(milkProduct(), milkCode)!, before = JSON.stringify(candidate);
  const values = { ...review(), nutrition: { ...review().nutrition, kcal: '38', fiber: '0' } };
  const { food } = confirmBarcodeProduct(candidate, values);
  expect(food.provenance.source).toBe('openFoodFacts'); expect(food.provenance.nutrientSources.kcal).toBe('User-confirmed package label');
  expect(food.provenance.labelReview?.originalNutrition.kcal).toBe('37'); expect(food.provenance.labelReview?.originalNutrition.fiber).toBeNull();
  expect(food.nutrition.fiber).toBe('0'); expect(JSON.stringify(candidate)).toBe(before);
  expect(parseBarcodeProduct({ status: 'failure', result: { id: 'product_not_found' } }, milkCode)).toBeNull();
  expect(() => parseBarcodeProduct(milkProduct(), '3017620422003')).toThrow('does not match');
  expect(() => parseBarcodeProduct({}, milkCode)).toThrow('unreadable');
});
it('keeps English aliases and uses a complete label set instead of an empty manufacturer record', () => {
  const payload = milkProduct(), packaging = payload.product.nutrition.input_sets[0];
  payload.product.nutrition.input_sets.unshift({ ...packaging, source: 'manufacturer', nutrients: {} as typeof packaging.nutrients });
  const candidate = parseBarcodeProduct(payload, milkCode)!; expect(candidate.nutrition.kcal).toBe('37'); expect(candidate.aliases).toContain('Low fat milk');
  expect(confirmBarcodeProduct(candidate, review()).food.aliases).toContain('Low fat milk');
});
it('requires an explicit choice when packaging supplies both g and ml and preserves the selected source values', () => {
  const payload = milkProduct(), ml = payload.product.nutrition.input_sets[0];
  payload.product.nutrition.input_sets.unshift({ ...ml, per: '100g', per_unit: 'g', nutrients: { ...ml.nutrients, 'energy-kcal': { value: 50, unit: 'kcal' } } });
  const candidate = parseBarcodeProduct(payload, milkCode)!;
  expect(candidate.referenceUnit).toBeNull(); expect(candidate.nutrition.kcal).toBeNull(); expect(candidate.profiles).toHaveLength(2);
  const { food } = confirmBarcodeProduct(candidate, review()); expect(food.referenceUnit).toBe('ml'); expect(food.nutrition.kcal).toBe('37'); expect(food.provenance.labelReview?.originalNutrition.kcal).toBe('37'); expect(food.provenance.labelReview?.originalReferenceUnit).toBe('ml');
  const grams = confirmBarcodeProduct(candidate, { ...review(), referenceUnit: 'g', nutrition: { ...review().nutrition, kcal: '50' } }).food;
  expect(grams.provenance.labelReview?.originalNutrition.kcal).toBe('50'); expect(grams.provenance.labelReview?.originalReferenceUnit).toBe('g');
});
it('looks up a limited field set, identifies the app, caches without aliasing, and never sends diary data', async () => {
  let at = Date.now(); const fetcher = vi.fn<BarcodeFetch>().mockImplementation(async () => new Response(JSON.stringify(milkProduct())));
  const lookup = createBarcodeLookup({ fetch: fetcher, native: true, now: () => at });
  const first = await lookup(milkCode); expect(first.kind).toBe('found');
  if (first.kind === 'found') first.candidate.name = 'changed';
  const cached = await lookup('07038010001918'); expect(fetcher).toHaveBeenCalledOnce();
  if (cached.kind === 'found') expect(cached.candidate.name).not.toBe('changed');
  const [url, options] = fetcher.mock.calls[0]; expect(String(url)).toContain('/api/v3.6/product/'+milkCode); expect(String(url)).toContain('fields=');
  expect(options?.headers).toMatchObject({ 'User-Agent': expect.stringContaining('ToucheGrasse/') }); expect(options?.credentials).toBe('omit'); expect(options?.body).toBeUndefined();
  at += 16 * 60000; await lookup(milkCode); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('handles missing records, malformed responses, offline, rate limits and invalid input without invented products', async () => {
  const missing = vi.fn<BarcodeFetch>().mockResolvedValue(new Response(JSON.stringify({ status: 'failure', result: { id: 'product_not_found' } }), { status: 404 }));
  const lookup = createBarcodeLookup({ fetch: missing }); expect(await lookup(milkCode)).toEqual({ kind: 'missing' }); expect(await lookup(milkCode)).toEqual({ kind: 'missing' }); expect(missing).toHaveBeenCalledOnce();
  await expect(lookup('1234567890123')).rejects.toThrow('check digit'); expect(missing).toHaveBeenCalledOnce();
  await expect(createBarcodeLookup({ fetch: vi.fn().mockRejectedValue(new TypeError('offline')) })(milkCode)).rejects.toThrow('Saved products work offline');
  await expect(createBarcodeLookup({ fetch: vi.fn().mockResolvedValue(new Response('not JSON')) })(milkCode)).rejects.toThrow('unreadable');
  await expect(createBarcodeLookup({ fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 503 })) })(milkCode)).rejects.toThrow('unavailable');
  const limited = vi.fn<BarcodeFetch>().mockResolvedValue(new Response('{}', { status: 429 })), throttled = createBarcodeLookup({ fetch: limited });
  await expect(throttled(milkCode)).rejects.toThrow('Wait a minute'); await expect(throttled(milkCode)).rejects.toThrow('Wait a minute'); expect(limited).toHaveBeenCalledOnce();
});
it('cancels stalled and late responses without caching them, and times out an unresponsive request', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<BarcodeFetch>().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(async () => new Response(JSON.stringify(milkProduct())));
  const lookup = createBarcodeLookup({ fetch: fetcher }), controller = new AbortController(); const pending = lookup(milkCode, controller.signal); controller.abort();
  finish(new Response(JSON.stringify(milkProduct()))); await expect(pending).rejects.toThrow('cancelled'); await lookup(milkCode); expect(fetcher).toHaveBeenCalledTimes(2);
  const never = vi.fn<BarcodeFetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
  await expect(createBarcodeLookup({ fetch: never, timeoutMs: 10 })(milkCode)).rejects.toThrow('timed out');
});
