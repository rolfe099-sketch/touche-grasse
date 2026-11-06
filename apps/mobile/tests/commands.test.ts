import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Draft, emptyDraft, Food, parseEntry } from '../src/domain/model';
import { applyCommand, applyCommandSequence } from '../src/domain/commands';
import { emptyPreferences, reviewInput } from '../src/domain/quickEntry';
import { FoodIndex } from '../src/domain/search';
import { createVoiceController } from '../src/platform/voice.web';
import { ingredientText } from '../src/domain/naturalInput';
const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));
const preferences = emptyPreferences();
function command(text: string, draft = emptyDraft(randomUUID)) { return applyCommand(text, draft, index, preferences, randomUUID); }
function change(text: string, draft = emptyDraft(randomUUID)): Draft { const result = command(text, draft); if (result.kind !== 'draft') throw new Error('Expected draft'); return result.draft; }
it.each([
  '10 g olive oil then add 100 grams chicken and add 50 g apple',
  'Add ten grams of olive oil then add one hundred grams chicken and add fifty grams of apple.',
  '10g olive oil, then add 100g chicken, and add 50g apple.',
  'Add 10g olive oil. Then add 100g chicken. And add 50g apple.',
  '10g olive oil plus 100g chicken as well as 50g apple',
  '10g olive oil and then please add 100g chicken and also add 50g apple',
  '10g olive oil add 100g chicken add 50g apple',
  'Then add 10g olive oil; add 100g chicken; add 50g apple',
])('splits a multi-ingredient transcript without treating repeated add as a food: %s', text => {
  expect(parseEntry(text, randomUUID).map(line => [line.query, line.quantityText, line.unit])).toEqual([
    ['olive oil', '10', 'g'], ['chicken', '100', 'g'], ['apple', '50', 'g'],
  ]);
  const draft = change(text); expect(draft.lines.map(line => [line.query, line.quantityText])).toEqual([['olive oil', '10'], ['chicken', '100'], ['apple', '50']]);
  expect(draft.lines[1].food).toBeNull(); // Generic chicken still requires a verified product choice.
  expect(ingredientText(ingredientText(text))).toBe(ingredientText(text));
});
it('preserves decimal commas, volumes, preparation and compound food names around spoken boundaries', () => {
  const text = 'Add 15,5g pesto and add 100g macaroni and cheese then add 200 millilitres of milk plus 150g cooked pasta';
  expect(parseEntry(text, randomUUID).map(line => [line.query, line.quantityText, line.unit])).toEqual([
    ['pesto', '15,5', 'g'], ['macaroni and cheese', '100', 'g'], ['milk', '200', 'ml'], ['cooked pasta', '150', 'g'],
  ]);
  expect(parseEntry('100g fish and chips and 10g olive oil', randomUUID).map(line => line.query)).toEqual(['fish and chips', 'olive oil']);
});
it('accepts measured Norwegian joins without changing food names or guessing number words', () => {
  expect(parseEntry('Legg til 10g olivenolje og legg til 100 gram kylling og så 50g eple', randomUUID).map(line => [line.query, line.quantityText])).toEqual([
    ['olivenolje', '10'], ['kylling', '100'], ['eple', '50'],
  ]);
});
it('does not silently execute trailing actions or invent quantities for incomplete speech', () => {
  const action = command('10g olive oil then log it'); expect(action.kind).toBe('draft');
  if (action.kind === 'draft') expect(action.draft.lines[0].food).toBeNull();
  expect(parseEntry('olive oil and chicken', randomUUID)[0].quantityText).toBe('');
  const draft = change('10g olive oil then add 100g unlisted mystery food');
  expect(draft.lines).toHaveLength(2); expect(draft.lines[1].food).toBeNull();
});
it('parses natural meal phrases and number words without inventing food, amounts or preparation', () => {
  const lines = parseEntry('Add two hundred grams of chicken and ten grams of olive oil.', randomUUID);
  expect(lines.map(line => [line.query, line.quantityText, line.unit])).toEqual([['chicken', '200', 'g'], ['olive oil', '10', 'g']]);
  expect(parseEntry('I ate 200g chicken plus 150g pasta', randomUUID)).toHaveLength(2);
  expect(parseEntry('Add chicken and olive oil', randomUUID)[0].quantityText).toBe('');
  expect(parseEntry('15,5g pesto, 10g olive oil', randomUUID)[0].quantityText).toBe('15,5');
});
it.each([
  'can you add 15 grams of oil',
  'Can you please add fifteen grams of oil?',
  'Could you add 15 grams of oil please?',
  'Would you please add 15g oil?',
  'Will you add 15g oil',
  'Please could you add 15 grams of oil?',
  'Please add 15g oil',
])('parses a polite request as an ingredient without silently choosing its product: %s', text => {
  const next = change(text);
  expect(next.lines.map(line => [line.query, line.quantityText, line.unit])).toEqual([['oil', '15', 'g']]);
  expect(next.lines[0].food).toBeNull();
  expect(parseEntry(text, randomUUID).map(line => [line.query, line.quantityText, line.unit])).toEqual([['oil', '15', 'g']]);
  expect(ingredientText(ingredientText(text))).toBe(ingredientText(text));
});
it('supports polite additions and corrections throughout one atomic utterance', () => {
  const result = applyCommandSequence('Could you add 10 grams of olive oil and can you add 50g apple, then would you please change apple to 75g?', emptyDraft(randomUUID), index, preferences, randomUUID);
  expect(result.draft.lines.map(line => [line.query, line.quantityText])).toEqual([['olive oil', '10'], ['apple', '75']]);
  expect(parseEntry('Can you add 15,5g pesto and could you add 100g macaroni and cheese?', randomUUID).map(line => [line.query, line.quantityText])).toEqual([['pesto', '15,5'], ['macaroni and cheese', '100']]);
  expect(command('Could you split into six servings?', result.draft).kind).toBe('draft');
  expect(command('Can you log it?', result.draft)).toEqual({ kind: 'log' });
});
it('does not turn information questions or negated requests into food commands or strip literal food names', () => {
  const draft = change('10g olive oil'), before = JSON.stringify(draft);
  for (const text of ['Can I add 15g oil?', 'Can you not add 15g oil?', 'Please can you not add 15g oil?', 'Could you tell me about 15g oil?', "Don't add 15g oil", "Please don't add 15g oil", 'Please do not add 15g oil']) expect(() => command(text, draft)).toThrow('Nothing changed');
  expect(JSON.stringify(draft)).toBe(before);
  expect(() => applyCommandSequence('Can you add 50g apple, then could you not add 15g oil?', draft, index, preferences, randomUUID)).toThrow('Nothing changed');
  expect(JSON.stringify(draft)).toBe(before);
  expect(ingredientText('100g Can You Cheese')).toBe('100g Can You Cheese');
  expect(command('Can you start a recipe called Pretty Please?')).toMatchObject({ kind: 'draft', draft: { recipeName: 'Pretty Please' } });
});
it('appends conversational additions while keeping confirmed selections and unrelated quantities', () => {
  let draft = reviewInput({ kind: 'text', text: '200g chicken, 10g olive oil' }, emptyDraft(randomUUID), index, preferences, randomUUID);
  draft.lines[0].food = index.get('mvt:03.205')!;
  const original = draft.lines[0]; draft = change('Add 150 grams of dry pasta and 15 grams of pesto', draft);
  expect(draft.lines).toHaveLength(4); expect(draft.lines[0]).toEqual(original);
  const next = change('Change chicken to 250 grams', draft);
  expect(next.lines[0].food).toEqual(original.food); expect(next.lines[0].quantityText).toBe('250');
  expect(next.lines.slice(1)).toEqual(draft.lines.slice(1)); expect(next.text).toContain('250g chicken');
});
it('rejects ambiguous and missing correction targets without changing the source', () => {
  const draft = change('Add 100g chicken breast and 200g chicken thigh'); const before = JSON.stringify(draft);
  expect(() => command('Change chicken to 300g', draft)).toThrow('More than one');
  expect(() => command('Remove salmon', draft)).toThrow('not in this meal'); expect(JSON.stringify(draft)).toBe(before);
  expect(change('Remove chicken thigh', draft).lines).toHaveLength(1);
  expect(() => command('Change chicken breast to 0g', draft)).toThrow('amount');
});
it('keeps manually selected records with commas in their source names intact when appending', () => {
  const selected = index.get('mvt:03.205')!, row = { id: randomUUID(), query: selected.name, quantityText: '200', unit: 'g' as const, food: selected };
  const draft = { ...emptyDraft(randomUUID), lines: [row] }, next = change('Add 10g olive oil', draft);
  expect(next.lines).toHaveLength(2); expect(next.lines[0].id).toBe(row.id); expect(next.lines[0].food).toEqual(selected); expect(next.lines[0].quantityText).toBe('200');
});
it('builds a named recipe, serving split and measured cooked weight without logging or resolving guesses', () => {
  let draft = change('Start a recipe called Chicken pasta');
  draft = change('Add 200g chicken and 150g pasta', draft); draft = change('Split into six servings', draft);
  draft = change('Final cooked weight 600 grams', draft);
  expect(draft.recipeName).toBe('Chicken pasta'); expect(draft.splitPlan).toEqual({ name: 'Chicken pasta', servingsText: '6', cookedWeightText: '600' });
  expect(draft.lines.every(line => line.food === null)).toBe(true);
  expect(command('Save recipe', draft)).toEqual({ kind: 'recipe' });
  expect(() => command('Split into zero servings', draft)).toThrow('count');
});
it('returns explicit logging/repeat/portion intents and rejects unsupported commands', () => {
  expect(command('Log it')).toEqual({ kind: 'log' }); expect(command('Repeat my last meal')).toEqual({ kind: 'repeat' });
  expect(command('Same breakfast as yesterday')).toEqual({ kind: 'repeat', yesterdayMeal: 'Frokost' });
  expect(command('Repeat lunch from yesterday.')).toEqual({ kind: 'repeat', yesterdayMeal: 'Lunsj' });
  expect(command('Log dinner yesterday')).toEqual({ kind: 'repeat', yesterdayMeal: 'Middag' });
  expect(command('Log two servings of Chicken pasta')).toEqual({ kind: 'portion', quantity: '2', name: 'Chicken pasta' });
  expect(() => command('Change everything')).toThrow('Try'); expect(() => command('')).toThrow('first');
});

const scope = globalThis as unknown as Record<string, unknown>;
const original = scope.SpeechRecognition, prefixed = scope.webkitSpeechRecognition;
afterEach(() => { scope.SpeechRecognition = original; scope.webkitSpeechRecognition = prefixed; });
class TestRecognition {
  static current: TestRecognition; lang = ''; interimResults = false; continuous = false;
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
  constructor() { TestRecognition.current = this; } start() { this.onstart?.(); } stop() { this.onend?.(); } abort() { this.onend?.(); }
}
it('delivers interim text for display and one final transcript per recognition session', async () => {
  scope.SpeechRecognition = TestRecognition; const voice = createVoiceController(); const onText = vi.fn(), onState = vi.fn();
  await voice.start('en-US', { onText, onState, onError: vi.fn() });
  const session = TestRecognition.current; expect(session.lang).toBe('en-US'); expect(onState).toHaveBeenCalledWith(true);
  session.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'Add 200' } }] });
  session.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Add 200g chicken' } }] });
  session.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Add 200g chicken' } }] });
  expect(onText.mock.calls.every(([, final]) => !final)).toBe(true);
  session.onend?.(); session.onend?.();
  expect(onText.mock.calls.filter(([, final]) => final)).toEqual([['Add 200g chicken', true]]);
  voice.cancel(); expect(session.onresult).toBeNull(); expect(onState).toHaveBeenLastCalledWith(false);
});
it('aggregates final segments and corrected interim results until the browser ends', async () => {
  scope.SpeechRecognition = TestRecognition; const voice = createVoiceController(), onText = vi.fn();
  await voice.start('en-US', { onText, onState: vi.fn(), onError: vi.fn() });
  const session = TestRecognition.current, result = (transcript: string, isFinal: boolean) => ({ isFinal, 0: { transcript } });
  session.onresult?.({ resultIndex: 0, results: [result('Add 10g olive oil', true), result('and 10g chicken', false)] });
  session.onresult?.({ resultIndex: 1, results: [result('Add 10g olive oil', true), result('and 100g chicken', true), result('then add 50g apple', true)] });
  expect(onText.mock.calls.filter(([, final]) => final)).toEqual([]);
  session.onend?.();
  expect(onText).toHaveBeenLastCalledWith('Add 10g olive oil and 100g chicken then add 50g apple', true);
});
it('retains interim text without applying it on an incomplete end, cancellation or error', async () => {
  scope.SpeechRecognition = TestRecognition; const voice = createVoiceController(), onText = vi.fn(), onError = vi.fn();
  for (const end of ['stop', 'cancel', 'error'] as const) {
    await voice.start('en-US', { onText, onState: vi.fn(), onError });
    const session = TestRecognition.current, late = session.onresult;
    session.onresult?.({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: 'Add 200g' } }] });
    if (end === 'error') session.onerror?.({ error: 'network' }); else voice[end]();
    late?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'late result' } }] });
  }
  expect(onText.mock.calls.filter(([, final]) => final)).toEqual([]); expect(onError).toHaveBeenCalledOnce();
});
it('applies a cooking sequence atomically while preserving verified selections and decimal precision', () => {
  const initial = change('10g olive oil'); initial.lines[0].food = index.get('mvt:08.019')!;
  const execute = (text: string) => applyCommandSequence(text, initial, index, preferences, randomUUID);
  const result = execute('Add 200g chicken then change chicken to 250g and split into six servings. Final cooked weight 1.001001 kg');
  expect(result.draft.lines.map(line => [line.query, line.quantityText])).toEqual([['olive oil', '10'], ['chicken', '250']]);
  expect(result.draft.lines[0].food).toEqual(initial.lines[0].food);
  expect(result.draft.splitPlan).toMatchObject({ servingsText: '6', cookedWeightText: '1001.001' });
  expect(result.draft.lines[1].food).toBeNull(); expect(initial.lines).toHaveLength(1);
  expect(() => execute('Add 200g chicken then remove salmon')).toThrow('not in this meal'); expect(initial.lines).toHaveLength(1);
  expect(() => execute('Log it then add 20g chicken')).toThrow('last command');
  expect(() => execute('Add 200g chicken then repeat my last meal')).toThrow('Nothing changed');
  expect(execute('Change olive oil to 15g then log it').command).toEqual({ kind: 'log' });
});
it('supports a named conversational recipe and leaves food conjunctions intact', () => {
  const result = applyCommandSequence("I'm making chicken pasta. Six servings. Add 100g macaroni and cheese and 10g olive oil", emptyDraft(randomUUID), index, preferences, randomUUID);
  expect(result.draft.recipeName).toBe('chicken pasta'); expect(result.draft.splitPlan?.servingsText).toBe('6');
  expect(result.draft.lines.map(line => line.query)).toEqual(['macaroni and cheese', 'olive oil']);
});
it('reports speech denial and unsupported browsers without fake transcripts', async () => {
  scope.SpeechRecognition = TestRecognition; const onError = vi.fn(), onText = vi.fn(); const voice = createVoiceController();
  await voice.start('nb-NO', { onError, onText, onState: vi.fn() }); TestRecognition.current.onerror?.({ error: 'not-allowed' });
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('Microphone access is off')); expect(onText).not.toHaveBeenCalled(); voice.cancel();
  scope.SpeechRecognition = undefined; scope.webkitSpeechRecognition = undefined;
  const unavailable = createVoiceController(); expect(unavailable.available).toBe(false); await expect(unavailable.start('en-US', { onError, onText, onState: vi.fn() })).rejects.toThrow('does not support');
});
