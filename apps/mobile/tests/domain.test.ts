import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import catalogJSON from '../src/data/catalog.json';
import { D, display, duplicateRecipe, Food, foodNutrition, parseAmount, parseEntry, Recipe, recipePortion, recipeTotal, total, validateFood } from '../src/domain/model';
import { FoodIndex, normalize } from '../src/domain/search';
import { pestoSubtotal } from './pesto-fixture';
const catalog = catalogJSON as Food[];
const oil = catalog.find(f => f.id === 'mvt:08.019')!;
const testFood = (): Food => ({ id: 'test:synthetic', name: 'Synthetic test chicken', aliases: [], referenceUnit: 'g', nutrition: { kcal: '120', protein: '24', carbohydrate: '0', fat: '2' }, gramsPerMeasure: {}, provenance: { source: 'manual', sourceID: 'test', retrievedAt: '2026-10-22', nutrientSources: {} } });
const recipe = (): Recipe => ({ id: randomUUID(), name: 'Synthetic arithmetic fixture', ingredients: [{ id: randomUUID(), food: testFood(), quantity: '1200', unit: 'g' }], steps: ['Cook'], servings: '6', cookedWeightGrams: null, favorite: false });

describe('preserved decimal/domain behavior', () => {
  it('uses real source records for the pesto meal-prep subtotal and preserves other amounts on edit', () => {
    const r = pestoSubtotal();
    expect(recipeTotal(r).kcal).toBe('4710.65');
    expect(new D(recipePortion(r).kcal!).toDecimalPlaces(2).toFixed()).toBe('785.11');
    const before = r.ingredients.map(i => i.quantity);
    r.ingredients[2].quantity = '150';
    expect(new D(recipeTotal(r).kcal!).minus('4710.65').toFixed()).toBe('51.7');
    expect(r.ingredients.filter((_, i) => i !== 2).map(i => i.quantity)).toEqual(before.filter((_, i) => i !== 2));
    expect(() => recipePortion(r, '300', 'g')).toThrow();
  });
  it('accepts Norwegian decimals without parsing malformed inputs', () => {
    expect(parseAmount(' 15,5 ')).toBe('15.5');
    for (const value of ['', '-1', '1e3', '1,2,3', '1.2.3', '10 g', 'NaN']) expect(parseAmount(value)).toBeNull();
  });
  it('scales without binary floating-point error', () => {
    expect(foodNutrition(testFood(), '250.5', 'g').protein).toBe('60.12');
    expect(new D('0.1').plus('0.2').toFixed()).toBe('0.3');
  });
  it('equates grams and kilograms', () => expect(foodNutrition(testFood(), '1200', 'g')).toEqual(foodNutrition(testFood(), '1.2', 'kg')));
  it('propagates unknowns independently', () => {
    expect(total([{ kcal: '100', protein: null, carbohydrate: '5', fat: '2' }, { kcal: '20', protein: '5', carbohydrate: '0', fat: '0' }])).toEqual({ kcal: '120', protein: null, carbohydrate: '5', fat: '2', fiber: null });
    expect(total([]).kcal).toBe('0');
  });
  it('does not silently convert volume or household measures to grams', () => {
    expect(() => foodNutrition(oil, '10', 'ml')).toThrow('conversion'); expect(() => foodNutrition(oil, '1', 'tbsp')).toThrow('conversion');
    const explicit = { ...oil, gramsPerMilliliter: '0.91', gramsPerMeasure: { tbsp: '13.65' } };
    expect(foodNutrition(explicit, '10', 'ml').fat).toBe('9.009'); expect(foodNutrition(explicit, '1', 'tbsp').fat).toBe('13.5135');
  });
  it('supports per-100ml without relabeling it as grams', () => {
    const drink: Food = { ...testFood(), referenceUnit: 'ml' };
    expect(foodNutrition(drink, '1', 'l').kcal).toBe('1200'); expect(() => foodNutrition(drink, '100', 'g')).toThrow();
  });
  it('rejects invalid quantity and contradictory nutrition', () => {
    for (const value of ['0', '-1', 'NaN', 'Infinity', '1000001']) expect(() => foodNutrition(oil, value, 'g')).toThrow();
    expect(() => validateFood({ ...testFood(), nutrition: { kcal: '1200', protein: '60', carbohydrate: '60', fat: '0' } })).toThrow();
  });
  it('keeps batch energy fixed when cooked water is lost', () => {
    const r = recipe(); expect(recipeTotal(r).kcal).toBe('1440'); expect(recipePortion(r).kcal).toBe('240');
    expect(() => recipePortion(r, '150', 'g')).toThrow(); r.cookedWeightGrams = '900';
    expect(recipePortion(r, '150', 'g').kcal).toBe('240'); expect(recipeTotal(r).kcal).toBe('1440');
  });
  it('rejects zero servings and duplicates independently', () => {
    const r = recipe(), duplicate = duplicateRecipe(r, randomUUID);
    duplicate.ingredients[0].quantity = '1500'; expect(r.ingredients[0].quantity).toBe('1200');
    expect(r.id).not.toBe(duplicate.id); expect(r.ingredients[0].id).not.toBe(duplicate.ingredients[0].id);
    expect(() => recipePortion({ ...r, servings: '0' })).toThrow();
  });
  it('parses a real structured entry without guessing food identity', () => {
    const lines = parseEntry('200g kylling, 100g pasta, 15,5g pesto, 10g olivenolje', randomUUID);
    expect(lines).toHaveLength(4); expect(lines[2].quantityText).toBe('15,5'); expect(lines.every(l => l.food === null)).toBe(true);
    const corrected = { ...lines[0], food: testFood(), quantityText: '250' };
    expect(corrected.id).toBe(lines[0].id); expect(lines[1].quantityText).toBe('100');
    expect(parseEntry('et stort eple', randomUUID)[0].quantityText).toBe('');
  });
  it('formats English UI numbers only at the display boundary', () => { expect(display('60.125', 1)).toBe('60.1'); expect(display('1200')).toBe('1,200'); expect(display(null)).toBe('–'); });
});

describe('real catalog and shared search index', () => {
  const index = new FoodIndex(); catalog.forEach(food => index.add(food));
  it('preserves all source data except numeric-to-decimal-string representation', () => {
    const original = JSON.parse(readFileSync('../../Packages/ToucheGrasseCore/Sources/ToucheGrasseCore/Resources/catalog.json', 'utf8'));
    expect(catalog).toHaveLength(2121); expect(new Set(catalog.map(f => f.id)).size).toBe(2121);
    for (let i = 0; i < catalog.length; i++) {
      validateFood(catalog[i]);
      expect(catalog[i].name).toBe(original[i].name); expect(catalog[i].aliases).toEqual(original[i].aliases);
      const { fiber: fiberSource, ...originalSources } = catalog[i].provenance.nutrientSources;
      expect({ ...catalog[i].provenance, nutrientSources: originalSources }).toEqual(original[i].provenance);
      expect(typeof fiberSource).toBe('string');
      for (const key of ['kcal', 'protein', 'carbohydrate', 'fat'] as const) {
        if (original[i].nutrition[key] === null) expect(catalog[i].nutrition[key]).toBeNull();
        else expect(new D(catalog[i].nutrition[key]!).eq(String(original[i].nutrition[key]))).toBe(true);
      }
    }
  });
  it('finds exact Norwegian and English source aliases first', () => {
    expect(index.search('olivenolje')[0].id).toBe(oil.id);
    expect(index.search(oil.aliases[0])[0].id).toBe(oil.id);
  });
  it('supports diacritics, typo and compound variants with all-term relevance', () => {
    expect(normalize('Crème fraîche / Ørret')).toBe('creme fraiche orret');
    expect(index.search('olivenoje').some(f => f.id === oil.id)).toBe(true);
    expect(index.search('kylling spaceships')).toHaveLength(0);
    expect(index.search('kyllingfilet').length).toBeGreaterThan(0);
  });
  it('ranks saved relevant food but not unrelated saved food', () => {
    const personal: Food = { ...testFood(), id: 'mine:pesto', name: 'Pesto til pasta' };
    index.setPersonal([personal], []);
    expect(index.search('pesto')[0].id).toBe(personal.id); expect(index.search('olivenolje')[0].id).toBe(oil.id);
  });
  it('invalidates cached names after a correction', () => {
    const personal = { ...testFood(), id: 'mine:alias', name: 'My sauce', aliases: ['hemlig'] };
    index.setPersonal([personal], []); expect(index.search('hemlig')[0].id).toBe(personal.id);
    index.setPersonal([{ ...personal, aliases: ['nyttnavn'] }], []);
    expect(index.search('hemlig')).toHaveLength(0); expect(index.search('nyttnavn')[0].id).toBe(personal.id);
  });
  it('reports measured search costs without asserting iPhone timing', () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) index.search(['kylling', 'olivenolje', 'pasta', 'olivenoje'][i % 4]);
    console.log(`Node shared-index average, 1000 mixed warm queries: ${((performance.now() - start) / 1000).toFixed(3)} ms; not an iPhone result`);
  });
});
