import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { emptyDraft, Food, foodNutrition, parseEntry, total } from '../src/domain/model';
import { FoodIndex } from '../src/domain/search';
import { editLiveLine, emptyPreferences, frequentMealBatches, liveTextIsCurrent, mealProgress, matchIngredient, reviewInput, updateLiveText } from '../src/domain/quickEntry';
const foods = catalog as Food[], index = new FoodIndex(); foods.forEach(food => index.add(food));
const oil = index.get('mvt:08.019')!, chicken = index.get('mvt:03.205')!;
it('parses both amount positions, decimal commas, supported units and delimiters without dropping unknown text', () => {
  const lines = parseEntry('200g chicken, pasta 150 grams;15,5g pesto\n0.01 kilograms olive oil, 2 tbsp dressing, salt', randomUUID);
  expect(lines.map(l => [l.query, l.quantityText, l.unit])).toEqual([['chicken', '200', 'g'], ['pasta', '150', 'g'], ['pesto', '15,5', 'g'], ['olive oil', '0.01', 'kg'], ['dressing', '2', 'tbsp'], ['salt', '', 'g']]);
  expect(new Set(lines.map(l => l.id)).size).toBe(6);
  expect(parseEntry('0g oil, -5g chicken, 2oz sauce', randomUUID).map(l => l.quantityText)).toEqual(['0', '', '']);
  expect(() => parseEntry(Array(201).fill('10g oil').join(';'), randomUUID)).toThrow('200');
});
it('resolves unique exact aliases (including catalogue inverted names), but never silently chooses broad or fuzzy candidates', () => {
  expect(matchIngredient('olive oil', index, emptyPreferences()).food?.id).toBe(oil.id);
  expect(matchIngredient(chicken.aliases[0], index, emptyPreferences()).reason).toBe('exact');
  for (const query of ['chicken', 'pasta', 'pesto', 'chiken', 'unfindable-ingredient']) expect(matchIngredient(query, index, emptyPreferences()).food).toBeNull();
  const collision = new FoodIndex(); collision.add({ ...oil, aliases: ['shared'] }); collision.add({ ...chicken, aliases: ['shared'] });
  expect(matchIngredient('shared', collision, emptyPreferences()).food).toBeNull();
});
it('uses confirmed query mappings without broadening qualifiers and ignores stale references', () => {
  const preferences = { matches: { chicken: { foodId: chicken.id, confirmedAt: new Date().toISOString() } }, favorites: [] };
  expect(matchIngredient('Chicken', index, preferences).reason).toBe('remembered');
  expect(matchIngredient('chicken cooked', index, preferences).food).toBeNull();
  expect(matchIngredient('chicken', index, { ...preferences, matches: { chicken: { ...preferences.matches.chicken, foodId: 'missing' } } }).food).toBeNull();
});
it('ranks favorites and previous selections ahead of generic candidates without treating rank as confirmation', () => {
  const personal = new FoodIndex(); foods.forEach(food => personal.add(food));
  const pasta = personal.search('pasta').at(-1)!;
  personal.setPersonal([pasta], [], [pasta.id]); expect(personal.search('pasta')[0].id).toBe(pasta.id);
  expect(matchIngredient('pasta', personal, emptyPreferences()).food).toBeNull();
  personal.setPersonal([], [{ id: 'x', batchId: 'b', recordedAt: new Date().toISOString(), meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: 'i', food: pasta, quantity: '100', unit: 'g' } }, nutrition: foodNutrition(pasta, '100', 'g') }]);
  expect(personal.search('pasta')[0].id).toBe(pasta.id);
});
it('shares resolution with structured ingredient adapters and preserves existing draft rows', () => {
  const draft = reviewInput({ kind: 'text', text: '10g olive oil' }, emptyDraft(randomUUID), index, emptyPreferences(), randomUUID);
  const next = reviewInput({ kind: 'ingredients', ingredients: [{ query: chicken.aliases[0], quantityText: '200', unit: 'g', food: null }] }, draft, index, emptyPreferences(), randomUUID);
  expect(next.lines[0]).toEqual(draft.lines[0]); expect(next.lines[1].food?.id).toBe(chicken.id);
  expect(next.lines[1].quantityText).toBe('200');
});

it('reconciles live text immediately, keeps row identities and corrections, and invalidates renamed products', () => {
  let draft = updateLiveText('200g chicken, 10g olive oil', emptyDraft(randomUUID), index, emptyPreferences(), randomUUID);
  const [first, second] = draft.lines.map(line => line.id);
  expect(draft.lines[0].food).toBeNull(); expect(draft.lines[1].food?.id).toBe(oil.id); expect(liveTextIsCurrent(draft)).toBe(true);
  draft = editLiveLine(draft, first, { food: chicken });
  draft = editLiveLine(draft, first, { quantityText: '250' });
  expect(draft.text).toBe('250g chicken, 10g olive oil');
  draft = updateLiveText(draft.text + ', 15g pesto', draft, index, emptyPreferences(), randomUUID);
  expect(draft.lines[0].id).toBe(first); expect(draft.lines[0].food?.id).toBe(chicken.id);
  expect(draft.lines[0].quantityText).toBe('250'); expect(draft.lines[1].id).toBe(second);
  draft = updateLiveText('250g chicken cooked, 10g olive oil, 15g pesto', draft, index, emptyPreferences(), randomUUID);
  expect(draft.lines[0].id).toBe(first); expect(draft.lines[0].food).toBeNull();
  expect(draft.lines[1].id).toBe(second); expect(draft.lines[1].quantityText).toBe('10');
});
it('handles duplicate ingredients, reorders, deletion and independent manually added rows', () => {
  let draft = updateLiveText('10g olive oil, 20g olive oil', emptyDraft(randomUUID), index, emptyPreferences(), randomUUID);
  const [first, second] = draft.lines.map(line => line.id);
  draft = { ...draft, lines: [...draft.lines, { id: 'manual', food: chicken, query: chicken.name, quantityText: '200', unit: 'g' }] };
  draft = editLiveLine(draft, first, { quantityText: '15' });
  draft = updateLiveText('20g olive oil, 15g olive oil', draft, index, emptyPreferences(), randomUUID);
  expect(draft.lines.map(line => line.id)).toEqual([second, first, 'manual']);
  draft = editLiveLine(draft, second, null);
  expect(draft.text).toBe('15g olive oil'); expect(draft.lines.map(line => line.id)).toEqual([first, 'manual']);
  draft = updateLiveText('', draft, index, emptyPreferences(), randomUUID);
  expect(draft.lines.map(line => line.id)).toEqual(['manual']); expect(liveTextIsCurrent(draft)).toBe(true);
});
it('repairs a persisted pre-fix speech draft without losing independent selected rows', () => {
  const text = '10 g olive oil then add 100 grams chicken and add 50 g apple';
  const source = { id: 'old-source', query: 'olive oil then add 100 grams chicken and add 50 g apple', quantityText: '10', unit: 'g' as const };
  const manual = { id: 'manual', query: chicken.name, quantityText: '80', unit: 'g' as const, food: chicken };
  const draft = { ...emptyDraft(randomUUID), text, textRows: [source], lines: [{ ...source, food: null }, manual] };
  expect(liveTextIsCurrent(draft)).toBe(false);
  const repaired = updateLiveText(draft.text, draft, index, emptyPreferences(), randomUUID);
  expect(repaired.lines.map(line => [line.query, line.quantityText])).toEqual([['olive oil', '10'], ['chicken', '100'], ['apple', '50'], [chicken.name, '80']]);
  expect(repaired.lines[0].food).toEqual(oil); expect(repaired.lines[1].food).toBeNull();
  expect(repaired.lines[3]).toEqual(manual); expect(repaired.text).toBe(text);
  expect(liveTextIsCurrent(repaired)).toBe(true);
  expect(updateLiveText(text, repaired, index, emptyPreferences(), randomUUID)).toEqual(repaired);
});
it('detects pending or stale source text and keeps remembered products editable without dropping safeguards', () => {
  const preferences = { matches: { chicken: { foodId: chicken.id, confirmedAt: new Date().toISOString() } }, favorites: [] };
  let draft = updateLiveText('200g chicken, 10ml olive oil', emptyDraft(randomUUID), index, preferences, randomUUID);
  expect(draft.lines[0].food?.id).toBe(chicken.id); expect(liveTextIsCurrent(draft)).toBe(true);
  expect(() => foodNutrition(draft.lines[1].food!, '10', 'ml')).toThrow('conversion');
  expect(liveTextIsCurrent({ ...draft, text: draft.text + ', unknown' })).toBe(false);
  expect(liveTextIsCurrent({ ...draft, text: '' })).toBe(false);
  draft = editLiveLine(draft, draft.lines[0].id, { quantityText: '' });
  expect(draft.lines[0].quantityText).toBe(''); expect(draft.lines[1].quantityText).toBe('10');
});
it('ranks genuinely frequent batches above a more recent one and uses its newest historical snapshots', () => {
  const entries = (batchId: string, recordedAt: string, quantity = '10') => [oil, chicken].map((food, i) => ({ id: batchId + i, batchId, recordedAt, meal: 'Middag' as const, snapshot: { kind: 'food' as const, ingredient: { id: batchId + i, food, quantity, unit: 'g' as const } }, nutrition: foodNutrition(food, quantity, 'g') }));
  const latest = entries('latest', '2026-10-23T12:00:00Z', '15'), older = entries('older', '2026-10-20T12:00:00Z'), newer = entries('newer', '2026-10-22T12:00:00Z');
  expect(frequentMealBatches([...latest, ...older, ...newer]).map(batch => batch[0].batchId)).toEqual(['newer', 'latest']);
  expect(frequentMealBatches([...older, ...latest, ...newer], 1)[0]).toEqual(newer);
});

it('ranks real basic chicken cuts and plain pasta above offal, spreads and dishes in both languages', () => {
  for (const query of ['chicken', 'kylling']) {
    const top = index.search(query).slice(0, 3);
    expect(top.map(food => food.id)).toContain('mvt:03.205'); expect(top.map(food => food.id)).toContain('mvt:03.418');
    expect(top.every(food => /fillet|breast|thigh|drumstick|leg/i.test(food.aliases.join(' ')))).toBe(true);
    expect(top.every(food => !/liver|paste|pate|sausage|meat balls/i.test(food.aliases.join(' ')))).toBe(true);
    expect(matchIngredient(query, index, emptyPreferences()).food).toBeNull();
  }
  const pasta = index.search('pasta').slice(0, 3);
  expect(pasta.slice(0, 2).map(food => food.id).sort()).toEqual(['mvt:05.016', 'mvt:05.130']);
  expect(pasta.every(food => /pasta, plain/i.test(food.aliases.join(' ')))).toBe(true);
  expect(matchIngredient('pasta', index, emptyPreferences()).food).toBeNull();
});
it('bridges English descriptors and Parmesan synonyms without changing verified source data', () => {
  expect(index.search('chicken breast raw')[0].id).toBe('mvt:03.205');
  expect(index.search('raw chicken')[0].id).toBe('mvt:03.205');
  expect(index.search('chicken cooked')[0].id).toBe('mvt:03.418');
  expect(index.search('pasta dry')[0].id).toBe('mvt:05.016');
  expect(index.search('pasta cooked')[0].id).toBe('mvt:05.130');
  for (const query of ['parmesan', 'parmigiano reggiano', 'parmesan cheese']) expect(matchIngredient(query, index, emptyPreferences()).food?.id).toBe('mvt:01.200');
  expect(index.search('chicken liver')[0].id).toBe('mvt:03.259');
  const exactCheese = foods.find(food => food.id === 'mvt:01.200')!;
  expect(exactCheese.aliases).toEqual(['Cheese, hard, Parmesan, Parmigiano Reggiano']);
  expect(matchIngredient(chicken.name, index, emptyPreferences()).food?.id).toBe(chicken.id);
});
it('prioritizes the previously confirmed exact query without carrying it over to another preparation', () => {
  const personal = new FoodIndex(); foods.forEach(food => personal.add(food));
  personal.setPersonal([], [], [], { chicken: { foodId: 'mvt:03.418' } });
  expect(personal.search('chicken')[0].id).toBe('mvt:03.418');
  expect(personal.search('chicken raw')[0].id).toBe('mvt:03.205');
});
it('shows only verified partial nutrition while unresolved ingredients remain in the meal', () => {
  const draft = updateLiveText('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan', emptyDraft(randomUUID), index, emptyPreferences(), randomUUID);
  const progress = mealProgress(draft);
  expect(progress.resolved).toBe(2); expect(progress.valid).toBe(false);
  expect(progress.nutrition).toEqual(total([foodNutrition(oil, '10', 'g'), foodNutrition(index.get('mvt:01.200')!, '50', 'g')]));
  const unknown = { ...oil, nutrition: { ...oil.nutrition, protein: null } };
  expect(mealProgress({ ...draft, lines: [{ ...draft.lines[3], food: unknown }] }).nutrition.protein).toBeNull();
});
it('never turns a unique generic alias into an assumption about preparation, while honoring a confirmed choice', () => {
  const personal = new FoodIndex(); personal.add({ ...chicken, aliases: ['chicken'] });
  expect(matchIngredient('chicken', personal, emptyPreferences()).food).toBeNull();
  const preferences = { matches: { chicken: { foodId: chicken.id, confirmedAt: new Date().toISOString() } }, favorites: [] };
  expect(matchIngredient('chicken', personal, preferences).food?.id).toBe(chicken.id);
});
