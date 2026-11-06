import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { migration1, openSQLStorage, SQLDatabase } from '../src/storage/sqlite';
import { StorageAdapter, put } from '../src/storage/contract';
import { editLiveLine, matchIngredient, reviewInput, recentMealBatches, updateLiveText } from '../src/domain/quickEntry';
import { batchBalance } from '../src/domain/portions';
import { Repository } from '../src/domain/repository';
import { dayKey, D, emptyDraft, Food, nutrients, Recipe, recipeTotal } from '../src/domain/model';
import catalogJSON from '../src/data/catalog.json';
import { dayComplete } from '../src/domain/dailyWorkflows';
import { emptyTargets, targetOn } from '../src/domain/targets';
import { confirmBarcodeProduct, parseBarcodeProduct } from '../src/domain/barcode';
import { applyLabelColumn, parseNutritionLabel, reviewedLabelFood } from '../src/domain/nutritionLabel';
import { milkCode, milkProduct } from './barcode-fixture';

const catalog = catalogJSON as Food[], oil = catalog.find(f => f.id === 'mvt:08.019')!;
function driver(db: DatabaseSync): SQLDatabase {
  const value: SQLDatabase = {
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return db.prepare(sql).all(...params) as T[]; },
    async withExclusiveTransactionAsync(task) { db.exec('BEGIN IMMEDIATE'); try { await task(value); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } },
    async closeAsync() { db.close(); },
  }; return value;
}
async function setup(adapter: StorageAdapter) { const repo = new Repository(adapter, randomUUID); await repo.initialize(catalog, async () => undefined); return repo; }
const draftFor = () => ({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), query: oil.name, food: oil, quantityText: '10', unit: 'g' as const }] });

for (const platform of ['IndexedDB', 'SQLite'] as const) describe(`${platform} real adapter / shared repository`, () => {
  async function adapter() { return platform === 'IndexedDB' ? openBrowserStorage(randomUUID()) : openSQLStorage(driver(new DatabaseSync(':memory:'))); }
  it('refuses unrecognized backup fields instead of silently discarding newer data', async () => {
    const repo = await setup(await adapter()); await repo.logDraft(draftFor()); const original = await repo.exportJSON();
    for (const location of ['archive', 'food', 'snapshot', 'draft', 'preferences']) {
      const backup = JSON.parse(original);
      const target = location === 'archive' ? backup : location === 'food' ? backup.foods[0] : location === 'snapshot' ? backup.logs[0].snapshot : location === 'draft' ? backup.draft : backup.quickEntry;
      target.newerAppData = { measured: 'keep this' };
      expect(() => repo.restoreJSON(JSON.stringify(backup))).toThrow('newer');
      expect(await repo.exportJSON()).toBe(original);
    }
    await repo.close();
  });
  it('rejects unsupported or mismatched stored records before writing, and closes the failed repository', async () => {
    for (const record of [
      { key: 'futureEvent:one', kind: 'futureEvent', id: 'one', value: {} },
      { key: 'draft:active', kind: 'draft', id: 'active', value: { ...emptyDraft(randomUUID), newerAppData: 'retain' } },
      { key: 'food:wrong', kind: 'food', id: 'wrong', value: oil },
    ]) {
      const storage = await adapter(); await storage.commit([{ type: 'put', record } as import('../src/storage/contract').Change], 0);
      const before = await storage.load(); let closed = 0, writes = 0;
      const repo = new Repository({ ...storage, close: async () => { closed++; }, commit: async (changes, revision) => { writes++; return storage.commit(changes, revision); } }, randomUUID);
      await expect(repo.initialize(catalog, async () => undefined)).rejects.toThrow();
      expect(closed).toBe(1); expect(writes).toBe(0); expect(await storage.load()).toEqual(before); await storage.close();
    }
  });
  it('validates saved portion capacity before creating first-use metadata on startup', async () => {
    const storage = await adapter(), source = await setup(storage);
    const batch = await source.createBatchFromDraft(draftFor(), 'Six portions', '6', null); await source.logPreparedBatch(batch.id);
    const invalid = structuredClone(source.logs[0]); if (invalid.snapshot.kind === 'recipe') invalid.snapshot.quantity = '7';
    const revision = (await storage.load()).revision;
    await storage.commit([{ type: 'delete', key: 'profile:identity' }, put('log', invalid.id, invalid)], revision);
    const before = await storage.load(); let closed = 0;
    const reopened = new Repository({ ...storage, close: async () => { closed++; } }, randomUUID);
    await expect(reopened.initialize(catalog, async () => undefined)).rejects.toThrow('exceeds');
    expect(closed).toBe(1); expect(await storage.load()).toEqual(before); await storage.close();
  });
  it('moves every selected diary ingredient together, retains exact snapshots and restores both days with persistent Undo', async () => {
    const storage = await adapter(), repo = await setup(storage), sourceAt = new Date(2026, 9, 5, 8, 45), targetAt = new Date(2026, 9, 4, 12);
    const draft = draftFor(); for (let i = 0; i < 4; i++) draft.lines.push({ ...draft.lines[0], id: randomUUID(), quantityText: String(11 + i) });
    await repo.logDraft(draft, sourceAt); const originals = structuredClone(repo.logs);
    await repo.logDraft(draftFor(), targetAt); const untouched = repo.logs.find(log => !originals.some(item => item.id === log.id))!;
    await repo.setDayComplete(dayKey(sourceAt), true); await repo.setDayComplete(dayKey(targetAt), true);
    const pending = draftFor(); await repo.saveDraft(pending);
    await repo.startMealEdit(originals.map(log => log.id)); const edit = structuredClone(repo.quickEntry.mealEdit!);
    edit.destination = { loggingDate: dayKey(targetAt), meal: 'Lunsj' }; await repo.saveMealEditDraft(edit);
    const rescue = await setup(await adapter()); await rescue.restoreJSON(await repo.exportJSON()); expect(rescue.quickEntry.mealEdit!.destination).toEqual(edit.destination); await rescue.commitMealEdit(edit.id); expect(rescue.logs.filter(log => originals.some(original => original.id === log.id)).every(log => dayKey(new Date(log.recordedAt)) === dayKey(targetAt))).toBe(true);
    const reopened = await setup(storage); expect(reopened.quickEntry.mealEdit!.destination).toEqual(edit.destination);
    await reopened.commitMealEdit(edit.id);
    expect(dayComplete(reopened.dayReviews, reopened.logs, dayKey(sourceAt))).toBe(false); expect(dayComplete(reopened.dayReviews, reopened.logs, dayKey(targetAt))).toBe(false);
    expect(reopened.logs).toHaveLength(6); expect(reopened.logs.find(log => log.id === untouched.id)).toEqual(untouched); expect(reopened.draft).toEqual(pending);
    for (const original of originals) {
      const moved = reopened.logs.find(log => log.id === original.id)!;
      expect(dayKey(new Date(moved.recordedAt))).toBe(dayKey(targetAt)); expect(moved.meal).toBe('Lunsj'); expect(moved.timePrecision).toBe('day');
      expect(moved.batchId).toBe(original.batchId); expect(moved.snapshot).toEqual(original.snapshot); expect(moved.nutrition).toEqual(original.nutrition);
      expect(moved.corrections!.at(-1)!.previous.recordedAt).toBe(original.recordedAt);
    }
    expect(reopened.mealCorrections.at(-1)!.previous).toEqual(originals);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON());
    expect(restored.logs).toEqual(expect.arrayContaining(reopened.logs));
    const again = await setup(storage); await again.undoLast(); expect(again.logs).toHaveLength(6); expect(again.logs).toEqual(expect.arrayContaining([...originals, untouched])); expect(dayComplete(again.dayReviews, again.logs, dayKey(sourceAt))).toBe(true); expect(dayComplete(again.dayReviews, again.logs, dayKey(targetAt))).toBe(true);
  });
  it('moving a saved serving changes its destination without consuming another portion or changing its measured recipe', async () => {
    const storage = await adapter(), repo = await setup(storage);
    const batch = await repo.createBatchFromDraft(draftFor(), 'Six portions', '6', '60');
    const original = await repo.logPreparedBatch(batch.id, '1', 'servings', new Date(2026, 9, 5, 18));
    await repo.startMealEdit([original.id]); const edit = structuredClone(repo.quickEntry.mealEdit!); edit.destination = { loggingDate: '2026-10-04', meal: 'Frokost' };
    await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
    expect(repo.logs).toHaveLength(1); expect(repo.logs[0].nutrition).toEqual(original.nutrition); expect(repo.logs[0].snapshot).toEqual(original.snapshot);
    expect(repo.logs[0].preparedBatchId).toBe(batch.id); expect(repo.preparedBatches[0]).toEqual(batch); expect(repo.logs[0].batchRecipe).toBe(original.batchRecipe);
    expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
    await repo.undoLast(); expect(repo.logs).toEqual([original]); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
  });
  it('a destination-only meal edit never backfills unknown fiber or changes mixed entry times unless selected', async () => {
    const storage = await adapter(), repo = await setup(storage), firstAt = new Date(2026, 9, 5, 8, 45), secondAt = new Date(2026, 9, 4, 19, 15);
    const legacy = draftFor(); legacy.lines[0].food = { ...oil, nutrition: { ...oil.nutrition } }; delete legacy.lines[0].food.nutrition.fiber;
    await repo.logDraft(legacy, firstAt); await repo.logDraft(draftFor(), secondAt); const original = structuredClone(repo.logs);
    await repo.startMealEdit(original.map(entry => entry.id)); const edit = structuredClone(repo.quickEntry.mealEdit!); edit.destination = { meal: 'Annet' };
    await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id);
    for (const before of original) { const after = repo.logs.find(entry => entry.id === before.id)!; expect(after.recordedAt).toBe(before.recordedAt); expect(after.nutrition).toEqual(before.nutrition); expect(after.snapshot).toEqual(before.snapshot); expect(after.meal).toBe('Annet'); }
    await repo.undoLast(); expect(repo.logs).toEqual(expect.arrayContaining(original));
  });
  it('failed and invalid whole-meal moves preserve the diary, original Undo and retained edit destination', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: (changes, revision) => fail && changes.some(change => change.type === 'put' && change.record.kind === 'log') ? Promise.reject(new Error('Fixture disk full')) : storage.commit(changes, revision) });
    await repo.logDraft(draftFor(), new Date(2026, 9, 5)); const before = structuredClone(repo.logs), undo = [...repo.undo];
    await repo.startMealEdit(before.map(entry => entry.id)); const edit = structuredClone(repo.quickEntry.mealEdit!); edit.destination = { loggingDate: '2026-10-04', meal: 'Lunsj' }; await repo.saveMealEditDraft(edit);
    fail = true; await expect(repo.commitMealEdit(edit.id)).rejects.toThrow('Fixture disk full'); expect(repo.logs).toEqual(before); expect(repo.undo).toEqual(undo); expect(repo.mealCorrections).toEqual([]);
    const reopened = await setup(storage); expect(reopened.quickEntry.mealEdit!.destination).toEqual(edit.destination); expect(reopened.logs).toEqual(before);
    const future = new Date(); future.setDate(future.getDate() + 1); edit.destination.loggingDate = dayKey(future); fail = false;
    await repo.saveMealEditDraft(edit); await expect(repo.commitMealEdit(edit.id)).rejects.toThrow('earlier date'); expect(repo.logs).toEqual(before); expect(repo.undo).toEqual(undo);
  });
  it('saving a no-op meal edit keeps the existing Undo and creates no invented correction history', async () => {
    const storage = await adapter(), repo = await setup(storage); await repo.logDraft(draftFor(), new Date(2026, 9, 5, 8, 45));
    const before = structuredClone(repo.logs), undo = [...repo.undo]; await repo.startMealEdit(before.map(entry => entry.id));
    const edit = structuredClone(repo.quickEntry.mealEdit!); edit.destination = { loggingDate: dayKey(new Date(before[0].recordedAt)), meal: before[0].meal };
    await repo.saveMealEditDraft(edit); await repo.commitMealEdit(edit.id); expect(repo.logs).toEqual(before); expect(repo.undo).toEqual(undo); expect(repo.mealCorrections).toEqual([]); expect(repo.quickEntry.mealEdit).toBeUndefined();
  });
  it('retains a dated draft and meal choice, logs the whole meal on that day and learns at confirmation time', async () => {
    const storage = await adapter(), repo = await setup(storage), now = new Date(2026, 10, 5, 9, 30);
    const draft = { ...draftFor(), loggingDate: '2026-11-04', meal: 'Frokost' as const };
    draft.lines.push({ ...draft.lines[0], id: randomUUID(), quantityText: '20' });
    await repo.saveDraft(draft);
    const reopened = await setup(storage); expect(reopened.draft).toEqual(draft);
    await reopened.logDraft(reopened.draft, now);
    expect(reopened.logs).toHaveLength(2);
    expect(reopened.logs.every(log => dayKey(new Date(log.recordedAt)) === '2026-11-04' && log.meal === 'Frokost' && log.timePrecision === 'day')).toBe(true);
    expect(reopened.logs.map(log => log.nutrition.kcal).sort()).toEqual(['178.4', '89.2']);
    expect(Object.values(reopened.quickEntry.matches).every(match => match.confirmedAt === now.toISOString())).toBe(true);
    expect(reopened.draft.meal).toBe('Frokost'); expect(reopened.draft.loggingDate).toBeUndefined();
    const again = await setup(storage); expect(again.draft.meal).toBe('Frokost'); expect(again.logs).toEqual(expect.arrayContaining(reopened.logs));
    await again.undoLast(); expect(again.logs).toHaveLength(0);
    const recovered = await setup(await adapter()); await recovered.restoreJSON(await reopened.exportJSON());
    expect(recovered.quickEntry.lastMeal).toBe('Frokost'); expect(recovered.logs).toEqual(expect.arrayContaining(reopened.logs));
  });
  it('backdated repeats and adjusted repeats retain source snapshots and remain one undoable meal', async () => {
    const storage = await adapter(), repo = await setup(storage);
    await repo.logDraft(draftFor()); const source = structuredClone(repo.logs[0]);
    await repo.repeatMeal([source.id], new Date(2026, 10, 4, 12), undefined, 'Lunsj');
    expect(repo.logs.find(log => log.id !== source.id)).toMatchObject({ meal: 'Lunsj', snapshot: source.snapshot, nutrition: source.nutrition });
    expect(repo.logs.find(log => log.id === source.id)).toEqual(source);
    await repo.undoLast(); expect(repo.logs).toEqual([source]);
    await repo.startRepeatReview([source.id], { loggingDate: '2026-11-03', meal: 'Frokost' });
    await repo.saveRepeatAmounts(repo.quickEntry.repeatReview!.id, ['20']);
    const reopened = await setup(storage); await reopened.logRepeatReview(reopened.quickEntry.repeatReview!.id, new Date(2026, 10, 5));
    const added = reopened.logs.find(log => log.id !== source.id)!;
    expect(dayKey(new Date(added.recordedAt))).toBe('2026-11-03'); expect(added.meal).toBe('Frokost'); expect(added.nutrition.kcal).toBe('178.4');
    await reopened.undoLast(); expect(reopened.logs).toEqual([source]);
  });
  it('backdating saved portions keeps finite capacity, exact fractions and correction date precision', async () => {
    const storage = await adapter(), repo = await setup(storage);
    const batch = await repo.createBatchFromDraft(draftFor(), 'Six portions', '6', '60');
    expect(repo.logs).toHaveLength(0);
    const source = await repo.logPreparedBatch(batch.id);
    await repo.startRepeatReview([source.id], { loggingDate: '2026-11-04', meal: 'Lunsj' });
    const id = repo.quickEntry.repeatReview!.id;
    await repo.saveRepeatAmounts(id, ['6']);
    await expect(repo.logRepeatReview(id, new Date(2026, 10, 5))).rejects.toThrow(); expect(repo.logs).toHaveLength(1);
    await repo.saveRepeatAmounts(id, ['1']); await repo.logRepeatReview(id, new Date(2026, 10, 5));
    const added = repo.logs.find(log => log.id !== source.id)!;
    expect(added.nutrition).toEqual(source.nutrition); expect(added.timePrecision).toBe('day'); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('4');
    await repo.correctLog(added.id, { quantity: '1' });
    expect(repo.logs.find(log => log.id === added.id)!.corrections![0].previous.timePrecision).toBe('day');
    await repo.undoLast(); expect(repo.logs).toEqual([source]); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
  });
  it('rejects a future date and rolls back destination preferences and voice acknowledgement on a failed write', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: async (...args) => { if (fail) throw new Error('Fixture failure'); return storage.commit(...args); } });
    await repo.saveVoiceDraft({ id: 'destination-command', text: 'Add 10g oil for yesterday', locale: 'en-US' });
    const before = structuredClone(repo.quickEntry), draft = { ...draftFor(), loggingDate: '2026-11-04', meal: 'Frokost' as const };
    fail = true; await expect(repo.logDraft(draft, new Date(2026, 10, 5), 'destination-command')).rejects.toThrow('Fixture failure');
    expect(repo.logs).toEqual([]); expect(repo.quickEntry).toEqual(before); expect(repo.undo).toEqual([]);
    fail = false; await expect(repo.logDraft({ ...draft, loggingDate: '2026-11-06' }, new Date(2026, 10, 5))).rejects.toThrow('earlier date');
    expect(repo.logs).toEqual([]); expect((await setup(storage)).quickEntry).toEqual(before);
  });
  it('retains interrupted commands, rescan evidence and corrections through reopening and backup restore', async () => {
    const storage = await adapter(), repo = await setup(storage);
    const voice = { id: randomUUID(), text: 'Add 200g chicken then split into six servings', locale: 'nb-NO' as const };
    await repo.saveVoiceDraft(voice);
    const scan = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 400 kcal\nFat 20 g', blocks: [] });
    const form = applyLabelColumn({ id: 'rescan-food', name: 'Retained food', barcode: '', basis: 'g', amount: '15', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } }, scan, 0);
    form.rescan = { ...scan, scannedAt: new Date().toISOString() }; form.values.fat = '23'; form.edited = ['fat'];
    await repo.saveLabelDraft('new:', form);
    const reopened = await setup(storage); expect(reopened.quickEntry.voiceDraft).toEqual(voice); expect(reopened.quickEntry.voiceLocale).toBe('nb-NO');
    expect(reopened.quickEntry.labelDrafts?.['new:']).toEqual(form); expect(reopened.logs).toEqual([]);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON());
    expect(restored.quickEntry.voiceDraft).toEqual(voice); expect(restored.quickEntry.labelDrafts?.['new:']).toEqual(form);
    await restored.close(); await reopened.close();
  });
  it('acknowledges commands in the food transaction, retries failures and ignores duplicate or stale results', async () => {
    const storage = await adapter(); let fail = false;
    const wrapper: StorageAdapter = { ...storage, load: () => storage.load(), close: () => storage.close(), commit: (changes, revision) => {
      if (fail) { fail = false; return Promise.reject(new Error('simulated write failure')); }
      return storage.commit(changes, revision);
    } };
    const repo = await setup(wrapper), voice = { id: randomUUID(), text: 'Add 10g olive oil', locale: 'en-US' as const }, draft = draftFor();
    await repo.saveVoiceDraft(voice); fail = true;
    await expect(repo.saveDraft(draft, voice.id)).rejects.toThrow('simulated write failure');
    expect(repo.quickEntry.voiceDraft).toEqual(voice); expect(repo.draft.lines).toEqual([]);
    await repo.saveDraft(draft, voice.id); expect(repo.quickEntry.voiceDraft).toBeNull();
    await repo.saveVoiceDraft(voice); expect(repo.quickEntry.voiceDraft).toBeNull();
    await repo.saveDraft(draftFor(), voice.id); expect(repo.draft).toEqual(draft);
    const log = { ...voice, id: randomUUID(), text: 'Log it' }; await repo.saveVoiceDraft(log);
    fail = true; await expect(repo.logDraft(draft, new Date(), log.id)).rejects.toThrow('simulated write failure');
    expect(repo.logs).toEqual([]); expect(repo.quickEntry.voiceDraft).toEqual(log);
    await repo.logDraft(draft, new Date(), log.id); await repo.logDraft(draft, new Date(), log.id);
    expect(repo.logs).toHaveLength(1); expect(repo.quickEntry.voiceDraft).toBeNull();
    const reopened = await setup(wrapper); expect(reopened.quickEntry.voiceDraft).toBeNull(); expect(reopened.logs).toHaveLength(1);
    await expect(reopened.repeatMeal([reopened.logs[0].id], new Date(), randomUUID())).rejects.toThrow('command has changed');
    await reopened.close();
  });
  it('repeats shortcuts, previous meals and finite portions exactly once per confirmed command', async () => {
    const storage = await adapter(), repo = await setup(storage), draft = draftFor(); await repo.logDraft(draft);
    const original = repo.logs[0], shortcut = await repo.saveShortcut('Oil shortcut', [original]);
    for (const kind of ['repeat', 'shortcut'] as const) {
      const voice = { id: randomUUID(), text: kind, locale: 'en-US' as const }; await repo.saveVoiceDraft(voice);
      const action = () => kind === 'repeat' ? repo.repeatMeal([original.id], new Date(), voice.id) : repo.logShortcut(shortcut.id, new Date(), voice.id);
      const before = repo.logs.length; await action(); await action(); expect(repo.logs).toHaveLength(before + 1); expect(repo.quickEntry.voiceDraft).toBeNull();
    }
    const batch = await repo.createBatchFromDraft(draftFor(), 'Six portions', '6', '60');
    const voice = { id: randomUUID(), text: 'Log one serving', locale: 'en-US' as const }; await repo.saveVoiceDraft(voice);
    const before = repo.logs.length;
    await repo.logPreparedBatch(batch.id, '1', 'servings', new Date(), undefined, voice.id);
    await repo.logPreparedBatch(batch.id, '1', 'servings', new Date(), undefined, voice.id);
    expect(repo.logs).toHaveLength(before + 1); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
    await repo.undoLast(); expect(repo.logs).toHaveLength(before); await repo.close();
  });
  it('retains audited meal corrections, editor drafts, weight history and correction Undo in the real adapter', async () => {
    const storage = await adapter(), repo = await setup(storage); await repo.logDraft(draftFor()); const original = structuredClone(repo.logs);
    await repo.startMealEdit(repo.logs.map(entry => entry.id)); const edit = structuredClone(repo.quickEntry.mealEdit!); edit.rows[0].amount = '15'; await repo.saveMealEditDraft(edit);
    const editing = await setup(storage); expect(editing.quickEntry.mealEdit?.rows[0].amount).toBe('15'); await editing.commitMealEdit(edit.id);
    await editing.saveWeighIn('2026-10-05', '80', 'kg', new Date('2026-10-05T12:00:00')); await editing.saveWeightDraft({ date: '2026-10-06', amount: '80,', unit: 'kg' });
    const reopened = await setup(storage); expect(reopened.mealCorrections[0].previous).toEqual(original); expect(reopened.undoLabel).toBe('Undo meal correction'); expect(reopened.weighIns[0].kg).toBe('80'); expect(reopened.quickEntry.weightDraft?.amount).toBe('80,');
    await reopened.undoLast(); expect(reopened.logs).toEqual(original);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON()); expect(restored.mealCorrections).toEqual(reopened.mealCorrections); expect(restored.weighIns).toEqual(reopened.weighIns); await restored.close(); await reopened.close();
  });
  it('persists named shortcuts, adjusted amounts, library archives and reviewed days in the real adapter', async () => {
    const storage = await adapter(), repo = await setup(storage), at = new Date('2026-10-05T12:00:00');
    const draft = draftFor(), shortcut = await repo.saveDraftShortcut('My breakfast', draft);
    expect(repo.logs).toEqual([]); await repo.logShortcut(shortcut.id, at);
    await repo.setDayComplete('2026-10-05', true, at); await repo.saveFood(oil); await repo.archiveLibrary('food', oil.id, true);
    await repo.startShortcutReview(shortcut.id); await repo.saveRepeatAmounts(repo.quickEntry.repeatReview!.id, ['15']);
    const reopened = await setup(storage);
    expect(reopened.shortcuts).toEqual(repo.shortcuts); expect(reopened.dayReviews).toEqual(repo.dayReviews);
    expect(reopened.quickEntry.repeatReview?.amounts).toEqual(['15']); expect(reopened.quickEntry.libraryHidden?.[`food:${oil.id}`]).toBe(true);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON());
    expect(restored.shortcuts).toEqual(repo.shortcuts); expect(restored.dayReviews).toEqual(repo.dayReviews);
    expect(restored.logs).toEqual(repo.logs); await restored.close(); await reopened.close();
  });
  it('retains scanned label drafts, atomically confirms them without eating food and keeps historical OCR snapshots', async () => {
    const storage = await adapter(), repo = await setup(storage); await repo.saveDraft(draftFor()); const active = structuredClone(repo.draft);
    const scan = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 400 kcal\nFat 20 g\nCarbohydrate 30 g\nProtein 25 g\nFiber 5 g', blocks: [] });
    const form = applyLabelColumn({ id: 'label-product', name: 'Reviewed test product', barcode: milkCode, basis: 'g', amount: '15', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } }, scan, 0);
    await repo.saveLabelDraft('new:label', form); const reopened = await setup(storage); expect(reopened.quickEntry.labelDrafts?.['new:label']).toEqual(form); expect(reopened.logs).toEqual([]);
    const food = reviewedLabelFood(form), draft = { ...reopened.draft, lines: [...reopened.draft.lines, { id: randomUUID(), query: food.name, food, quantityText: '15', unit: 'g' as const, entrySource: 'product' as const }] };
    await reopened.saveFood(food, draft, 'new:label'); expect(reopened.logs).toEqual([]); expect(reopened.draft.lines[0]).toEqual(active.lines[0]); expect(reopened.quickEntry.labelDrafts?.['new:label']).toBeUndefined();
    expect(matchIngredient(food.name, reopened.index, reopened.quickEntry).food).toBeNull();
    await reopened.logDraft(reopened.draft); const history = structuredClone(reopened.logs); expect(history.find(log => log.snapshot.kind === 'food' && log.snapshot.ingredient.food.id === food.id)?.nutrition).toEqual({ kcal: '60', protein: '3.75', carbohydrate: '4.5', fat: '3', fiber: '0.75' });
    expect(reopened.quickEntry.matches['reviewed test product']).toBeUndefined();
    const corrected = reviewedLabelFood({ ...form, values: { ...form.values, kcal: '410' } }, food); await reopened.saveFood(corrected); expect(reopened.logs).toEqual(history);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON()); expect(restored.foods.find(item => item.id === food.id)?.provenance.labelScan?.originalNutrition.kcal).toBe('400'); expect([...restored.logs].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...history].sort((a,b)=>a.id.localeCompare(b.id)));
    await restored.close(); await reopened.close();
  });
  it('failed label confirmation preserves the review draft and rejects duplicate canonical barcodes without partial changes', async () => {
    const storage = await adapter(); let fail = false; const repo = await setup({ ...storage, commit: (changes, revision) => fail ? Promise.reject(new Error('simulated disk failure')) : storage.commit(changes, revision) });
    const form = { id: 'scanned', name: 'Test label', barcode: milkCode, basis: 'g' as const, amount: '10', values: { kcal: '400', protein: '25', carbohydrate: '30', fat: '20', fiber: '' } };
    await repo.saveLabelDraft('new:label', form); const before = await repo.exportJSON(); fail = true;
    await expect(repo.saveFood(reviewedLabelFood(form), repo.draft, 'new:label')).rejects.toThrow('disk failure'); expect(await repo.exportJSON()).toBe(before);
    fail = false; await repo.saveFood({ ...reviewedLabelFood(form), id: 'other', barcode: '07038010001918' });
    await expect(repo.saveFood(reviewedLabelFood(form), repo.draft, 'new:label')).rejects.toThrow('already has'); expect(repo.quickEntry.labelDrafts?.['new:label']).toEqual(form); await repo.close();
  });
  it('saves a reviewed barcode and its draft atomically, reopens, logs exact ml nutrition and preserves historical snapshots', async () => {
    const storage = await adapter(), repo = await setup(storage); await repo.logDraft(draftFor()); const historical = structuredClone(repo.logs);
    const candidate = parseBarcodeProduct(milkProduct(), milkCode)!;
    const { food } = confirmBarcodeProduct(candidate, { name: 'TINE milk', referenceUnit: 'ml', amount: '250', nutrition: { kcal: '37', protein: '3.6', carbohydrate: '4.7', fat: '0.5', fiber: '' } });
    await repo.addBarcodeFood(food, emptyDraft(randomUUID), '250'); expect(repo.logs).toEqual(historical);
    const reopened = await setup(storage); expect(reopened.foods.find(item => item.barcode === milkCode)).toEqual(food);
    expect(reopened.draft.lines[0].quantityText).toBe('250'); expect(reopened.draft.lines[0].unit).toBe('ml');
    await reopened.logDraft(reopened.draft); expect(reopened.logs.find(log => log.snapshot.kind === 'food' && log.snapshot.ingredient.food.id === food.id)?.nutrition).toEqual({ kcal: '92.5', protein: '9', carbohydrate: '11.75', fat: '1.25', fiber: null });
    expect(reopened.quickEntry.matches['tine milk']).toBeUndefined();
    await reopened.undoLast(); expect(reopened.logs).toEqual(historical);
    await reopened.logDraft({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), query: food.name, food, quantityText: '100', unit: 'ml', entrySource: 'product' }] }); expect(reopened.quickEntry.matches['tine milk']).toBeUndefined(); await reopened.undoLast();
    const typed = updateLiveText('100ml low fat milk', emptyDraft(randomUUID), reopened.index, reopened.quickEntry, randomUUID); expect(typed.lines[0].food).toBeNull();
    await reopened.logDraft(editLiveLine(typed, typed.lines[0].id, { food })); expect(reopened.quickEntry.matches['low fat milk'].foodId).toBe(food.id); await reopened.undoLast();
    await reopened.saveFood({ ...food, nutrition: { ...food.nutrition, kcal: '38' } }); expect(reopened.logs).toEqual(historical);
    const archive = await reopened.exportJSON(); const restored = await setup(await adapter()); await restored.restoreJSON(archive);
    expect(restored.foods.find(item => item.barcode === milkCode)?.provenance.labelReview).toEqual(food.provenance.labelReview);
    await restored.saveFood({ ...food, nutrition: { ...food.nutrition, kcal: '39' } });
    await restored.restoreJSON(archive, { recoverMissing: true }); expect(restored.foods.find(item => item.id === food.id)?.nutrition.kcal).toBe('39');
    await restored.restoreJSON(archive); expect(restored.foods.find(item => item.id === food.id)?.nutrition.kcal).toBe('38'); expect(restored.logs).toEqual(historical);
    await restored.close(); await reopened.close();
  });
  it('does not partially save a product or draft if the write fails, and rejects equivalent duplicate barcodes', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: (changes, revision) => fail ? Promise.reject(new Error('simulated disk failure')) : storage.commit(changes, revision) });
    const { food } = confirmBarcodeProduct(parseBarcodeProduct(milkProduct(), milkCode)!, { name: 'TINE milk', referenceUnit: 'ml', amount: '100', nutrition: { kcal: '37', protein: '3.6', carbohydrate: '4.7', fat: '0.5', fiber: '' } });
    const original = repo.draft; fail = true; await expect(repo.addBarcodeFood(food, original)).rejects.toThrow('disk failure'); expect(repo.foods).toEqual([]); expect(repo.draft).toEqual(original);
    fail = false; await repo.saveFood({ ...food, id: 'local-label', barcode: '07038010001918' });
    await expect(repo.addBarcodeFood(food, original)).rejects.toThrow('already linked'); expect(repo.draft).toEqual(original); expect(repo.foods).toHaveLength(1);
    // Existing installations could already contain differently padded codes.
    // Adding an explicit existing record must not delete or block those foods.
    await repo.saveFood(food); await repo.addBarcodeFood(food, original); expect(repo.foods).toHaveLength(2); expect(repo.draft.lines[0].food?.id).toBe(food.id);
    const before = structuredClone({ foods: repo.foods, draft: repo.draft }); fail = true;
    const corrected = { ...food, nutrition: { ...food.nutrition, kcal: '39' } };
    await expect(repo.saveFood(corrected, { ...repo.draft, lines: repo.draft.lines.map(line => ({ ...line, food: corrected })) })).rejects.toThrow('disk failure');
    expect(repo.foods).toEqual(before.foods); expect(repo.draft).toEqual(before.draft); await repo.close();
  });
  it('persists an adjusted repeat separately, preserves source snapshots and draft, and logs/undoes it atomically', async () => {
    const storage = await adapter(), repo = await setup(storage), source = draftFor();
    const ordered = (logs: typeof repo.logs) => [...logs].sort((a, b) => a.id.localeCompare(b.id));
    source.lines.push({ ...source.lines[0], id: randomUUID(), quantityText: '20' });
    await repo.logDraft(source, new Date('2026-11-03T08:00:00Z')); const original = structuredClone(repo.logs);
    await repo.saveDraft({ ...draftFor(), text: 'unfinished' }); const active = structuredClone(repo.draft);
    await repo.startRepeatReview(original.map(log => log.id)); const reviewId = repo.quickEntry.repeatReview!.id;
    expect(repo.logs).toEqual(original); await repo.saveRepeatAmounts(reviewId, ['15', '20']);
    const reopened = await setup(storage); expect(reopened.quickEntry.repeatReview!.amounts).toEqual(['15', '20']); expect(reopened.draft).toEqual(active);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON()); expect(restored.quickEntry.repeatReview!.amounts).toEqual(['15', '20']);
    await restored.saveRepeatAmounts(reviewId, ['16', '20']); await restored.restoreJSON(await reopened.exportJSON(), { recoverMissing: true }); expect(restored.quickEntry.repeatReview!.amounts).toEqual(['16', '20']);
    await reopened.saveRepeatAmounts(reviewId, ['', '20']); await expect(reopened.logRepeatReview(reviewId)).rejects.toThrow('amounts'); expect(ordered(reopened.logs)).toEqual(ordered(original));
    await reopened.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '1' } });
    await reopened.saveRepeatAmounts(reviewId, ['15', '20']); await reopened.logRepeatReview(reviewId);
    expect(reopened.logs.filter(log => !original.some(before => before.id === log.id)).map(log => log.nutrition.kcal).sort()).toEqual(['133.8', '178.4']);
    expect(reopened.quickEntry.repeatReview).toBeUndefined(); expect(reopened.draft).toEqual(active); expect(reopened.undo).toHaveLength(2);
    await expect(reopened.logRepeatReview(reviewId)).rejects.toThrow('no longer open');
    await reopened.undoLast(); expect(ordered(reopened.logs)).toEqual(ordered(original)); expect(reopened.draft).toEqual(active);
    await restored.close(); await reopened.close();
  });
  it('an adjusted saved-serving repeat consumes exact inventory and blocks overdrawing without losing its edits', async () => {
    const repo = await setup(await adapter());
    const recipe: Recipe = { id: randomUUID(), name: 'Finite batch', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: '600', steps: [], favorite: false };
    const batch = await repo.createPreparedBatch(recipe); await repo.logPreparedBatch(batch.id);
    const original = structuredClone(repo.logs); await repo.startRepeatReview([original[0].id]); const reviewId = repo.quickEntry.repeatReview!.id;
    await repo.saveRepeatAmounts(reviewId, ['6']); await expect(repo.logRepeatReview(reviewId)).rejects.toThrow();
    expect(repo.logs).toEqual(original); expect(repo.quickEntry.repeatReview!.amounts).toEqual(['6']);
    await repo.saveRepeatAmounts(reviewId, ['3']); await repo.logRepeatReview(reviewId); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('2');
    const added = repo.logs.find(log => log.id !== original[0].id)!; expect(added.preparedBatchId).toBe(batch.id); expect(added.nutrition.kcal).toBe('267.6');
    await repo.undoLast(); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5'); expect(repo.logs).toEqual(original); await repo.close();
  });
  it('failed adjusted-repeat writes keep the draft, diary and previous undo and reject stale editors', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: (changes, revision) => fail ? Promise.reject(new Error('simulated disk failure')) : storage.commit(changes, revision) });
    await repo.logDraft(draftFor()); await repo.startRepeatReview([repo.logs[0].id]); const id = repo.quickEntry.repeatReview!.id;
    const before = structuredClone({ logs: repo.logs, undo: repo.undo, preferences: repo.quickEntry }); fail = true;
    await expect(repo.saveRepeatAmounts(id, ['15'])).rejects.toThrow('disk failure'); await expect(repo.logRepeatReview(id)).rejects.toThrow('disk failure');
    expect({ logs: repo.logs, undo: repo.undo, preferences: repo.quickEntry }).toEqual(before);
    fail = false; await expect(repo.startRepeatReview([repo.logs[0].id])).rejects.toThrow('Finish or cancel');
    await repo.cancelRepeatReview(id); await expect(repo.saveRepeatAmounts(id, ['15'])).rejects.toThrow('no longer open'); expect(repo.logs).toEqual(before.logs); await repo.close();
  });
  it('deletes only chosen entries and restores exact corrected snapshots, unknowns and IDs', async () => {
    const repo = await setup(await adapter()), draft = draftFor();
    draft.lines[0].food = { ...oil, nutrition: { ...oil.nutrition, fiber: null } };
    await repo.logDraft(draft, new Date('2026-10-05T12:00:00Z')); const id = repo.logs[0].id;
    await repo.correctLog(id, { quantity: '20' }); await repo.logDraft(draftFor());
    await repo.saveDraft(draftFor()); const before = JSON.parse(await repo.exportJSON()), entry = structuredClone(repo.logs.find(log => log.id === id)!);
    await repo.deleteLogs([id]);
    expect(JSON.parse(await repo.exportJSON())).toEqual({ ...before, logs: before.logs.filter((log: { id: string }) => log.id !== id) });
    expect(repo.undoLabel).toBe('Undo deletion');
    await repo.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '1' } });
    await repo.undoLast(); expect(repo.logs.find(log => log.id === id)).toEqual(entry);
    expect(entry.nutrition.kcal).toBe('178.4'); expect(entry.nutrition.fiber).toBeNull(); expect(repo.undo).toEqual([]);
    await repo.close();
  });
  it('deletes a whole meal atomically, deduplicates selected IDs and rejects stale selections', async () => {
    const repo = await setup(await adapter()), draft = draftFor();
    draft.lines.push({ ...draft.lines[0], id: randomUUID(), quantityText: '20' });
    await repo.logDraft(draft, new Date('2026-10-05T12:00:00Z')); const meal = structuredClone(repo.logs), ids = meal.map(log => log.id);
    await repo.logDraft(draftFor()); const all = structuredClone(repo.logs);
    await expect(repo.deleteLogs([ids[0], 'missing'])).rejects.toThrow('no longer available'); expect(repo.logs).toEqual(all);
    await expect(repo.deleteLogs([])).rejects.toThrow('Choose');
    await repo.deleteLogs([...ids, ids[0]]); expect(repo.logs).toHaveLength(1); expect(repo.undo).toHaveLength(2);
    await repo.undoLast(); expect(repo.logs).toEqual(all); await repo.close();
  });
  it('keeps failed delete and restore writes from changing the diary or its undo action', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: (changes, revision) => fail ? Promise.reject(new Error('simulated disk failure')) : storage.commit(changes, revision) });
    await repo.logDraft(draftFor()); const before = structuredClone(repo.logs), originalUndo = [...repo.undo];
    fail = true; await expect(repo.deleteLogs([before[0].id])).rejects.toThrow('disk failure');
    expect(repo.logs).toEqual(before); expect(repo.undo).toEqual(originalUndo); expect(repo.isDeletionUndo).toBe(false);
    fail = false; await repo.deleteLogs([before[0].id]);
    fail = true; await expect(repo.undoLast()).rejects.toThrow('disk failure'); expect(repo.logs).toEqual([]); expect(repo.isDeletionUndo).toBe(true);
    fail = false; await repo.undoLast(); expect(repo.logs).toEqual(before); await repo.close();
  });
  it('replaces deletion undo with the next log for every logging path', async () => {
    for (const kind of ['draft', 'repeat', 'recipe', 'portion']) {
      const storage = await adapter(), repo = await setup(storage);
      await repo.logDraft(draftFor()); const deleted = repo.logs[0]; await repo.logDraft(draftFor()); const surviving = repo.logs.find(log => log.id !== deleted.id)!;
      await repo.deleteLogs([deleted.id]);
      const recipe: Recipe = { id: randomUUID(), name: 'Test batch', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: null, steps: [], favorite: false };
      if (kind === 'draft') await repo.logDraft(draftFor());
      else if (kind === 'repeat') await repo.repeat(surviving);
      else if (kind === 'recipe') await repo.logRecipe(recipe);
      else { const batch = await repo.createPreparedBatch(recipe); await repo.logPreparedBatch(batch.id); }
      const reopened = await setup(storage); expect(reopened.undoLabel).toBe('Undo last log');
      await reopened.undoLast(); expect(reopened.logs).toEqual([surviving]); expect(reopened.logs.some(log => log.id === deleted.id)).toBe(false); await reopened.close();
    }
  });
  it('returns deleted servings to inventory and refuses an undo that would overdraw a corrected batch', async () => {
    const repo = await setup(await adapter());
    const recipe: Recipe = { id: randomUUID(), name: 'Finite batch', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: null, steps: [], favorite: false };
    const batch = await repo.createPreparedBatch(recipe), first = await repo.logPreparedBatch(batch.id), second = await repo.logPreparedBatch(batch.id, '2');
    await repo.deleteLogs([first.id]); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('4');
    await repo.correctLog(second.id, { quantity: '6' }); await expect(repo.undoLast()).rejects.toThrow('exceeds');
    expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('0'); expect(repo.isDeletionUndo).toBe(true);
    await repo.correctLog(second.id, { quantity: '2' }); await repo.undoLast();
    expect(repo.logs.find(log => log.id === first.id)).toEqual(first); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('3'); await repo.close();
  });
  it('exports only active entries and clears deletion undo when merging a backup', async () => {
    const storage = await adapter(), repo = await setup(storage); await repo.logDraft(draftFor());
    const before = await repo.exportJSON(), original = structuredClone(repo.logs);
    await repo.deleteLogs([original[0].id]); const backup = JSON.parse(await repo.exportJSON()); expect(backup.logs).toEqual([]);
    const fresh = await setup(await adapter()); await fresh.restoreJSON(JSON.stringify(backup)); expect(fresh.undo).toEqual([]); expect(fresh.logs).toEqual([]);
    await repo.restoreJSON(before); expect(repo.logs).toEqual(original); expect(repo.undo).toEqual([]);
    const reopened = await setup(storage); expect(reopened.isDeletionUndo).toBe(false); await fresh.close(); await reopened.close();
  });
  it('persists dated targets, preserves food snapshots and restores optional target history safely', async () => {
    const storage = await adapter(), repo = await setup(storage);
    await repo.logDraft(draftFor()); const logs = structuredClone(repo.logs);
    const old = await repo.saveTargets({ ...emptyTargets(), kcal: '2000', fiber: '30' }, new Date(2026, 9, 28, 12));
    const current = await repo.saveTargets({ ...emptyTargets(), kcal: '2300', protein: '150' }, new Date(2026, 10, 3, 12));
    const reopened = await setup(storage);
    expect(targetOn(reopened.targets, '2026-10-29')).toEqual(old);
    expect(targetOn(reopened.targets, '2026-11-03')).toEqual(current);
    expect(reopened.logs).toEqual(logs);
    const restored = await setup(await adapter()); await restored.restoreJSON(await reopened.exportJSON());
    expect(restored.targets).toEqual(reopened.targets);
    const backup = JSON.parse(await reopened.exportJSON()); backup.targets[1].values.kcal = '9999';
    await restored.restoreJSON(JSON.stringify(backup)); expect(targetOn(restored.targets, '2026-11-03')?.values.kcal).toBe('2300');
    delete backup.targets; await restored.restoreJSON(JSON.stringify(backup)); expect(restored.targets).toHaveLength(2);
    const legacy = await setup(await adapter()); await legacy.restoreJSON(JSON.stringify(backup)); expect(legacy.targets).toEqual([]);
    await restored.saveTargets(emptyTargets(), new Date(2026, 10, 4, 12));
    expect(targetOn(restored.targets, '2026-11-03')).toEqual(current);
    expect(targetOn(restored.targets, '2026-11-04')?.values).toEqual(emptyTargets());
    expect(restored.logs).toEqual(logs);
    backup.targets = [{ ...old, values: { ...old.values, kcal: '-1' } }];
    expect(() => restored.restoreJSON(JSON.stringify(backup))).toThrow();
    await legacy.close(); await restored.close(); await reopened.close();
  });
  it('orders rapid target edits and does not mutate targets after a failed commit', async () => {
    const storage = await adapter(), repo = await setup(storage), stale = await setup(storage);
    const at = new Date(2026, 10, 3, 12);
    const first = await repo.saveTargets({ ...emptyTargets(), kcal: '2000' }, at);
    const last = await repo.saveTargets({ ...emptyTargets(), kcal: '2200' }, at);
    expect(last.recordedAt > first.recordedAt).toBe(true);
    expect(targetOn(repo.targets, '2026-11-03')).toEqual(last);
    await expect(stale.saveTargets({ ...emptyTargets(), kcal: '1000' }, at)).rejects.toThrow('Data changed');
    expect(stale.targets).toEqual([]);
    await repo.close();
  });
  it('remembers entry method through logging, relaunch and backup without altering food snapshots', async () => {
    const storage = await adapter(), repo = await setup(storage);
    await repo.saveEntryMethod('voice');
    await repo.logDraft(draftFor());
    const original = structuredClone(repo.logs);
    await repo.saveEntryMethod('scan');
    const reopened = await setup(storage);
    expect(reopened.quickEntry.entryMethod).toBe('scan');
    expect(reopened.logs).toEqual(original);
    const restored = await setup(await adapter());
    await restored.restoreJSON(await reopened.exportJSON());
    expect(restored.quickEntry.entryMethod).toBe('scan');
    expect(restored.logs).toEqual(original);
    // Old backups have no entry preference and remain valid.
    const legacy = JSON.parse(await reopened.exportJSON()); delete legacy.quickEntry.entryMethod;
    await restored.restoreJSON(JSON.stringify(legacy));
    expect(restored.quickEntry.entryMethod).toBe('scan');
    const fresh = await setup(await adapter()); await fresh.restoreJSON(JSON.stringify(legacy));
    expect(fresh.quickEntry.entryMethod).toBeUndefined(); await fresh.close();
    expect(restored.logs).toEqual(original);
    await restored.close(); await reopened.close();
  });
  it('preserves legacy fiber absence in snapshots while new official selections gain sourced fiber', async () => {
    const legacyFood = structuredClone(catalog.find(f => f.id === 'mvt:05.016')!);
    delete legacyFood.nutrition.fiber; delete legacyFood.provenance.nutrientSources.fiber;
    const original = await setup(await adapter());
    const oldDraft = { ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), query: 'pasta', quantityText: '150', unit: 'g' as const, food: legacyFood }] };
    await original.logDraft(oldDraft);
    const legacyRecipe: Recipe = { id: randomUUID(), name: 'Older pasta batch', ingredients: [{ id: randomUUID(), food: legacyFood, quantity: '150', unit: 'g' }], steps: [], servings: '6', cookedWeightGrams: '600', favorite: false };
    await original.createPreparedBatch(legacyRecipe);
    const archive = JSON.parse(await original.exportJSON());
    delete archive.logs[0].nutrition.fiber;
    const storage = await adapter(), upgraded = await setup(storage);
    await upgraded.restoreJSON(JSON.stringify(archive));
    expect(upgraded.logs).toEqual(archive.logs);
    expect(upgraded.preparedBatches).toEqual(archive.preparedBatches);
    expect(upgraded.foods[0].nutrition.fiber).toBeUndefined();
    expect(matchIngredient('pasta', upgraded.index, upgraded.quickEntry).food?.nutrition.fiber).toBe('4.0');
    await upgraded.repeat(upgraded.logs[0]);
    expect(upgraded.logs.find(log => log.id !== archive.logs[0].id)!.nutrition.fiber).toBeNull();
    await upgraded.undoLast();
    await upgraded.logPreparedBatch(upgraded.preparedBatches[0].id);
    expect(upgraded.logs.find(log => !!log.preparedBatchId)!.nutrition.fiber).toBeNull();
    await upgraded.undoLast();
    const draft = updateLiveText('150g pasta', emptyDraft(randomUUID), upgraded.index, upgraded.quickEntry, randomUUID);
    expect(draft.lines[0].food?.nutrition.fiber).toBe('4.0');
    await upgraded.logDraft(draft);
    expect(upgraded.logs.find(log => log.id === draft.lines[0].id)!.nutrition.fiber).toBe('6');
    expect(upgraded.logs.find(log => log.id === archive.logs[0].id)).toEqual(archive.logs[0]);
    const reopened = await setup(storage); expect(reopened.logs).toEqual(upgraded.logs);
    const backup = JSON.parse(await reopened.exportJSON());
    const current = backup.logs.find((log: { id: string }) => log.id === draft.lines[0].id);
    current.nutrition.fiber = '999';
    expect(() => reopened.restoreJSON(JSON.stringify(backup))).toThrow('invalid nutrition calculation');
    await original.close(); await reopened.close();
  });
  it('completes actual-food find → quantity → save → log → repeat → undo', async () => {
    const repo = await setup(await adapter()); expect(repo.index.search('olivenolje')[0].id).toBe(oil.id);
    await repo.saveFood(oil); await repo.logDraft(draftFor()); expect(repo.logs[0].nutrition.kcal).toBe('89.2');
    await repo.repeat(repo.logs[0]); expect(repo.logs).toHaveLength(2);
    await repo.undoLast(); expect(repo.logs).toHaveLength(1); expect(repo.index.isSaved(oil.id)).toBe(true); await repo.close();
  });
  it('preserves draft corrections and historical snapshots after food changes', async () => {
    const repo = await setup(await adapter()), draft = draftFor();
    draft.lines[0].quantityText = '15,5'; await repo.saveDraft(draft); await repo.logDraft(draft);
    const original = repo.logs[0]; await repo.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '100' } });
    await repo.repeat(original); expect(repo.logs[0].nutrition.kcal).toBe('138.26'); expect(repo.draft.lines).toHaveLength(0); await repo.close();
  });
  it('makes retrying a draft idempotent, while an intentional repeat has new identity', async () => {
    const repo = await setup(await adapter()), draft = draftFor();
    await Promise.all([repo.logDraft(draft), repo.logDraft(draft)]); expect(repo.logs).toHaveLength(1);
    await repo.repeat(repo.logs[0]); expect(new Set(repo.logs.map(l => l.id)).size).toBe(2); await repo.close();
  });
  it('rejects unresolved and mixed-invalid batches without erasing drafts', async () => {
    const repo = await setup(await adapter()), draft = draftFor();
    draft.lines.push({ ...draft.lines[0], id: randomUUID(), quantityText: '0' }); await repo.saveDraft(draft);
    await expect(repo.logDraft(draft)).rejects.toThrow(); expect(repo.logs).toHaveLength(0); expect(repo.draft.lines).toHaveLength(2); await repo.close();
  });
  it('rejects duplicate barcodes atomically', async () => {
    const repo = await setup(await adapter()); const food = { ...oil, barcode: '1234567890123' };
    await repo.saveFood(food); await expect(repo.saveFood({ ...food, id: 'other' })).rejects.toThrow('barcode'); expect(repo.foods).toHaveLength(1); await repo.close();
  });
  it('persists recipes, duplicates independently and snapshots portion logs', async () => {
    const repo = await setup(await adapter());
    const recipe: Recipe = { id: randomUUID(), name: 'Oil test portion', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], steps: ['Test fixture only'], servings: '6', cookedWeightGrams: '60', favorite: true, photo: 'data:image/png;base64,aGVsbG8=' };
    await repo.saveRecipe(recipe); await repo.logRecipe(recipe); expect(repo.logs[0].nutrition.kcal).toBe('89.2');
    expect(repo.recipes[0].photo).toBe(recipe.photo); expect(repo.logs[0].snapshot.kind === 'recipe' && repo.logs[0].snapshot.recipe.photo).toBeUndefined();
    await repo.saveRecipe({ ...recipe, servings: '3' }); expect(repo.logs[0].nutrition.kcal).toBe('89.2');
    await repo.duplicate(recipe); expect(repo.recipes).toHaveLength(2); expect(repo.recipes[0].id).not.toBe(repo.recipes[1].id); await repo.close();
  });
  it('stores corrections and first-use metadata atomically through the shared adapter', async () => {
    const repo = await setup(await adapter());
    await repo.logDraft(draftFor(), new Date('2026-10-10T12:00:00Z')); const id = repo.logs[0].id;
    await repo.correctLog(id, { quantity: '20', recordedAt: '2026-09-10T12:00:00Z' });
    expect(repo.logs[0].nutrition.kcal).toBe('178.4'); expect(repo.logs[0].corrections?.[0].previous.nutrition.kcal).toBe('89.2');
    expect(repo.profile.firstUsedAt).toBe('2026-09-10T12:00:00Z');
    const restored = await setup(await adapter()); await restored.restoreJSON(await repo.exportJSON());
    expect(restored.logs[0].corrections).toHaveLength(1); expect(restored.profile.firstUsedAt).toBe(repo.profile.firstUsedAt);
    await repo.close(); await restored.close();
  });
  it('exports/restores without duplicate history and protects the active draft', async () => {
    const repo = await setup(await adapter()); await repo.logDraft(draftFor()); const backup = await repo.exportJSON();
    const restored = await setup(await adapter()); const draft = { ...emptyDraft(randomUUID), text: 'unfinished' }; await restored.saveDraft(draft);
    await restored.restoreJSON(backup); await restored.restoreJSON(backup); expect(restored.logs).toEqual(repo.logs); expect(restored.draft.text).toBe('unfinished');
    await restored.close(); await repo.close();
  });
  it('rejects corrupted nutrition in a backup without a partial restore', async () => {
    const repo = await setup(await adapter()); await repo.logDraft(draftFor()); const backup = JSON.parse(await repo.exportJSON());
    backup.logs[0].nutrition.kcal = '999'; const fresh = await setup(await adapter());
    expect(() => fresh.restoreJSON(JSON.stringify(backup))).toThrow(); expect(fresh.logs).toHaveLength(0); expect(fresh.foods).toHaveLength(0); await repo.close(); await fresh.close();
  });
  it('learns confirmed corrections, repeats all rows atomically, undoes and restores preferences', async () => {
    const repo = await setup(await adapter());
    let draft = reviewInput({ kind: 'text', text: '200g chicken, 150g pasta, 15g pesto, 10g olive oil' }, repo.draft, repo.index, repo.quickEntry, randomUUID);
    expect(draft.lines.filter(l => !l.food)).toHaveLength(3);
    const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', oil.id];
    draft.lines = draft.lines.map((line, i) => ({ ...line, food: repo.index.get(ids[i])! }));
    draft.lines[0].quantityText = '250';
    await repo.saveDraft(draft); expect(repo.quickEntry.matches.chicken).toBeUndefined();
    await repo.logDraft(draft); expect(repo.logs).toHaveLength(4);
    expect(draft.lines.map(l => l.quantityText)).toEqual(['250', '150', '15', '10']);
    expect(matchIngredient('chicken', repo.index, repo.quickEntry).food?.id).toBe(ids[0]);
    await repo.toggleFavorite(oil);
    const original = repo.logs.map(l => l.id); const previous = repo.logs.map(l => l.nutrition);
    await repo.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '100' } });
    await repo.repeatMeal(original); expect(repo.logs).toHaveLength(8); expect(repo.undo).toHaveLength(4);
    expect(new Set(repo.logs.filter(l => repo.undo.includes(l.id)).map(l => l.batchId)).size).toBe(1);
    expect(repo.logs.filter(l => repo.undo.includes(l.id)).map(l => l.nutrition)).toEqual(previous);
    expect(recentMealBatches(repo.logs)).toHaveLength(1);
    await repo.undoLast(); expect(repo.logs.map(l => l.id)).toEqual(original);
    const restored = await setup(await adapter()); await restored.restoreJSON(await repo.exportJSON());
    expect(restored.quickEntry).toEqual(repo.quickEntry);
    const familiar = reviewInput({ kind: 'text', text: '200g chicken, 150g pasta, 15g pesto, 10g olive oil' }, restored.draft, restored.index, restored.quickEntry, randomUUID);
    expect(familiar.lines.every(l => l.food)).toBe(true);
    const corrected = { ...familiar, lines: familiar.lines.map((l, i) => i === 0 ? { ...l, food: oil } : l) };
    await restored.logDraft(corrected); expect(restored.quickEntry.matches.chicken.foodId).toBe(oil.id);
    expect(repo.quickEntry.matches.chicken.foodId).toBe(ids[0]);
    await expect(repo.repeatMeal([original[0], 'missing'])).rejects.toThrow('no longer'); expect(repo.logs).toHaveLength(4);
    await restored.close(); await repo.close();
  });
  it('does not learn or partially log when storage rejects the meal transaction', async () => {
    const storage = await adapter(); let fail = false;
    const repo = await setup({ ...storage, commit: (changes, revision) => fail && changes.some(c => c.type === 'put' && c.record.kind === 'log') ? Promise.reject(new Error('disk full')) : storage.commit(changes, revision) });
    const draft = draftFor(); await repo.saveDraft(draft); fail = true;
    await expect(repo.logDraft(draft)).rejects.toThrow('disk full');
    expect(repo.logs).toHaveLength(0); expect(repo.quickEntry.matches).toEqual({}); expect(repo.draft).toEqual(draft);
    const persisted = await storage.load(); expect(persisted.records.some(r => r.kind === 'log' || r.kind === 'quickEntry')).toBe(false);
    fail = false; await repo.logDraft(draft); const before = repo.logs;
    fail = true; await expect(repo.repeatMeal(before.map(l => l.id))).rejects.toThrow('disk full');
    expect(repo.logs).toEqual(before); expect(repo.undo).toHaveLength(1); await repo.close();
  });
  it('persists live rows and corrected products in backups, rejects stale text, and logs directly with batch undo', async () => {
    const repo = await setup(await adapter());
    let draft = updateLiveText('200g chicken, 10g olive oil', repo.draft, repo.index, repo.quickEntry, randomUUID);
    draft = editLiveLine(draft, draft.lines[0].id, { food: repo.index.get('mvt:03.205')!, quantityText: '250' });
    await repo.saveDraft(draft);
    const restored = await setup(await adapter()); await restored.restoreJSON(await repo.exportJSON());
    expect(restored.draft).toEqual(draft); expect(restored.draft.text).toBe('250g chicken, 10g olive oil');
    await expect(restored.logDraft({ ...restored.draft, text: restored.draft.text + ', 15g pesto' })).rejects.toThrow('every ingredient');
    expect(restored.logs).toHaveLength(0); expect(restored.draft).toEqual(draft);
    await restored.logDraft(restored.draft); expect(restored.logs).toHaveLength(2); expect(restored.undo).toHaveLength(2);
    expect(restored.draft.text).toBe(''); expect(restored.draft.textRows).toBeUndefined();
    expect(restored.quickEntry.matches.chicken.foodId).toBe('mvt:03.205');
    await restored.undoLast(); expect(restored.logs).toHaveLength(0); await restored.close(); await repo.close();
  });
  it('creates six saved portions without eating them, logs exact shares, preserves snapshots and guards inventory', async () => {
    const repo = await setup(await adapter());
    const ids = ['mvt:03.205', 'mvt:05.016', 'mvt:06.144', 'mvt:08.019', 'mvt:01.200'];
    const draft = reviewInput({ kind: 'text', text: '200g chicken breast, 150g dry pasta, 15g pesto, 10g olive oil, 50g parmesan' }, repo.draft, repo.index, repo.quickEntry, randomUUID);
    draft.lines = draft.lines.map((line, i) => ({ ...line, food: repo.index.get(ids[i])! }));
    await repo.saveDraft(draft); const batch = await repo.createBatchFromDraft(draft, 'Six serving batch', '6', '600');
    expect(repo.logs).toHaveLength(0); expect(repo.draft.lines).toHaveLength(0); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('6');
    await expect(repo.logDraft(draft)).rejects.toThrow('saved as a batch');
    await repo.createBatchFromDraft(draft, 'Retry', '6', '600'); expect(repo.preparedBatches).toHaveLength(1);
    const all = recipeTotal(batch.recipe); await repo.logPreparedBatch(batch.id, '1', 'servings', new Date('2026-10-23T12:00:00Z'));
    for (const key of nutrients) expect(repo.logs[0].nutrition[key]).toBe(new D(all[key]!).div(6).toFixed());
    const original = repo.logs[0], originalNutrition = { ...original.nutrition };
    await repo.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '100' } });
    await repo.saveRecipe({ ...batch.recipe, servings: '12', cookedWeightGrams: '1200' });
    await repo.logPreparedBatch(batch.id, '2', 'servings', new Date('2026-10-24T12:00:00Z'));
    expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('3'); expect(repo.logs.find(log => log.id === original.id)?.nutrition).toEqual(originalNutrition);
    const restored = await setup(await adapter()); await restored.restoreJSON(await repo.exportJSON());
    expect(restored.preparedBatches).toEqual(repo.preparedBatches); expect(batchBalance(restored.preparedBatches[0], restored.logs).servings.toFixed()).toBe('3');
    await repo.undoLast(); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('5');
    await repo.repeat(original); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('4');
    await expect(repo.correctLog(original.id, { quantity: '6' })).rejects.toThrow('exceeds'); expect(repo.logs.find(log => log.id === original.id)?.snapshot).toEqual(original.snapshot);
    await repo.correctLog(original.id, { quantity: '2' }); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('3');
    await repo.undoLast(); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('4');
    await repo.logPreparedBatch(batch.id, '400', 'g'); expect(batchBalance(batch, repo.logs).numerator.toFixed()).toBe('0');
    await expect(repo.logPreparedBatch(batch.id)).rejects.toThrow('exceeds');
    const archive = JSON.parse(await restored.exportJSON()); archive.preparedBatches[0].recipe.servings = '12';
    const fresh = await setup(await adapter()); await expect(fresh.restoreJSON(JSON.stringify(archive))).rejects.toThrow('original batch'); expect(fresh.logs).toHaveLength(0);
    await fresh.close(); await restored.close(); await repo.close();
  });
  it('rolls back failed batch creation and portion writes without losing the source draft or remaining stock', async () => {
    const storage = await adapter(); let failKind = '';
    const repo = await setup({ ...storage, commit: (changes, revision) => changes.some(c => c.type === 'put' && c.record.kind === failKind) ? Promise.reject(new Error('simulated disk failure')) : storage.commit(changes, revision) });
    const draft = draftFor(); await repo.saveDraft(draft); failKind = 'preparedBatch';
    await expect(repo.createBatchFromDraft(draft, 'Batch', '6', null)).rejects.toThrow('disk failure');
    expect(repo.draft).toEqual(draft); expect(repo.preparedBatches).toHaveLength(0); expect(repo.logs).toHaveLength(0);
    failKind = ''; const batch = await repo.createBatchFromDraft(draft, 'Batch', '6', null); failKind = 'log';
    await expect(repo.logPreparedBatch(batch.id)).rejects.toThrow('disk failure'); expect(batchBalance(batch, repo.logs).servings.toFixed()).toBe('6');
    expect(repo.logs).toHaveLength(0); await repo.close();
  });
  it('detects stale writers rather than losing data', async () => {
    const storage = await adapter(); await storage.commit([put('draft', 'active', { test: 'newer' })], 0);
    await expect(storage.commit([put('draft', 'active', { test: 'older' })], 0)).rejects.toThrow('another window');
    expect((await storage.load()).records[0].value).toEqual({ test: 'newer' }); await storage.close();
  });
});

describe('disk persistence and migrations', () => {
  it('reopens actual SQLite data and preserves source snapshots and draft', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'tg-sqlite-')); const filename = path.join(folder, 'data.sqlite');
    try {
      const repo = await setup(await openSQLStorage(driver(new DatabaseSync(filename)))); await repo.logDraft(draftFor()); await repo.toggleFavorite(oil);
      await repo.saveDraft({ ...emptyDraft(randomUUID), text: '200g kylling' }); await repo.close();
      const reopened = await setup(await openSQLStorage(driver(new DatabaseSync(filename))));
      try { expect(reopened.logs[0].nutrition.kcal).toBe('89.2'); expect(reopened.quickEntry.favorites).toContain(oil.id); expect(Object.values(reopened.quickEntry.matches)[0].foodId).toBe(oil.id); expect(reopened.draft.text).toBe('200g kylling'); } finally { await reopened.close(); }
    } finally {
      if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'tg-sqlite-')) throw new Error('Unexpected test cleanup path');
      rmSync(folder, { recursive: true });
    }
  });
  it('reopens IndexedDB data', async () => {
    const name = randomUUID(), repo = await setup(await openBrowserStorage(name)); await repo.logDraft(draftFor()); await repo.toggleFavorite(oil); await repo.close();
    const reopened = await setup(await openBrowserStorage(name)); expect(reopened.logs).toHaveLength(1); expect(reopened.quickEntry.favorites).toContain(oil.id); expect(Object.values(reopened.quickEntry.matches)[0].foodId).toBe(oil.id); await reopened.close();
  });
  it('migrates SQLite v1 to v2 without losing records', async () => {
    const db = new DatabaseSync(':memory:'); db.exec(migration1);
    db.prepare('INSERT INTO records VALUES(?,?,?,?)').run('draft:active', 'draft', 'active', JSON.stringify(emptyDraft(randomUUID)));
    const storage = await openSQLStorage(driver(db)); expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(2); expect((await storage.load()).records).toHaveLength(1); await storage.close();
  });
  it('refuses a future SQLite schema', async () => {
    const db = new DatabaseSync(':memory:'); db.exec('PRAGMA user_version=99'); await expect(openSQLStorage(driver(db))).rejects.toThrow('newer app');
  });
  it('closes a failed migration handle and retains the previous on-disk schema and draft', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'tg-migration-'));
    try {
      const file = path.join(folder, 'library.sqlite'), db = new DatabaseSync(file);
      db.exec(migration1);
      db.prepare('INSERT INTO records VALUES(?,?,?,?)').run('draft:active', 'draft', 'active', JSON.stringify(draftFor()));
      const connection = driver(db), transaction = connection.withExclusiveTransactionAsync;
      let closed = false;
      const close = connection.closeAsync;
      connection.closeAsync = async () => { closed = true; await close(); };
      connection.withExclusiveTransactionAsync = task => transaction(async tx => task({ ...tx, execAsync: async sql => {
        await tx.execAsync(sql); throw new Error('simulated migration interruption');
      } }));
      await expect(openSQLStorage(connection)).rejects.toThrow('migration interruption'); expect(closed).toBe(true);
      const reopened = new DatabaseSync(file);
      try {
        expect(reopened.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
        expect(reopened.prepare('SELECT key FROM records').all()).toHaveLength(1);
        expect(reopened.prepare('PRAGMA table_info(records)').all().some(row => row.name === 'updated_at')).toBe(false);
      } finally { reopened.close(); }
    } finally {
      if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'tg-migration-')) throw new Error('Unexpected cleanup path');
      rmSync(folder, { recursive: true });
    }
  });
  it('rolls back a failed native SQL transaction completely', async () => {
    const db = new DatabaseSync(':memory:'), storage = await openSQLStorage(driver(db));
    db.exec("CREATE TRIGGER fail_log BEFORE INSERT ON records WHEN new.kind='log' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END;");
    await expect(storage.commit([put('food', 'first', {}), put('log', 'fails', {})], 0)).rejects.toThrow();
    expect((await storage.load()).records).toHaveLength(0); expect((await storage.load()).revision).toBe(0); await storage.close();
  });
  it('rolls back native diary deletion if writing its undo snapshot fails inside the transaction', async () => {
    const db = new DatabaseSync(':memory:'), storage = await openSQLStorage(driver(db)), repo = await setup(storage);
    await repo.logDraft(draftFor()); const original = structuredClone(repo.logs), undo = [...repo.undo];
    db.exec("CREATE TRIGGER fail_deletion BEFORE INSERT ON records WHEN new.kind='deletionUndo' AND new.payload<>'[]' BEGIN SELECT RAISE(ABORT,'simulated undo write failure'); END;");
    await expect(repo.deleteLogs([original[0].id])).rejects.toThrow('undo write failure');
    expect(repo.logs).toEqual(original); expect(repo.undo).toEqual(undo);
    expect((await storage.load()).records.filter(record => record.kind === 'log').map(record => record.value)).toEqual(original);
    db.exec('DROP TRIGGER fail_deletion'); await repo.deleteLogs([original[0].id]);
    db.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON records WHEN new.kind='log' BEGIN SELECT RAISE(ABORT,'simulated restore failure'); END;");
    await expect(repo.undoLast()).rejects.toThrow('restore failure'); expect(repo.logs).toEqual([]); expect(repo.isDeletionUndo).toBe(true);
    expect((await storage.load()).records.filter(record => record.kind === 'log')).toEqual([]);
    db.exec('DROP TRIGGER fail_restore'); await repo.undoLast(); expect(repo.logs).toEqual(original); await repo.close();
  });
});

for (const platform of ['IndexedDB', 'SQLite'] as const) it(`reopens saved portions and a persisted split draft on ${platform}`, async () => {
  const name = randomUUID(), folder = platform === 'SQLite' ? mkdtempSync(path.join(tmpdir(), 'tg-portions-')) : null;
  const open = () => platform === 'IndexedDB' ? openBrowserStorage(name) : openSQLStorage(driver(new DatabaseSync(path.join(folder!, 'portions.sqlite'))));
  try {
    const repo = await setup(await open());
    const draft: import('../src/domain/model').Draft = draftFor(); draft.splitPlan = { name: 'Unfinished split', servingsText: '6', cookedWeightText: '' };
    draft.recipeName = 'Conversational recipe'; await repo.saveDraft(draft); const recipe: Recipe = { id: randomUUID(), name: 'Saved portion', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], servings: '6', cookedWeightGrams: null, steps: [], favorite: false };
    const batch = await repo.createPreparedBatch(recipe); await repo.logPreparedBatch(batch.id); await repo.close();
    const reopened = await setup(await open());
    expect(reopened.draft.splitPlan).toEqual(draft.splitPlan); expect(reopened.draft.recipeName).toBe('Conversational recipe'); expect(reopened.preparedBatches[0]).toEqual(batch);
    expect(batchBalance(reopened.preparedBatches[0], reopened.logs).servings.toFixed()).toBe('5');
    expect(reopened.logs[0].nutrition.kcal).toBe('89.2'); await reopened.undoLast(); expect(batchBalance(batch, reopened.logs).servings.toFixed()).toBe('6');
    await reopened.close();
  } finally {
    if (folder) { if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'tg-portions-')) throw new Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
  }
});

for (const platform of ['IndexedDB', 'SQLite'] as const) it(`reopens a deleted diary entry and restores its exact snapshot on ${platform}`, async () => {
  const name = randomUUID(), folder = platform === 'SQLite' ? mkdtempSync(path.join(tmpdir(), 'tg-delete-')) : null;
  const open = () => platform === 'IndexedDB' ? openBrowserStorage(name) : openSQLStorage(driver(new DatabaseSync(path.join(folder!, 'library.sqlite'))));
  try {
    const repo = await setup(await open()); await repo.logDraft(draftFor()); await repo.correctLog(repo.logs[0].id, { quantity: '20' });
    const original = structuredClone(repo.logs[0]); await repo.deleteLogs([original.id]); await repo.close();
    const reopened = await setup(await open()); expect(reopened.logs).toEqual([]); expect(reopened.undoLabel).toBe('Undo deletion');
    await reopened.undoLast(); expect(reopened.logs).toEqual([original]); await reopened.close();
    const final = await setup(await open()); expect(final.logs).toEqual([original]); expect(final.undo).toEqual([]); await final.close();
  } finally {
    if (folder) { if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'tg-delete-')) throw new Error('Unexpected cleanup path'); rmSync(folder, { recursive: true }); }
  }
});
