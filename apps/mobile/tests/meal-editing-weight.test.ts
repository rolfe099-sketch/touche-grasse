import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Food, D, dayKey, emptyDraft, foodNutrition, recipePortion, total } from '../src/domain/model';
import { Repository } from '../src/domain/repository';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { editRow, replaceEditFood, reviewMealEdit } from '../src/domain/mealEditor';
import { weightKg, weightTrend, weightValue, weightWindow } from '../src/domain/weight';
import { batchBalance } from '../src/domain/portions';
import { dayComplete } from '../src/domain/dailyWorkflows';
import { inspectRecoveryJSON } from '../src/domain/recovery';
const oil = (catalog as Food[]).find(food => food.id === 'mvt:08.019')!, chicken = (catalog as Food[]).find(food => food.id === 'mvt:03.205')!;
const at = new Date('2026-10-05T12:00:00');
async function setup(name = randomUUID()) { const repo = new Repository(await openBrowserStorage(name), randomUUID); await repo.initialize([oil, chicken], async () => undefined); return repo; }
function draft() { return { ...emptyDraft(randomUUID), lines: [oil, chicken].map((food, i) => ({ id: randomUUID(), query: food.name, food, quantityText: i ? '200' : '10', unit: 'g' as const })) }; }

it('edits shortcut foods and quantities without eating, modifying history or overwriting an ordinary draft', async () => {
  const repo = await setup(), originalDraft = draft(); await repo.saveDraft(originalDraft); await repo.logDraft(originalDraft, at);
  const original = structuredClone(repo.logs), shortcut = await repo.saveShortcut('Breakfast', repo.logs); await repo.saveDraft(draft()); const unfinished = structuredClone(repo.draft);
  await repo.startMealEdit({ shortcutId: shortcut.id }); const edit = structuredClone(repo.quickEntry.mealEdit!);
  edit.rows[0] = replaceEditFood(edit.rows[0], chicken); edit.rows[0].amount = '150';
  await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  expect(repo.logs).toEqual(original); expect(repo.draft).toEqual(unfinished);
  expect(repo.shortcuts[0].entries[0].snapshot.kind === 'food' && repo.shortcuts[0].entries[0].snapshot.ingredient.food.id).toBe(chicken.id);
  expect(repo.shortcuts[0].entries[1]).toEqual(shortcut.entries[1]); await repo.logShortcut(shortcut.id, at);
  expect(total(repo.logs.filter(entry => !original.some(old => old.id === entry.id)).map(entry => entry.nutrition))).toEqual(foodNutrition(chicken, '350', 'g'));
});
it('replaces, adds and removes diary foods atomically; retains all previous snapshots and supports persistent Undo', async () => {
  const name = randomUUID(), repo = await setup(name); await repo.logDraft(draft(), at); const original = structuredClone(repo.logs);
  await repo.setDayComplete(dayKey(at), true, at); await repo.startMealEdit(original.map(entry => entry.id)); const edit = structuredClone(repo.quickEntry.mealEdit!);
  edit.rows[0] = replaceEditFood(edit.rows[0], chicken); edit.rows[0].amount = '150'; edit.rows.splice(1, 1);
  const added = structuredClone(original[0]); added.id = randomUUID(); if (added.snapshot.kind === 'food') added.snapshot.ingredient.quantity = '5'; added.nutrition = foodNutrition(oil, '5', 'g'); edit.rows.push(editRow(added));
  await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  expect(repo.logs).toHaveLength(2); expect(total(repo.logs.map(entry => entry.nutrition))).toEqual(total([foodNutrition(chicken, '150', 'g'), foodNutrition(oil, '5', 'g')]));
  expect(repo.mealCorrections[0].previous).toEqual(original); expect(repo.logs[0].corrections?.[0].previous.snapshot).toEqual(original[0].snapshot); expect(dayComplete(repo.dayReviews, repo.logs, dayKey(at))).toBe(false);
  expect(repo.undoLabel).toBe('Undo meal correction'); await repo.close(); const reopened = await setup(name); expect(reopened.undoLabel).toBe('Undo meal correction'); await reopened.undoLast();
  expect(reopened.logs).toEqual(original); expect(reopened.mealCorrections[0].revertedAt).toBeTruthy(); expect(dayComplete(reopened.dayReviews, reopened.logs, dayKey(at))).toBe(true);
});
it('correction deletion tombstones stop old backups resurrecting removed ingredients, while fresh restores retain the audit', async () => {
  const repo = await setup(); await repo.logDraft(draft(), at); const old = await repo.exportJSON(); await repo.startMealEdit(repo.logs.map(entry => entry.id));
  const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows.splice(1, 1); await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  const corrected = await repo.exportJSON(); await repo.restoreJSON(old); expect(repo.logs).toHaveLength(1);
  const fresh = await setup(); await fresh.restoreJSON(corrected); expect(fresh.logs).toHaveLength(1); expect(fresh.mealCorrections[0].previous).toHaveLength(2);
});
it('keeps invalid, independently edited amounts through restart; blocks stale saves and incompatible unit conversions', async () => {
  const name = randomUUID(), repo = await setup(name); await repo.logDraft(draft(), at); await repo.startMealEdit(repo.logs.map(entry => entry.id));
  const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0].amount = ''; expect(reviewMealEdit(edit).valid).toBe(false);
  await repo.saveMealEditDraft(edit); await repo.close(); const reopened = await setup(name); expect(reopened.quickEntry.mealEdit?.rows[0].amount).toBe('');
  await expect(reopened.commitMealEdit(edit.id)).rejects.toThrow('Resolve');
  const liquid = { ...oil, id: 'liquid-test', referenceUnit: 'ml' as const, gramsPerMilliliter: null }, converted = structuredClone(edit); converted.rows[0].amount = '15'; converted.rows[0] = replaceEditFood(converted.rows[0], liquid);
  expect(reviewMealEdit(converted).rows[0].error).toContain('conversion'); if (converted.rows[0].entry.snapshot.kind === 'food') converted.rows[0].entry.snapshot.ingredient.unit = 'ml'; expect(reviewMealEdit(converted).valid).toBe(true);
  const next = structuredClone(reopened.quickEntry.mealEdit!); next.rows[0].amount = '15'; await reopened.saveMealEditDraft(next); await reopened.correctLog(next.original[0].id, { quantity: '25' });
  await expect(reopened.commitMealEdit(edit.id)).rejects.toThrow('changed'); expect(reopened.logs.find(entry => entry.id === next.original[0].id)?.snapshot.kind).toBe('food');
});
it('unfinished weight values survive restart and explicit cancellation is not reversed by an old backup', async () => {
  const name = randomUUID(), repo = await setup(name); await repo.saveWeightDraft({ date: '2026-10-05', amount: '80,', unit: 'kg' }); const old = await repo.exportJSON();
  expect(inspectRecoveryJSON(old).meaningful).toBe(true); await repo.close(); const reopened = await setup(name); expect(reopened.quickEntry.weightDraft?.amount).toBe('80,');
  await reopened.saveWeightDraft(null); await reopened.restoreJSON(old); expect(reopened.quickEntry.weightDraft).toBeNull();
  await reopened.saveWeightDraft({ date: '2026-10-05', amount: '80', unit: 'kg' }); await reopened.saveWeighIn('2026-10-05', '80', 'kg', at); expect(reopened.quickEntry.weightDraft).toBeNull();
});
it('corrects a single saved serving without changing remaining batch nutrition, and repeat/undo retain its consumption reference', async () => {
  const repo = await setup(), recipe = { id: 'six', name: 'Six portions', servings: '6', cookedWeightGrams: '600', ingredients: [{ id: 'oil', food: oil, quantity: '60', unit: 'g' as const }], steps: [], favorite: false };
  const batch = await repo.createPreparedBatch(recipe, 'Middag'); await repo.logPreparedBatch(batch.id, '1', 'servings', at); const original = structuredClone(repo.logs[0]);
  await repo.startMealEdit([original.id]); const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0] = replaceEditFood(edit.rows[0], chicken, 'oil'); edit.rows[0].ingredients.oil = '120';
  await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  expect(repo.logs[0].nutrition).toEqual(foodNutrition(chicken, '20', 'g')); expect(repo.logs[0].batchRecipe).toEqual(recipe); expect(repo.preparedBatches[0].recipe).toEqual(recipe); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
  const corrected = structuredClone(repo.logs[0]); await repo.repeat(corrected, at); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('4'); await repo.undoLast(); expect(repo.logs).toEqual([corrected]);
  await repo.logPreparedBatch(batch.id, '1', 'servings', at); expect(repo.logs.find(entry => entry.id !== corrected.id)?.nutrition).toEqual(recipePortion(recipe));
  const fresh = await setup(); await fresh.restoreJSON(await repo.exportJSON()); expect(batchBalance(fresh.preparedBatches[0], fresh.logs).servings.toFixed()).toBe('4');
});
it('weight storage converts explicit units, corrects by date, keeps deletions across restores and leaves food data unchanged', async () => {
  const name = randomUUID(), repo = await setup(name); await repo.logDraft(draft(), at); const food = structuredClone(repo.logs);
  await repo.saveWeighIn('2026-10-01', '180', 'lb', at); expect(repo.weighIns[0].kg).toBe('81.6466266'); expect(new D(weightValue(repo.weighIns[0].kg, 'lb')).eq(180)).toBe(true);
  const before = await repo.exportJSON(); await repo.saveWeighIn('2026-10-01', '81,5', 'kg', at); expect(repo.weighIns[0].previous[0].kg).toBe('81.6466266'); await repo.deleteWeighIn('2026-10-01');
  await repo.restoreJSON(before); expect(repo.weighIns[0].deletedAt).toBeTruthy(); expect(repo.weighIns[0].kg).toBe('81.5'); expect(repo.logs).toEqual(food);
  await repo.close(); const reopened = await setup(name); expect(reopened.weighIns[0].deletedAt).toBeTruthy(); await reopened.deleteWeighIn('2026-10-01', false); expect(reopened.weighIns[0].deletedAt).toBeNull();
  expect(inspectRecoveryJSON(await reopened.exportJSON()).meaningful).toBe(true);
  for (const value of ['0', '-80', '1e2', '1001', 'NaN']) expect(() => weightKg(value, 'kg')).toThrow(); expect(() => reopened.saveWeighIn('2026-10-06', '80', 'kg', at)).toThrow('earlier');
});
it('seven-day weight means count only observed days, separate adjacent windows and do not extrapolate sparse data', async () => {
  const repo = await setup(); for (const [date, kg] of [['2026-09-24', '80'], ['2026-09-28', '82'], ['2026-09-29', '81'], ['2026-10-05', '79']]) await repo.saveWeighIn(date, kg, 'kg', at);
  const trend = weightTrend(repo.weighIns, '2026-10-05'); expect(trend.current).toEqual({ count: 2, mean: '80' }); expect(trend.previous).toEqual({ count: 2, mean: '81' }); expect(trend.change).toBe('-1');
  expect(weightWindow(repo.weighIns, '2026-09-24')).toEqual({ count: 1, mean: null }); await repo.deleteWeighIn('2026-09-29'); expect(weightTrend(repo.weighIns, '2026-10-05').current.mean).toBeNull();
});
it('failed meal correction and weigh-in writes never publish partial data or lose the saved edit draft', async () => {
  const storage = await openBrowserStorage(randomUUID()); let fail = false;
  const repo = new Repository({ ...storage, commit: (changes, revision) => fail ? Promise.reject(new Error('simulated storage failure')) : storage.commit(changes, revision) }, randomUUID);
  await repo.initialize([oil, chicken], async () => undefined); await repo.logDraft(draft(), at); await repo.startMealEdit(repo.logs.map(entry => entry.id));
  const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0].amount = '15'; await repo.saveMealEditDraft(edit); const before = await repo.exportJSON(); fail = true;
  await expect(repo.commitMealEdit(edit.id)).rejects.toThrow('storage failure'); expect(await repo.exportJSON()).toBe(before);
  await expect(repo.saveWeighIn('2026-10-05', '80', 'kg', at)).rejects.toThrow('storage failure'); expect(await repo.exportJSON()).toBe(before);
  fail = false; await repo.commitMealEdit(edit.id); expect(repo.mealCorrections).toHaveLength(1);
});
it('a later direct correction invalidates whole-meal Undo rather than overwriting the newer correction', async () => {
  const repo = await setup(); await repo.logDraft(draft(), at); await repo.startMealEdit(repo.logs.map(entry => entry.id));
  const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0].amount = '15'; await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  await repo.correctLog(repo.logs[0].id, { quantity: '25' }); expect(repo.undo).toEqual([]); expect(repo.mealCorrections[0].previous).toHaveLength(2);
});
it('editing one row preserves the exact nutrition and optional-field shape of an untouched legacy row', async () => {
  const repo = await setup(); const old = structuredClone(draft()); delete old.lines[1].food.nutrition.fiber; await repo.logDraft(old, at);
  // Emulate an older valid archive in which missing fiber was absent, not null.
  const archive = JSON.parse(await repo.exportJSON()); delete archive.logs[1].nutrition.fiber; const legacy = await setup(); await legacy.restoreJSON(JSON.stringify(archive));
  const untouched = structuredClone(legacy.logs.find(entry => entry.id === archive.logs[1].id)!); await legacy.startMealEdit(legacy.logs.map(entry => entry.id));
  const edit = structuredClone(legacy.quickEntry.mealEdit!); edit.rows[0].amount = '15'; await legacy.saveMealEditDraft(edit); await legacy.commitMealEdit(edit.id);
  expect(legacy.logs.find(entry => entry.id === untouched.id)).toStrictEqual(untouched);
});
it('rejects duplicate correction/editor identities in a corrupt archive without changing current records', async () => {
  const repo = await setup(); await repo.logDraft(draft(), at); await repo.startMealEdit(repo.logs.map(entry => entry.id));
  const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0].amount = '15'; await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
  const before = await repo.exportJSON(), badAudit = JSON.parse(before); badAudit.mealCorrections[0].previous.push(badAudit.mealCorrections[0].previous[0]);
  expect(() => repo.restoreJSON(JSON.stringify(badAudit))).toThrow('duplicate'); expect(await repo.exportJSON()).toBe(before);
  await repo.startMealEdit(repo.logs.map(entry => entry.id)); const pending = await repo.exportJSON(), badEdit = JSON.parse(pending); badEdit.quickEntry.mealEdit.original.push(badEdit.quickEntry.mealEdit.original[0]);
  expect(() => repo.restoreJSON(JSON.stringify(badEdit))).toThrow('duplicate'); expect(await repo.exportJSON()).toBe(pending);
});
