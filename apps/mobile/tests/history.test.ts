import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { Food, emptyDraft, foodNutrition, LogEntry, Recipe } from '../src/domain/model';
import { addDays, daysInPeriod, historyIndex, localDate, monthlyTrend, periodSummary, startOfWeek } from '../src/domain/history';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { Repository } from '../src/domain/repository';
const oil = catalog.find(f => f.id === 'mvt:08.019')! as Food;
function log(date: string, quantity = '10', meal: LogEntry['meal'] = 'Middag'): LogEntry {
  return { id: randomUUID(), batchId: randomUUID(), recordedAt: new Date(`${date}T12:00:00`).toISOString(), meal, snapshot: { kind: 'food', ingredient: { id: randomUUID(), food: oil, quantity, unit: 'g' } }, nutrition: foodNutrition(oil, quantity, 'g') };
}
async function repository(name = randomUUID()) { const repo = new Repository(await openBrowserStorage(name), randomUUID); await repo.initialize([], async () => undefined); return repo; }

describe('history uses actual snapshots and explicit denominators', () => {
  it('keeps missing days absent and averages only days with entries', () => {
    const index = historyIndex([log('2026-10-05', '10'), log('2026-10-05', '10'), log('2026-10-07', '30')]);
    const week = periodSummary(index, daysInPeriod(localDate('2026-10-05'), 'week'));
    expect(index.byDay.has('2026-10-06')).toBe(false);
    expect(week.loggedDays).toBe(2); expect(week.possibleDays).toBe(7); expect(week.average?.kcal).toBe('223');
    expect(periodSummary(index, [localDate('2026-10-06')]).average).toBeNull();
  });
  it('counts meals by day and label, entries individually and days distinctly', () => {
    const index = historyIndex([log('2026-10-05'), log('2026-10-05'), log('2026-10-05', '10', 'Lunsj'), log('2026-10-06')]);
    expect(index.entries).toBe(4); expect(index.meals).toBe(3); expect(index.days).toHaveLength(2);
  });
  it('does not turn an unknown nutrient into zero in an average', () => {
    const entry = log('2026-10-05'); entry.nutrition = { ...entry.nutrition, protein: null };
    const average = periodSummary(historyIndex([entry, log('2026-10-06')]), daysInPeriod(localDate('2026-10-05'), 'week')).average;
    expect(average?.protein).toBeNull(); expect(average?.kcal).toBe('89.2');
  });
  it('retains missing months as gaps and weighs monthly averages by logged day', () => {
    const trend = monthlyTrend(historyIndex([log('2026-08-01'), log('2026-10-01', '20'), log('2026-10-02', '40')]));
    expect(trend.map(p => p.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(trend[1].average).toBeNull(); expect(trend[2].days).toBe(2); expect(trend[2].average?.kcal).toBe('267.6');
  });
  it('uses calendar arithmetic across DST, leap days and year boundaries', () => {
    expect(localDate('2024-02-29').getDate()).toBe(29); expect(() => localDate('2026-02-29')).toThrow();
    expect(daysInPeriod(localDate('2024-02-14'), 'month')).toHaveLength(29);
    expect(startOfWeek(localDate('2027-01-01')).getFullYear()).toBe(2026);
    expect(addDays(localDate('2026-10-25'), 1).getHours()).toBe(12);
    expect(daysInPeriod(localDate('2026-10-25'), 'week').every(d => d.getHours() === 12)).toBe(true);
  });
  it('counts recipe servings only when the unit actually is servings', () => {
    const recipe: Recipe = { id: randomUUID(), name: 'Test-only oil recipe', ingredients: [{ id: randomUUID(), food: oil, quantity: '60', unit: 'g' }], steps: [], servings: '6', cookedWeightGrams: '60', favorite: false };
    const entries = [log('2026-10-05'), log('2026-10-05')];
    entries[0].snapshot = { kind: 'recipe', recipe, quantity: '1.5', unit: 'servings' };
    entries[1].snapshot = { kind: 'recipe', recipe, quantity: '10', unit: 'g' };
    expect(historyIndex(entries).recipeServings).toBe('1.5');
  });
});

describe('first-use metadata, corrections and retained recipe edits', () => {
  it('corrects from the historical source snapshot and retains the prior version', async () => {
    const name = randomUUID(), repo = await repository(name);
    await repo.logDraft({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), query: oil.name, food: oil, quantityText: '10', unit: 'g' }] }, new Date('2026-10-05T12:00:00Z'));
    const original = JSON.parse(JSON.stringify(repo.logs[0]));
    await repo.saveFood({ ...oil, nutrition: { ...oil.nutrition, kcal: '100' } });
    await repo.correctLog(original.id, { quantity: '20', recordedAt: '2026-10-01T12:00:00Z', meal: 'Lunsj' });
    expect(repo.logs[0].nutrition.kcal).toBe('178.4'); expect(repo.logs[0].corrections?.[0].previous.nutrition.kcal).toBe('89.2');
    expect(repo.logs[0].meal).toBe('Lunsj'); expect(repo.profile.firstUsedAt).toBe('2026-10-01T12:00:00Z');
    await expect(repo.correctLog(original.id, { quantity: '0' })).rejects.toThrow(); expect(repo.logs[0].corrections).toHaveLength(1);
    await repo.close(); const reopened = await repository(name);
    expect(reopened.logs[0].nutrition.kcal).toBe('178.4'); expect(reopened.logs[0].corrections).toHaveLength(1); await reopened.close();
  });
  it('preserves the earliest known first-use date when an old-format backup lacks metadata', async () => {
    const repo = await repository(), legacy = JSON.parse(await repo.exportJSON());
    delete legacy.profile; legacy.logs = [log('2020-01-15')];
    await repo.restoreJSON(JSON.stringify(legacy)); expect(repo.profile.firstUsedAt.slice(0, 10)).toBe('2020-01-15');
    const backup = JSON.parse(await repo.exportJSON()); backup.profile.firstUsedAt = '2019-05-01T12:00:00Z';
    await repo.restoreJSON(JSON.stringify(backup)); expect(repo.profile.firstUsedAt).toBe('2019-05-01T12:00:00Z');
    backup.profile.firstUsedAt = '2026-10-01T12:00:00Z'; await repo.restoreJSON(JSON.stringify(backup)); expect(repo.profile.firstUsedAt).toBe('2019-05-01T12:00:00Z'); await repo.close();
  });
  it('validates correction audit nutrition before restoring any records', async () => {
    const repo = await repository(); await repo.logDraft({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), query: oil.name, food: oil, quantityText: '10', unit: 'g' }] });
    await repo.correctLog(repo.logs[0].id, { quantity: '20' }); const backup = JSON.parse(await repo.exportJSON());
    backup.logs[0].corrections[0].previous.nutrition.kcal = '999';
    const other = await repository(); expect(() => other.restoreJSON(JSON.stringify(backup))).toThrow(); expect(other.logs).toHaveLength(0);
    await repo.close(); await other.close();
  });
  it('recovers an earlier known tracking date from a correction trail when metadata is absent', async () => {
    const repo = await repository(), entry = log('2026-10-20');
    entry.corrections = [{ correctedAt: '2026-10-21T12:00:00Z', previous: { ...entry, recordedAt: '2026-08-01T12:00:00Z' } }];
    const backup = JSON.parse(await repo.exportJSON()); delete backup.profile; backup.logs = [entry];
    await repo.restoreJSON(JSON.stringify(backup)); expect(repo.profile.firstUsedAt).toBe('2026-08-01T12:00:00Z'); await repo.close();
  });
  it('keeps incomplete recipe edits through reopen and backup then clears them atomically on save', async () => {
    const name = randomUUID(), repo = await repository(name);
    const recipe: Recipe = { id: randomUUID(), name: '', ingredients: [{ id: randomUUID(), food: oil, quantity: '1,', unit: 'g' }], steps: [], servings: '', cookedWeightGrams: null, favorite: false };
    await repo.saveRecipeDraft('new', { recipe, instructions: 'An unfinished step' }); await repo.close();
    const reopened = await repository(name); expect(reopened.recipeDrafts.new.recipe.ingredients[0].quantity).toBe('1,');
    const restored = await repository(); await restored.restoreJSON(await reopened.exportJSON()); expect(restored.recipeDrafts.new.instructions).toBe('An unfinished step');
    await restored.saveRecipe({ ...recipe, name: 'Test recipe', servings: '1', ingredients: [{ ...recipe.ingredients[0], quantity: '10' }] }, 'new');
    expect(restored.recipeDrafts.new).toBeUndefined(); expect(restored.recipes).toHaveLength(1); await restored.close(); await reopened.close();
  });
});
