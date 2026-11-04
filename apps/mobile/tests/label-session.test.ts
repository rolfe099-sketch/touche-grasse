import { expect, it, vi } from 'vitest';
import { createLabelSession } from '../src/platform/labelSession';
import { LabelDocument } from '../src/domain/nutritionLabel';
const document: LabelDocument = { engine: 'platform', text: 'Per 100 g', blocks: [] };
const callbacks = () => ({ state: vi.fn(), photo: vi.fn(), result: vi.fn(), error: vi.fn() });
it('uses the picked photo for real recognition and releases only its owned temporary resource on cancellation', async () => {
  const release = vi.fn(async () => undefined), recognize = vi.fn(async () => document), ui = callbacks();
  const session = createLabelSession({ pick: async () => ({ uri: 'file:///owned.jpg', release }), recognize }, ui);
  await session.start('library'); expect(recognize).toHaveBeenCalledOnce(); expect(ui.result).toHaveBeenCalledWith(document); expect(release).not.toHaveBeenCalled();
  session.cancel(); expect(release).toHaveBeenCalledOnce(); expect(ui.state).toHaveBeenLastCalledWith(false);
});
it('ignores a cancelled permission/photo-picker result and releases its late resource', async () => {
  const release = vi.fn(async () => undefined), ui = callbacks(); let resolve!: (value: { uri: string; release: typeof release }) => void;
  const recognize = vi.fn(async () => document), session = createLabelSession({ pick: () => new Promise(r => { resolve = r; }), recognize }, ui);
  const pending = session.start('camera'); session.cancel(); resolve({ uri: 'file:///late.jpg', release }); await pending;
  expect(recognize).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce(); expect(ui.result).not.toHaveBeenCalled();
});
it('does not apply stale recognition after cancellation, a new capture or backgrounding', async () => {
  const ui = callbacks(); let resolve!: (value: LabelDocument) => void;
  const session = createLabelSession({ pick: async () => ({ uri: 'file:///scan.jpg', release: async () => undefined }), recognize: () => new Promise(r => { resolve = r; }) }, ui);
  const pending = session.start('library'); await Promise.resolve(); session.cancel(); resolve(document); await pending;
  expect(ui.result).not.toHaveBeenCalled(); expect(ui.error).not.toHaveBeenCalled();
});
it('reports OCR failure and timeouts while keeping manual entry available', async () => {
  const ui = callbacks(), pick = async () => ({ uri: 'file:///scan.jpg', release: async () => undefined });
  const session = createLabelSession({ pick, recognize: async () => { throw new Error('Unreadable photo'); } }, ui);
  await session.start('library'); expect(ui.error).toHaveBeenCalledWith('Unreadable photo'); expect(ui.state).toHaveBeenLastCalledWith(false);
  const slow = createLabelSession({ pick, recognize: () => new Promise(() => undefined) }, ui, 5);
  await slow.start('library'); expect(ui.error).toHaveBeenLastCalledWith(expect.stringContaining('too long')); slow.cancel(); session.cancel();
});
