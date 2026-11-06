import { expect, it } from 'vitest';
import { parseArchive } from '../src/domain/archive';
import { emptyDraft, Food, foodNutrition, LogEntry } from '../src/domain/model';
import { applyLabelColumn, parseNutritionLabel } from '../src/domain/nutritionLabel';
import catalog from '../src/data/catalog.json';

const oil = structuredClone((catalog as Food[]).find(food => food.id === 'mvt:08.019')!); delete oil.nutrition.fiber;
const entry: LogEntry = { id: 'legacy-log', batchId: 'legacy-meal', recordedAt: '2026-10-01T12:00:00Z', meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: 'ingredient', food: oil, quantity: '10', unit: 'g' } }, nutrition: foodNutrition(oil, '10', 'g') }; delete entry.nutrition.fiber;
const legacy = () => ({ format: 'touche-grasse', version: 2, foods: [oil], recipes: [], logs: [structuredClone(entry)], draft: emptyDraft(() => 'legacy-draft') });

it('retains pre-fiber snapshots and complete legacy correction identities without inventing newer fields', () => {
  const value = legacy(); value.logs[0].corrections = [{ correctedAt: '2026-10-02T12:00:00Z', previous: { ...structuredClone(entry), recordedAt: '2026-09-01T12:00:00Z' } }];
  const input = JSON.stringify(value), parsed = parseArchive(input);
  expect(parsed.logs).toEqual(value.logs); expect(parsed.foods).toEqual(value.foods);
  expect(parsed.logs[0].corrections![0].previous.id).toBe(entry.id);
  expect(parsed.logs[0].nutrition).not.toHaveProperty('fiber');
  expect(parsed.logs[0].snapshot.kind === 'food' && parsed.logs[0].snapshot.ingredient.food.nutrition).not.toHaveProperty('fiber');
  expect(parsed.quickEntry).toBeUndefined(); expect(JSON.stringify(value)).toBe(input);
});
it('accepts unfinished quantities, intentionally blank nutrients and every existing draft family', () => {
  const recipe = { id: 'recipe', name: '', ingredients: [{ id: 'oil', food: oil, quantity: '1,', unit: 'g' }], servings: '', cookedWeightGrams: '', steps: [], favorite: false };
  const scan = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 488 kcal\nProtein 5.6 g', blocks: [] });
  const label = applyLabelColumn({ id: 'label', name: '', barcode: '', basis: 'g', amount: '100', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } }, scan, 0); label.values.protein = ''; label.edited = ['protein'];
  const value = { ...legacy(), draft: { ...emptyDraft(() => 'pending'), text: '15g oil', lines: [{ id: 'pending-line', query: 'oil', quantityText: '15,', unit: 'g', food: null }] }, recipeDrafts: { recipe: { recipe, instructions: 'Unfinished preparation' } }, quickEntry: { matches: {}, favorites: [], voiceDraft: { id: 'voice', text: 'Change oil to 15g', locale: 'en-US' }, weightDraft: { date: '2026-', amount: '80,', unit: 'kg' }, labelDrafts: { 'new:': label } } };
  const parsed = parseArchive(JSON.stringify(value));
  expect(parsed.draft).toEqual(value.draft); expect(parsed.recipeDrafts).toEqual(value.recipeDrafts); expect(parsed.quickEntry).toEqual(value.quickEntry);
});
it('rejects malformed, newer, duplicate and inconsistent archives without rewriting the source', () => {
  expect(() => parseArchive('incomplete JSON')).toThrow('unreadable');
  expect(() => parseArchive(JSON.stringify({ ...legacy(), version: 3 }))).toThrow('newer');
  const duplicate = legacy(); duplicate.logs.push(duplicate.logs[0]); expect(() => parseArchive(JSON.stringify(duplicate))).toThrow('duplicate');
  const corrupt = legacy(); corrupt.logs[0].nutrition.kcal = '999'; const input = JSON.stringify(corrupt);
  expect(() => parseArchive(input)).toThrow('invalid nutrition calculation'); expect(JSON.stringify(corrupt)).toBe(input);
  const missingBatch = legacy(); missingBatch.logs[0].preparedBatchId = 'absent'; expect(() => parseArchive(JSON.stringify(missingBatch))).toThrow('batch is missing');
});

it('rejects primary and editable draft identities that cannot safely survive a restart', () => {
  const primary = legacy(); primary.logs[0].id = ''; expect(() => parseArchive(JSON.stringify(primary))).toThrow('identities');
  const draft = { ...legacy(), draft: { ...emptyDraft(() => 'pending'), lines: [{ id: '', query: 'oil', food: oil, unit: 'g', quantityText: '15,' }] } };
  expect(() => parseArchive(JSON.stringify(draft))).toThrow('identities');
  draft.draft.lines[0].id = 'row'; draft.draft.lines.push({ ...draft.draft.lines[0] }); expect(() => parseArchive(JSON.stringify(draft))).toThrow('duplicate');
});
