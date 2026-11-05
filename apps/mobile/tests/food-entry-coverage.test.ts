import { expect, it } from 'vitest';
import catalog from '../src/data/catalog.json';
import { Food } from '../src/domain/model';
import { FoodIndex } from '../src/domain/search';
import { matchIngredient, emptyPreferences } from '../src/domain/quickEntry';
import { parseNutritionLabel } from '../src/domain/nutritionLabel';
const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));

it.each([
  ['cod', 'torsk'], ['haddock', 'hyse'], ['oatmeal', 'havregryn'], ['chickpeas', 'kikerter'],
  ['lentils', 'linser'], ['carrot', 'gulrot'], ['garlic', 'hvitløk'], ['blueberries', 'blåbær'], ['raspberries', 'bringebær'],
])('finds relevant verified Norwegian ingredients for %s', (query, norwegian) => {
  const results = index.search(query);
  expect(results.length).toBeGreaterThan(0); expect(results[0].name.toLocaleLowerCase('nb')).toContain(norwegian);
  expect(results[0].provenance.source).toBe('matvaretabellen');
});
it('bridges English queries even when a personal Norwegian record has no English aliases', () => {
  const norwegianOnly = { ...(catalog as Food[]).find(food => food.name.startsWith('Torsk,'))!, id: 'norwegian-only', aliases: [] };
  const isolated = new FoodIndex(); isolated.add(norwegianOnly);
  expect(isolated.search('cod')[0]?.id).toBe(norwegianOnly.id);
});
it('keeps chicken cuts and plain pasta first and makes preparation visible rather than silently resolving it', () => {
  expect(index.search('chicken')[0].name).toMatch(/Kylling, filet.*rå/);
  expect(index.search('pasta')[0].aliases[0]).toBe('Pasta, plain, uncooked');
  for (const query of ['chicken', 'pasta']) expect(matchIngredient(query, index, emptyPreferences()).food).toBeNull();
  expect(index.search('parmesan')[0].name).toContain('Parmigiano');
  expect(index.search('chicken').some(food => /postei|i fett|i olje|i smør/.test(food.name))).toBe(false);
});
it('supports explicitly printed full unit names in English and Norwegian without inferring absent units', () => {
  const result = parseNutritionLabel({ engine: 'platform', blocks: [], text: 'Per 100 grams\nEnergy 400 kilocalories\nFat 20 grams\nCarbohydrates 30 gram\nProtein 25000 milligrams\nDietary fibre 5 grammes' });
  expect(result.columns[0].nutrition).toEqual({ kcal: '400', fat: '20', carbohydrate: '30', protein: '25', fiber: '5' });
  const liquid = parseNutritionLabel({ engine: 'platform', blocks: [], text: 'Per 100 millilitres\nEnergi 200 kilojoules\nFett 0 gram\nProtein 5,6 Dr' }).columns[0];
  expect(liquid.unit).toBe('ml'); expect(liquid.nutrition.fat).toBe('0'); expect(liquid.nutrition.protein).toBeNull(); expect(liquid.suggestions?.protein).toBe('5.6');
});
