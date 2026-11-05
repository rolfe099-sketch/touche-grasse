import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Food, LogEntry, dayKey, emptyDraft, foodNutrition } from '../src/domain/model';
import { Repository } from '../src/domain/repository';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { StorageAdapter } from '../src/storage/contract';
import { dayComplete, daySignature, validateShortcut } from '../src/domain/dailyWorkflows';
import { daysInPeriod, historyIndex, localDate, monthlyTrend, periodSummary } from '../src/domain/history';
import { inspectRecoveryJSON } from '../src/domain/recovery';
import { applyCommand } from '../src/domain/commands';
import { FoodIndex } from '../src/domain/search';
import { emptyPreferences } from '../src/domain/quickEntry';
const oil = catalog.find(food => food.id === 'mvt:08.019')! as Food;
const date = '2026-10-05', at = new Date(`${date}T12:00:00`);
function entry(quantity = '10'): LogEntry { return { id: randomUUID(), batchId: 'original', recordedAt: at.toISOString(), meal: 'Frokost', snapshot: { kind: 'food', ingredient: { id: randomUUID(), food: oil, quantity, unit: 'g' } }, nutrition: foodNutrition(oil, quantity, 'g') }; }
async function setup(name = randomUUID(), adapter?: StorageAdapter) { const repo = new Repository(adapter ?? await openBrowserStorage(name), randomUUID); await repo.initialize([], async () => undefined); return repo; }

it('saves without eating, logs exact snapshots with fresh identities and undoes the whole shortcut', async () => {
  const repo = await setup(), entries = [entry('10'), entry('20')];
  const shortcut = await repo.saveShortcut('My breakfast', entries);
  expect(repo.logs).toEqual([]); entries[0].nutrition.kcal = '999';
  await repo.logShortcut(shortcut.id, at); const first = structuredClone(repo.logs);
  expect(first.map(log => log.nutrition.kcal)).toEqual(['89.2', '178.4']);
  expect(new Set(first.map(log => log.batchId)).size).toBe(1); expect(first.every(log => log.id !== shortcut.entries[0].id)).toBe(true);
  await repo.logShortcut(shortcut.id, at); expect(new Set(repo.logs.map(log => log.id)).size).toBe(4);
  await repo.undoLast(); expect(repo.logs).toEqual(first);
  expect(() => validateShortcut({ ...shortcut, entries })).toThrow('nutrition');
  await expect(repo.saveShortcut('MY breakfast!', shortcut.entries)).rejects.toThrow('name');
});
it('keeps original meal drafts separate and persists adjusted shortcut amounts across restart and backup', async () => {
  const name = randomUUID(), repo = await setup(name), draft = emptyDraft(randomUUID);
  draft.text = 'unfinished'; await repo.saveDraft(draft);
  const shortcut = await repo.saveShortcut('Breakfast', [entry(), entry('20')]);
  await repo.startShortcutReview(shortcut.id); const reviewId = repo.quickEntry.repeatReview!.id;
  await repo.saveRepeatAmounts(reviewId, ['15', '20']);
  const archive = await repo.exportJSON(); expect(inspectRecoveryJSON(archive).meaningful).toBe(true); await repo.close();
  const reopened = await setup(name); expect(reopened.quickEntry.repeatReview?.amounts).toEqual(['15', '20']);
  expect(reopened.draft).toEqual(draft); await reopened.logRepeatReview(reviewId, at);
  expect(reopened.logs.map(log => log.nutrition.kcal).sort()).toEqual(['133.8', '178.4']);
  expect(reopened.shortcuts[0].entries[0].nutrition.kcal).toBe('89.2');
  const fresh = await setup(); await fresh.restoreJSON(archive); expect(fresh.shortcuts).toEqual(reopened.shortcuts); expect(fresh.draft).toEqual(draft);
});
it('deletion is reversible, survives restart, and old backups do not resurrect deleted or edited shortcuts', async () => {
  const name = randomUUID(), repo = await setup(name), shortcut = await repo.saveShortcut('Breakfast', [entry()]);
  const old = await repo.exportJSON(); await repo.changeShortcut(shortcut.id, { deleted: true }); await repo.close();
  const reopened = await setup(name); await reopened.restoreJSON(old, { recoverMissing: true }); expect(reopened.shortcuts[0].deletedAt).toBeTruthy();
  await expect(reopened.logShortcut(shortcut.id)).rejects.toThrow('available');
  await reopened.changeShortcut(shortcut.id, { deleted: false, pinned: false });
  await reopened.saveShortcut('New breakfast', [entry('15')], shortcut.id); await reopened.restoreJSON(old);
  expect(reopened.shortcuts[0].name).toBe('New breakfast'); expect(reopened.shortcuts[0].pinned).toBe(false);
});
it('never converts finite prepared portions into an unlimited shortcut', async () => {
  const repo = await setup();
  const recipe = { id: 'recipe', name: 'Six servings', servings: '6', cookedWeightGrams: '600', ingredients: [{ id: 'oil', food: oil, quantity: '60', unit: 'g' as const }], steps: [], favorite: false };
  const batch = await repo.createPreparedBatch(recipe, 'Frokost'); await repo.logPreparedBatch(batch.id, '1', 'servings', at);
  const shortcut = await repo.saveShortcut('Portion', [repo.logs[0]]);
  for (let i = 0; i < 5; i++) await repo.logShortcut(shortcut.id, at);
  expect(repo.logs).toHaveLength(6); await expect(repo.logShortcut(shortcut.id, at)).rejects.toThrow('remaining');
  expect(repo.logs).toHaveLength(6); await repo.undoLast(); await repo.logShortcut(shortcut.id, at); expect(repo.logs).toHaveLength(6);
});
it('does not publish failed shortcut or day-review writes to memory', async () => {
  const base = await openBrowserStorage(randomUUID()); let fail = false;
  const repo = await setup(randomUUID(), { ...base, load: () => base.load(), close: () => base.close(), commit: (changes, revision) => fail ? Promise.reject(new Error('disk full')) : base.commit(changes, revision) });
  fail = true; await expect(repo.saveShortcut('Breakfast', [entry()])).rejects.toThrow('disk full'); expect(repo.shortcuts).toEqual([]);
  await expect(repo.setDayComplete(date, true, at)).rejects.toThrow('disk full'); expect(repo.dayReviews).toEqual([]);
  fail = false; await repo.saveShortcut('Breakfast', [entry()]); expect(repo.shortcuts).toHaveLength(1);
});
it('completion is explicit and content-bound; edits reopen it and deletion undo restores the exact reviewed state', async () => {
  const name = randomUUID(), repo = await setup(name), shortcut = await repo.saveShortcut('Breakfast', [entry()]);
  await repo.logShortcut(shortcut.id, at); expect(dayComplete(repo.dayReviews, repo.logs, date)).toBe(false);
  await repo.setDayComplete(date, true, at); const old = await repo.exportJSON(); expect(dayComplete(repo.dayReviews, repo.logs, date)).toBe(true);
  const signature = daySignature(repo.logs, date); expect(daySignature([...repo.logs].reverse(), date)).toBe(signature);
  await repo.deleteLogs([repo.logs[0].id]); expect(dayComplete(repo.dayReviews, repo.logs, date)).toBe(false);
  await repo.undoLast(); expect(dayComplete(repo.dayReviews, repo.logs, date)).toBe(true);
  await repo.close(); const reopened = await setup(name); expect(dayComplete(reopened.dayReviews, reopened.logs, date)).toBe(true);
  await reopened.setDayComplete(date, false, at); await reopened.restoreJSON(old); expect(dayComplete(reopened.dayReviews, reopened.logs, date)).toBe(false);
  await reopened.setDayComplete(date, true, at); await reopened.correctLog(reopened.logs[0].id, { quantity: '20' }); expect(dayComplete(reopened.dayReviews, reopened.logs, date)).toBe(false);
  expect(() => reopened.setDayComplete('2026-10-06', true, at)).toThrow('future'); expect(() => reopened.setDayComplete('2026-02-30', true, at)).toThrow('valid');
});
it('averages complete days separately, preserves unknowns and permits zero intake only by explicit review', async () => {
  const repo = await setup(), shortcut = await repo.saveShortcut('Breakfast', [entry()]); await repo.logShortcut(shortcut.id, at);
  await repo.logShortcut(shortcut.id, new Date('2026-10-06T12:00:00')); await repo.logShortcut(shortcut.id, new Date('2026-10-06T12:00:00'));
  await repo.setDayComplete(date, true, at); await repo.setDayComplete('2026-10-07', true, new Date('2026-10-07T12:00:00'));
  const index = historyIndex(repo.logs, repo.dayReviews), summary = periodSummary(index, daysInPeriod(localDate(date), 'week'));
  expect(summary.completeDays).toBe(2); expect(summary.partialDays).toBe(1); expect(summary.loggedDays).toBe(2);
  expect(summary.completeAverage?.kcal).toBe('44.6'); expect(summary.average?.kcal).toBe('133.8');
  expect(index.byDay.has('2026-10-08')).toBe(false); expect(monthlyTrend(index, true)[0].average?.kcal).toBe('44.6');
  await repo.setDayComplete('2026-10-04', true, at); expect(dayKey(historyIndex(repo.logs, repo.dayReviews).earliest!)).toBe(date);
  const unknown = structuredClone(repo.logs); unknown.find(log => dayKey(new Date(log.recordedAt)) === date)!.nutrition.fiber = null;
  const reviews = [{ ...repo.dayReviews[0], signature: daySignature(unknown, date) }];
  expect(periodSummary(historyIndex(unknown, reviews), [localDate(date)]).completeAverage?.fiber).toBeNull();
});
it('routes named voice/text commands to shortcuts without parsing them as ingredient names', () => {
  const draft = emptyDraft(randomUUID), index = new FoodIndex();
  expect(applyCommand('Log my breakfast', draft, index, emptyPreferences(), randomUUID)).toEqual({ kind: 'shortcut', name: 'my breakfast' });
  expect(applyCommand('Log shortcut My breakfast', draft, index, emptyPreferences(), randomUUID)).toEqual({ kind: 'shortcut', name: 'My breakfast' });
  expect(applyCommand('Log my last meal', draft, index, emptyPreferences(), randomUUID).kind).toBe('repeat'); expect(dayKey(at)).toBe(date);
});
it('archives library items reversibly without touching historical snapshots or allowing old backups to undo choices', async () => {
  const repo = await setup(), shortcut = await repo.saveShortcut('Breakfast', [entry()]);
  await repo.saveFood(oil); await repo.logShortcut(shortcut.id, at); const original = structuredClone(repo.logs);
  const old = await repo.exportJSON(); await repo.archiveLibrary('food', oil.id, true);
  await repo.restoreJSON(old); expect(repo.quickEntry.libraryHidden?.[`food:${oil.id}`]).toBe(true); expect(repo.logs).toEqual(original);
  await repo.archiveLibrary('food', oil.id, false); const hiddenCopy = JSON.parse(old); hiddenCopy.quickEntry.libraryHidden = { [`food:${oil.id}`]: true };
  await repo.restoreJSON(JSON.stringify(hiddenCopy), { recoverMissing: true }); expect(repo.quickEntry.libraryHidden?.[`food:${oil.id}`]).toBe(false);
});
it('rejects corrupt shortcut nutrition and duplicate review dates before changing any state', async () => {
  const repo = await setup(); await repo.saveShortcut('Breakfast', [entry()]); const original = await repo.exportJSON(), corrupt = JSON.parse(original);
  corrupt.shortcuts[0].entries[0].nutrition.kcal = '900'; expect(() => repo.restoreJSON(JSON.stringify(corrupt))).toThrow('nutrition'); expect(await repo.exportJSON()).toBe(original);
  const bad = JSON.parse(original); const review = { id: date, complete: false, updatedAt: at.toISOString(), signature: '[]' }; bad.dayReviews = [review, review];
  expect(() => repo.restoreJSON(JSON.stringify(bad))).toThrow('duplicate'); expect(await repo.exportJSON()).toBe(original);
});
it('accepts equivalent legacy decimal formatting without rewriting the historical snapshot', async () => {
  const repo = await setup(), original = entry(); original.nutrition.kcal = '89.20';
  const shortcut = await repo.saveShortcut('Legacy breakfast', [original]);
  expect(shortcut.entries[0].nutrition.kcal).toBe('89.20'); await repo.logShortcut(shortcut.id, at);
  expect(repo.logs[0].nutrition.kcal).toBe('89.2'); expect(original.nutrition.kcal).toBe('89.20');
});
