import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Repository } from '../src/domain/repository';
import { emptyDraft, Food, foodNutrition, LogEntry } from '../src/domain/model';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { migration1, openSQLStorage, SQLDatabase } from '../src/storage/sqlite';
import { Kind, StorageAdapter, Stored } from '../src/storage/contract';
import catalog from '../src/data/catalog.json';

function driver(db: DatabaseSync): SQLDatabase {
  const value: SQLDatabase = {
    async execAsync(sql) { db.exec(sql); }, async runAsync(sql, ...params) { return db.prepare(sql).run(...params); },
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]) { return db.prepare(sql).all(...params) as T[]; },
    async withExclusiveTransactionAsync(task) { db.exec('BEGIN IMMEDIATE'); try { await task(value); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; } },
    async closeAsync() { db.close(); },
  }; return value;
}
function oldRecords() {
  const oil = structuredClone((catalog as Food[]).find(food => food.id === 'mvt:08.019')!); delete oil.nutrition.fiber;
  const log: LogEntry = { id: 'old-log', batchId: 'old-meal', recordedAt: '2026-10-01T12:00:00Z', meal: 'Middag', snapshot: { kind: 'food', ingredient: { id: 'oil', food: oil, quantity: '10', unit: 'g' } }, nutrition: foodNutrition(oil, '10', 'g') }; delete log.nutrition.fiber;
  const draft = { ...emptyDraft(() => 'pending'), text: 'An unfinished meal', lines: [{ id: 'pending-oil', query: 'oil', food: oil, quantityText: '15,', unit: 'g' }] };
  const recipeDraft = { recipe: { id: 'recipe', name: '', ingredients: [{ id: 'ingredient', food: oil, quantity: '1,', unit: 'g' }], steps: [], servings: '', cookedWeightGrams: null, favorite: false }, instructions: 'Not finished' };
  const record = (kind: Kind, id: string, value: unknown): Stored => ({ key: `${kind}:${id}`, kind, id, value });
  return [record('food', oil.id, oil), record('log', log.id, log), record('draft', 'active', draft), record('recipeDraft', 'new', recipeDraft)];
}
for (const platform of ['SQLite', 'IndexedDB'] as const) it(`upgrades a real ${platform} v1 store without rewriting old snapshots or unfinished text`, async () => {
  const records = oldRecords(); let storage: StorageAdapter;
  if (platform === 'SQLite') {
    const db = new DatabaseSync(':memory:'); db.exec(migration1);
    for (const row of records) db.prepare('INSERT INTO records VALUES(?,?,?,?)').run(row.key, row.kind, row.id, JSON.stringify(row.value));
    storage = await openSQLStorage(driver(db)); expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(2);
  } else {
    const name = randomUUID();
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name, 1); open.onupgradeneeded = () => open.result.createObjectStore('records', { keyPath: 'key' }); open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readwrite'); for (const row of records) tx.objectStore('records').put(row); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
    });
    storage = await openBrowserStorage(name);
  }
  const repo = new Repository(storage, randomUUID); await repo.initialize(catalog as Food[], async () => undefined);
  const loaded = await storage.load(); for (const before of records) expect(loaded.records.find(row => row.key === before.key)).toEqual(before);
  const archive = JSON.parse(await repo.exportJSON()); expect(archive.logs[0].nutrition).not.toHaveProperty('fiber'); expect(archive.draft.lines[0].quantityText).toBe('15,'); expect(archive.recipeDrafts.new.recipe.ingredients[0].quantity).toBe('1,');
  await repo.close();
});
it('closes the actual SQLite handle after a newer-record refusal and keeps the on-disk records unchanged', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'tg-compatibility-')); let closed = false;
  try {
    const file = path.join(folder, 'diary.sqlite'), db = new DatabaseSync(file), connection = driver(db);
    const close = connection.closeAsync; connection.closeAsync = async () => { closed = true; await close(); };
    const storage = await openSQLStorage(connection);
    await storage.commit([{ type: 'put', record: { key: 'futureEvent:one', kind: 'futureEvent' as Kind, id: 'one', value: { keep: 'all data' } } }], 0);
    const repo = new Repository(storage, randomUUID); await expect(repo.initialize(catalog as Food[], async () => undefined)).rejects.toThrow('newer app'); expect(closed).toBe(true);
    expect(() => db.prepare('SELECT * FROM records')).toThrow();
    const reopened = new DatabaseSync(file);
    try { expect(reopened.prepare('SELECT key,payload FROM records').all()).toEqual([{ key: 'futureEvent:one', payload: '{"keep":"all data"}' }]); expect(reopened.prepare("SELECT value FROM meta WHERE key='revision'").get()?.value).toBe(1); }
    finally { reopened.close(); }
  } finally {
    if (!closed) throw new Error('Test database handle was not closed; preserve files for inspection.');
    if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'tg-compatibility-')) throw new Error('Unexpected test cleanup path');
    rmSync(folder, { recursive: true });
  }
});
