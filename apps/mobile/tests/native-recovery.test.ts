import { beforeEach, expect, it, vi } from 'vitest';
import { openRecoveryPort } from '../src/platform/recovery';
import { RecoveryService } from '../src/domain/recovery';
import { emptyDraft } from '../src/domain/model';
const native = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, fs: { documentDirectory: 'file:///documents/', getInfoAsync: vi.fn(), makeDirectoryAsync: vi.fn(), readDirectoryAsync: vi.fn(), readAsStringAsync: vi.fn(), writeAsStringAsync: vi.fn(), moveAsync: vi.fn(), deleteAsync: vi.fn() } }));
vi.mock('expo-file-system/legacy', () => native.fs);
const root = 'file:///documents/touche-grasse-recovery/';
beforeEach(() => {
  vi.resetAllMocks(); native.files.clear(); native.fail = false; native.fs.documentDirectory = 'file:///documents/';
  native.fs.getInfoAsync.mockImplementation(async path => path === root ? { exists: true, isDirectory: true } : { exists: native.files.has(path), isDirectory: false, size: Buffer.byteLength(native.files.get(path) ?? '') });
  native.fs.readDirectoryAsync.mockImplementation(async () => [...native.files.keys()].map(path => path.slice(root.length)));
  native.fs.readAsStringAsync.mockImplementation(async path => { if (!native.files.has(path)) throw new Error('missing'); return native.files.get(path); });
  native.fs.writeAsStringAsync.mockImplementation(async (path, value) => { if (native.fail) { native.files.set(path, value.slice(0, 10)); throw new Error('disk full'); } native.files.set(path, value); });
  native.fs.moveAsync.mockImplementation(async ({ from, to }) => { native.files.set(to, native.files.get(from)!); native.files.delete(from); });
  native.fs.deleteAsync.mockImplementation(async path => { native.files.delete(path); });
});
const json = () => JSON.stringify({ format: 'touche-grasse', version: 2, foods: [], recipes: [], logs: [], draft: { ...emptyDraft(() => 'draft'), text: '10g olive oil' } });
it('writes durable native copies outside the diary database, publishes metadata after data, and reopens exact contents (fake file port)', async () => {
  const port = await openRecoveryPort(), service = new RecoveryService(port, () => 'copy-1'); const copy = await service.save(json());
  expect(native.fs.moveAsync.mock.calls).toEqual([[{ from: root+'copy-1.json.partial', to: root+'copy-1.json' }], [{ from: root+'copy-1.meta.json.partial', to: root+'copy-1.meta.json' }]]);
  const reopened = new RecoveryService(await openRecoveryPort(), () => 'copy-2'); expect((await reopened.read(copy!.id)).json).toBe(json());
  expect(await reopened.list()).toHaveLength(1); expect([...native.files.keys()].some(path => path.endsWith('.partial'))).toBe(false);
});
it('preserves earlier copies after a partial failed write and removes only the failed copy temporary files', async () => {
  const service = new RecoveryService(await openRecoveryPort(), (() => { let i = 0; return () => `copy-${++i}`; })());
  await service.save(json()); native.fail = true; await expect(service.save(json(), 'before-restore')).rejects.toThrow('disk full');
  expect([...native.files.keys()]).toEqual([root+'copy-1.json', root+'copy-1.meta.json']);
  await expect(service.read('../diary')).rejects.toThrow(); expect(native.fs.readAsStringAsync).not.toHaveBeenCalledWith(expect.stringContaining('../'));
});
it('ignores unrelated and unreadable metadata, rejects a corrupted copy and handles missing document storage', async () => {
  const port = await openRecoveryPort(); native.files.set(root+'bad.meta.json', 'broken'); native.files.set(root+'unrelated.txt', 'keep');
  expect(await port.list()).toEqual([]); native.fs.documentDirectory = null as unknown as string; await expect(openRecoveryPort()).rejects.toThrow('unavailable');
  expect(native.files.get(root+'unrelated.txt')).toBe('keep');
});
it('cleans interrupted unpublished files on the next write while retaining published copies and unrelated files', async () => {
  const original = new RecoveryService(await openRecoveryPort(), () => 'published'); await original.save(json());
  native.files.set(root+'orphan.json', 'interrupted'); native.files.set(root+'partial.meta.json.partial', 'interrupted'); native.files.set(root+'notes.txt', 'keep');
  const next = new RecoveryService(await openRecoveryPort(), () => 'next'); await next.save(json());
  expect(native.files.has(root+'orphan.json')).toBe(false); expect(native.files.has(root+'partial.meta.json.partial')).toBe(false);
  expect(native.files.has(root+'published.json')).toBe(true); expect(native.files.get(root+'notes.txt')).toBe('keep'); expect(await next.list()).toHaveLength(2);
});
