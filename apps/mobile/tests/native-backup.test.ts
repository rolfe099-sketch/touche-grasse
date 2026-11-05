import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportBackup, pickBackup } from '../src/platform/backup';

const native = vi.hoisted(() => ({
  fs: { cacheDirectory: 'file:///cache/', writeAsStringAsync: vi.fn(), readAsStringAsync: vi.fn(), deleteAsync: vi.fn(), getInfoAsync: vi.fn() },
  sharing: { isAvailableAsync: vi.fn(), shareAsync: vi.fn() }, picker: { getDocumentAsync: vi.fn() },
}));
vi.mock('expo-file-system/legacy', () => native.fs);
vi.mock('expo-sharing', () => native.sharing);
vi.mock('expo-document-picker', () => native.picker);
vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-export' }));

beforeEach(() => {
  vi.resetAllMocks(); native.fs.cacheDirectory = 'file:///cache/';
  native.sharing.isAvailableAsync.mockResolvedValue(true);
  native.fs.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 100 });
  native.fs.readAsStringAsync.mockResolvedValue('{"test":"fixture"}');
  native.picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/picked.json' }] });
});
describe('native backup adapter with fake file/share ports (no device execution)', () => {
  it('shares the exact backup and removes the temporary export after the sheet closes', async () => {
    let finish!: () => void; native.sharing.shareAsync.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const exporting = exportBackup('{"diary":"fixture"}');
    await vi.waitFor(() => expect(native.sharing.shareAsync).toHaveBeenCalledOnce());
    expect(native.fs.deleteAsync).not.toHaveBeenCalled(); finish(); await exporting;
    const uri = 'file:///cache/ToucheGrasse-test-export-backup.json';
    expect(native.fs.writeAsStringAsync).toHaveBeenCalledWith(uri, '{"diary":"fixture"}');
    expect(native.fs.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });
  it('cleans up after share rejection or a partial write, and rejects unavailable sharing before writing', async () => {
    native.sharing.shareAsync.mockRejectedValueOnce(new Error('share failed'));
    await expect(exportBackup('{}')).rejects.toThrow('share failed'); expect(native.fs.deleteAsync).toHaveBeenCalledOnce();
    native.fs.writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
    await expect(exportBackup('{}')).rejects.toThrow('disk full'); expect(native.fs.deleteAsync).toHaveBeenCalledTimes(2);
    native.sharing.isAvailableAsync.mockResolvedValue(false); native.fs.writeAsStringAsync.mockClear();
    await expect(exportBackup('{}')).rejects.toThrow('unavailable'); expect(native.fs.writeAsStringAsync).not.toHaveBeenCalled();
  });
  it('rejects missing temporary storage without constructing a null URI', async () => {
    native.fs.cacheDirectory = null as unknown as string;
    await expect(exportBackup('{}')).rejects.toThrow('Temporary file storage'); expect(native.fs.writeAsStringAsync).not.toHaveBeenCalled();
  });
  it('reads a picker copy then removes it, and handles cancellation without file access', async () => {
    expect(await pickBackup()).toEqual({ json: '{"test":"fixture"}', name: 'Backup file' }); expect(native.fs.deleteAsync).toHaveBeenCalledWith('file:///cache/picked.json', { idempotent: true });
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: true }); native.fs.getInfoAsync.mockClear();
    expect(await pickBackup()).toBeNull(); expect(native.fs.getInfoAsync).not.toHaveBeenCalled();
  });
  it('checks actual file size when the picker omits size and never reads an oversized file', async () => {
    native.fs.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 50_000_001 });
    await expect(pickBackup()).rejects.toThrow('too large'); expect(native.fs.readAsStringAsync).not.toHaveBeenCalled(); expect(native.fs.deleteAsync).toHaveBeenCalledOnce();
  });
  it('rejects unavailable files and cleans cached copies even when reading fails', async () => {
    native.fs.getInfoAsync.mockResolvedValueOnce({ exists: false }); await expect(pickBackup()).rejects.toThrow('unavailable');
    native.fs.readAsStringAsync.mockRejectedValueOnce(new Error('provider read failed')); await expect(pickBackup()).rejects.toThrow('provider read failed');
    expect(native.fs.deleteAsync).toHaveBeenCalledTimes(2);
  });
  it('never deletes a document outside the app cache directory', async () => {
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///documents/original.json', size: 100 }] });
    expect(await pickBackup()).toEqual({ json: '{"test":"fixture"}', name: 'Backup file' }); expect(native.fs.deleteAsync).not.toHaveBeenCalled();
  });
  it('retains the selected filename for the restore review', async () => {
    native.picker.getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/named.json', name: 'Chosen diary.json', size: 100 }] });
    expect(await pickBackup()).toEqual({ json: '{"test":"fixture"}', name: 'Chosen diary.json' });
    expect(native.fs.deleteAsync).toHaveBeenCalledExactlyOnceWith('file:///cache/named.json', { idempotent: true });
  });

});
