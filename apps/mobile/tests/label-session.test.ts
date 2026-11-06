import { expect, it, vi } from 'vitest';
import { createLabelSession } from '../src/platform/labelSession';
import { LabelDocument } from '../src/domain/nutritionLabel';
import { fullLabelImage } from '../src/domain/labelImage';
import { LabelPhoto, LabelPhotoTransform } from '../src/platform/labelPhoto.types';
const document: LabelDocument = { engine: 'platform', text: 'Per 100 g', blocks: [] };
const callbacks = () => ({ state: vi.fn(), photo: vi.fn(), result: vi.fn(), error: vi.fn() });
it('uses the picked photo for real recognition and releases only its owned temporary resource on cancellation', async () => {
  const release = vi.fn(async () => undefined), recognize = vi.fn(async () => document), ui = callbacks();
  const session = createLabelSession({ pick: async () => ({ width: 1000, height: 800, uri: 'file:///owned.jpg', release }), recognize }, ui);
  await session.start('library'); expect(recognize).toHaveBeenCalledOnce(); expect(ui.result).toHaveBeenCalledWith(document); expect(release).not.toHaveBeenCalled();
  session.cancel(); expect(release).toHaveBeenCalledOnce(); expect(ui.state).toHaveBeenLastCalledWith(false);
});
it('ignores a cancelled permission/photo-picker result and releases its late resource', async () => {
  const release = vi.fn(async () => undefined), ui = callbacks(); let resolve!: (value: { width: number; height: number; uri: string; release: typeof release }) => void;
  const recognize = vi.fn(async () => document), session = createLabelSession({ pick: () => new Promise(r => { resolve = r; }), recognize }, ui);
  const pending = session.start('camera'); session.cancel(); resolve({ width: 1000, height: 800, uri: 'file:///late.jpg', release }); await pending;
  expect(recognize).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce(); expect(ui.result).not.toHaveBeenCalled();
});
it('does not apply stale recognition after cancellation, a new capture or backgrounding', async () => {
  const ui = callbacks(); let resolve!: (value: LabelDocument) => void;
  const session = createLabelSession({ pick: async () => ({ width: 1000, height: 800, uri: 'file:///scan.jpg', release: async () => undefined }), recognize: () => new Promise(r => { resolve = r; }) }, ui);
  const pending = session.start('library'); await vi.waitFor(() => expect(resolve).toBeTypeOf('function')); session.cancel(); resolve(document); await pending;
  expect(ui.result).not.toHaveBeenCalled(); expect(ui.error).not.toHaveBeenCalled();
});
it('reports OCR failure and timeouts while keeping manual entry available', async () => {
  const ui = callbacks(), pick = async () => ({ width: 1000, height: 800, uri: 'file:///scan.jpg', release: async () => undefined });
  const session = createLabelSession({ pick, recognize: async () => { throw new Error('Unreadable photo'); } }, ui);
  await session.start('library'); expect(ui.error).toHaveBeenCalledWith('Unreadable photo'); expect(ui.state).toHaveBeenLastCalledWith(false);
  const slow = createLabelSession({ pick, recognize: () => new Promise(() => undefined) }, ui, 5);
  await slow.start('library'); expect(ui.error).toHaveBeenLastCalledWith(expect.stringContaining('too long')); slow.cancel(); session.cancel();
});
const ownedPhoto = (name: string): LabelPhoto => ({ uri: `file:///${name}.png`, width: 1200, height: 800, release: vi.fn(async () => undefined) });
it('repeated crops always use the original and release replaced previews exactly once', async () => {
  const original = ownedPhoto('original'), first = ownedPhoto('crop-1'), second = ownedPhoto('crop-2'), ui = callbacks(); let count = 0;
  const transform = vi.fn<LabelPhotoTransform>(async () => ++count === 1 ? first : second), recognize = vi.fn(async (_uri: string) => document);
  const session = createLabelSession({ pick: async () => original, transform, recognize }, ui);
  await session.start('library'); await session.adjust(fullLabelImage()); await session.adjust({ ...fullLabelImage(), rotation: 90 });
  expect(transform.mock.calls.map(call => call[0])).toEqual([original, original]);
  expect(first.release).toHaveBeenCalledOnce(); expect(original.release).not.toHaveBeenCalled();
  expect(recognize.mock.calls.map(call => call[0])).toEqual([original.uri, first.uri, second.uri]);
  session.cancel(); expect(original.release).toHaveBeenCalledOnce(); expect(second.release).toHaveBeenCalledOnce();
});
it('keeps the last preview after a cancelled picker, failed OCR or cancelled rescan', async () => {
  const original = ownedPhoto('original'), ui = callbacks(); let fail = false, picks = 0;
  const session = createLabelSession({ pick: async () => ++picks === 1 ? original : null, transform: async () => ownedPhoto('edited'), recognize: async () => { if (fail) throw new Error('Unreadable crop'); return document; } }, ui);
  await session.start('library'); await session.start('library'); expect(ui.photo).toHaveBeenLastCalledWith(original.uri); expect(original.release).not.toHaveBeenCalled();
  fail = true; await session.adjust(fullLabelImage()); expect(ui.error).toHaveBeenLastCalledWith('Unreadable crop'); expect(ui.photo).toHaveBeenLastCalledWith('file:///edited.png');
  session.stop(); expect(ui.photo).toHaveBeenLastCalledWith('file:///edited.png'); session.cancel(); expect(original.release).toHaveBeenCalledOnce();
});
it('releases a late transformed file after cancellation without applying its reading', async () => {
  const original = ownedPhoto('original'), late = ownedPhoto('late'), ui = callbacks(); let resolve!: (photo: LabelPhoto) => void;
  const session = createLabelSession({ pick: async () => original, transform: () => new Promise(done => { resolve = done; }), recognize: async () => document }, ui);
  await session.start('library'); ui.result.mockClear(); const pending = session.adjust(fullLabelImage()); session.cancel(); await pending;
  resolve(late); await Promise.resolve(); expect(late.release).toHaveBeenCalledOnce(); expect(ui.result).not.toHaveBeenCalled();
});
it('times out a stalled transformation, keeps the original and releases a late output', async () => {
  const original = ownedPhoto('original'), late = ownedPhoto('late-timeout'), ui = callbacks(); let resolve!: (photo: LabelPhoto) => void;
  const session = createLabelSession({ pick: async () => original, transform: () => new Promise(done => { resolve = done; }), recognize: async () => document }, ui, 5);
  await session.start('library'); ui.result.mockClear(); await session.adjust(fullLabelImage());
  expect(ui.error).toHaveBeenLastCalledWith(expect.stringContaining('too long')); expect(original.release).not.toHaveBeenCalled();
  resolve(late); await Promise.resolve(); expect(late.release).toHaveBeenCalledOnce(); expect(ui.result).not.toHaveBeenCalled();
  session.cancel(); expect(original.release).toHaveBeenCalledOnce();
});
