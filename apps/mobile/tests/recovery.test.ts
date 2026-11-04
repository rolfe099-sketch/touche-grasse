import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RecoveryCopy, RecoveryPort, RecoveryService, inspectRecoveryJSON, recoveryMetaSchema } from '../src/domain/recovery';
import { openRecoveryPort } from '../src/platform/recovery.web';
import { openBrowserStorage } from '../src/storage/indexeddb';
import { Repository } from '../src/domain/repository';
import { emptyDraft, Food } from '../src/domain/model';
import catalog from '../src/data/catalog.json';

const json = (name = 'meal') => JSON.stringify({ format: 'touche-grasse', version: 2, foods: [], recipes: [], logs: [], draft: { ...emptyDraft(randomUUID), text: name } });
function memory() {
  const copies = new Map<string, RecoveryCopy>(); let fail = false, corrupt = false;
  const port: RecoveryPort = {
    async list() { return [...copies.values()].map(copy => recoveryMetaSchema.parse(copy)); },
    async read(id) { const copy = copies.get(id); if (!copy) throw new Error('missing'); return { ...copy, ...(corrupt ? { json: copy.json + ' ' } : {}) }; },
    async write(copy) { if (fail) throw new Error('disk full'); copies.set(copy.id, { ...copy }); },
    async remove(id) { copies.delete(id); },
  };
  return { copies, port, fail: () => { fail = true; }, corrupt: () => { corrupt = true; } };
}
it('keeps six recent versions, protects a pre-restore image and orders same-millisecond writes deterministically', async () => {
  const storage = memory(), service = new RecoveryService(storage.port, randomUUID, () => new Date('2026-11-04T12:00:00Z'));
  const before = await service.save(json('before import'), 'before-restore');
  await Promise.all(Array.from({ length: 10 }, (_, i) => service.save(json(`meal ${i}`))));
  const versions = await service.list(); expect(versions).toHaveLength(6); expect(versions.some(copy => copy.id === before?.id)).toBe(true);
  expect(new Set(versions.map(copy => copy.createdAt)).size).toBe(6);
  expect((await service.read(versions[0].id)).json).toContain('meal 9');
});
it('does not discard earlier copies when writes or readback verification fail', async () => {
  const storage = memory(), service = new RecoveryService(storage.port, randomUUID);
  for (let i = 0; i < 6; i++) await service.save(json(`old ${i}`)); const original = [...storage.copies.keys()];
  storage.fail(); await expect(service.save(json('new'))).rejects.toThrow('disk full'); expect([...storage.copies.keys()]).toEqual(original);
  const damaged = memory(), checked = new RecoveryService(damaged.port, randomUUID); await checked.save(json('safe')); const safe = [...damaged.copies.keys()]; damaged.corrupt();
  await expect(checked.save(json('bad'))).rejects.toThrow('incomplete'); expect(safe.every(id => damaged.copies.has(id))).toBe(true);
});
it('deduplicates unchanged automatic copies and skips an empty diary, while explicit recovery copies remain available', async () => {
  const storage = memory(), service = new RecoveryService(storage.port, randomUUID), original = json();
  await service.save(original); await service.save(original); expect(storage.copies.size).toBe(1);
  await service.save(original, 'manual'); expect(storage.copies.size).toBe(2);
  const empty = json(''); await expect(service.save(empty)).resolves.toBeNull();
  await service.save(empty, 'before-restore'); expect(storage.copies.size).toBe(3);
  expect(() => inspectRecoveryJSON('broken')).toThrow('unreadable'); expect(() => inspectRecoveryJSON('{"format":"other"}')).toThrow('not a Touche');
  await expect(service.read('../escape')).rejects.toThrow();
});
it('counts UTF-8 bytes and reopens copies from a separate real IndexedDB store', async () => {
  const name = randomUUID(), service = new RecoveryService(await openRecoveryPort(name), randomUUID), original = json('Eple, rå 🍎');
  const copy = await service.save(original); expect(copy?.bytes).toBe(Buffer.byteLength(original));
  const reopened = new RecoveryService(await openRecoveryPort(name), randomUUID); expect((await reopened.read(copy!.id)).json).toBe(original); expect(await reopened.list()).toHaveLength(1);
});
it('rejects same-length JSON corruption before attempting recovery', async () => {
  const storage = memory(), service = new RecoveryService(storage.port, randomUUID); const copy = await service.save(json('original'));
  storage.copies.get(copy!.id)!.json = storage.copies.get(copy!.id)!.json.replace('original', 'modified');
  await expect(service.read(copy!.id)).rejects.toThrow('damaged');
});
it('recovers exact records after loss of the primary test database and preserves subsequent historical entries on merge', async () => {
  const primary = randomUUID(), adapter = await openBrowserStorage(primary), repo = new Repository(adapter, randomUUID); await repo.initialize(catalog as Food[], async () => undefined);
  const food = repo.index.get('mvt:08.019')!;
  await repo.logDraft({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), food, query: food.name, quantityText: '10', unit: 'g' }] });
  const logs = structuredClone(repo.logs), service = new RecoveryService(await openRecoveryPort(randomUUID()), randomUUID);
  const copy = await service.save(await repo.exportJSON()); await repo.close();
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(primary); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
  const restored = new Repository(await openBrowserStorage(primary), randomUUID); await restored.initialize(catalog as Food[], async () => undefined);
  await restored.restoreJSON((await service.read(copy!.id)).json); expect(restored.logs).toEqual(logs);
  await restored.logDraft({ ...emptyDraft(randomUUID), lines: [{ id: randomUUID(), food, query: food.name, quantityText: '20', unit: 'g' }] }); const newer = structuredClone(restored.logs);
  await restored.restoreJSON((await service.read(copy!.id)).json); expect(restored.logs).toEqual(newer); await restored.close();
});
