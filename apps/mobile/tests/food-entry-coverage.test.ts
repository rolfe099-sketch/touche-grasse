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

it.each([
  ['ground beef', /^Beef, minced meat, .*raw$/],
  ['minced beef', /^Beef, minced meat, .*raw$/],
  ['kyllingbryst', /^Chicken, fillet, without skin, raw$/],
  ['kyllingfileter', /^Chicken, fillet, without skin, raw$/],
  ['bell pepper', /^Sweet pepper, .*raw$/],
  ['red bell pepper', /^Sweet pepper, red, raw$/],
  ['kokt ris', /^Rice, .*cooked$/],
])('ranks the actual ingredient for the observed missed query %s', (query, description) => {
  expect(index.search(query)[0]?.aliases[0]).toMatch(description);
  expect(matchIngredient(query, index, emptyPreferences()).food).toBeNull();
});
it('keeps rice grain above noodles, prefix collisions and uncooked pre-boiled records', () => {
  const results = index.search('kokt ris');
  expect(results.slice(0, 3).every(food => /^Rice,/.test(food.aliases[0]))).toBe(true);
  expect(results.some(food => /Chestnut|uncooked/i.test(food.aliases[0]))).toBe(false);
  expect(index.search('ris tørr').slice(0, 3).every(food => /uncooked/.test(food.aliases[0]))).toBe(true);
  // Prefix search still works while typing and one-letter typos remain suggestions.
  expect(index.search('kylli').some(food => /^Kylling,/.test(food.name))).toBe(true);
  expect(index.search('chiken').some(food => /^Kylling,/.test(food.name))).toBe(true);
  expect(matchIngredient('chiken', index, emptyPreferences()).food).toBeNull();
});
it('search phrases remain suggestions and preserve source names, aliases and nutrition', () => {
  const mince = index.search('ground beef').map(food => food.id);
  expect(mince.indexOf('mvt:03.397')).toBeLessThan(mince.indexOf('mvt:03.127'));
  const original = JSON.stringify(catalog);
  const isolated = new FoodIndex(), chicken = (catalog as Food[]).find(food => food.id === 'mvt:03.205')!;
  isolated.add({ ...chicken, aliases: [] });
  expect(isolated.search('kyllingbryst')[0].id).toBe(chicken.id);
  expect(isolated.exact('kyllingbryst')).toEqual([]);
  expect(matchIngredient('kyllingbryst', isolated, emptyPreferences()).food).toBeNull();
  for (const query of ['ground beef', 'bell pepper', 'kyllingbryst']) {
    index.search(query); expect(index.exact(query)).toEqual([]);
  }
  expect(index.search('ground pepper').some(food => /Beef|Chicken/.test(food.aliases[0]))).toBe(false);
  expect(JSON.stringify(catalog)).toBe(original);
});
it('keeps explicit preparation safe for remembered choices and preserves confirmed product priority', () => {
  const chicken = index.get('mvt:03.205')!, cooked = index.get('mvt:03.418')!, personal = new FoodIndex();
  (catalog as Food[]).forEach(food => personal.add(food));
  const matches = { 'ground beef': { foodId: 'mvt:03.397', confirmedAt: '2026-11-06T12:00:00Z' }, 'chicken cooked': { foodId: chicken.id, confirmedAt: '2026-11-06T12:00:00Z' }, 'chicken raw': { foodId: cooked.id, confirmedAt: '2026-11-06T12:00:00Z' } };
  personal.setPersonal([], [], [], matches);
  expect(personal.search('ground beef')[0].id).toBe('mvt:03.397');
  expect(matchIngredient('ground beef', personal, { matches, favorites: [] }).reason).toBe('remembered');
  for (const query of ['chicken cooked', 'chicken raw']) expect(matchIngredient(query, personal, { matches, favorites: [] }).food).toBeNull();
  expect(personal.search('chicken cooked').some(food => food.id === chicken.id)).toBe(false);
  expect(personal.search('chicken raw').some(food => food.id === cooked.id)).toBe(false);
});

it('keeps whole plural ingredients and saved-only prefix search reachable', () => {
  expect(index.search('peanut')[0].aliases[0]).toBe('Peanuts, raw');
  expect(index.search('peanut').some(food => food.aliases[0] === 'Peanuts, roasted, salted')).toBe(true);
  const personal = new FoodIndex(), rice = (catalog as Food[]).find(food => food.id === 'mvt:05.338')!;
  const saved = { ...rice, id: 'saved-ricecakes', name: 'Ricecakes', aliases: [] };
  personal.add(rice); personal.setPersonal([saved], []);
  expect(personal.search('rice')[0].id).toBe(rice.id);
  expect(personal.search('rice', true)[0].id).toBe(saved.id);
  personal.add({ ...saved, name: 'Quinoa cakes' });
  expect(personal.search('rice', true)).toEqual([]);
  expect(personal.search('quinoa', true)[0].id).toBe(saved.id);
});
