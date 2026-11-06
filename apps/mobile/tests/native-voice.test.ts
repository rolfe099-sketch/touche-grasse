import { describe, expect, it, vi } from 'vitest';
import { createNativeVoiceController, NativeSpeech } from '../src/platform/nativeVoice';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness() {
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  const permission = vi.fn(async () => ({ granted: true }));
  const speech = { isRecognitionAvailable: () => true, requestPermissionsAsync: permission,
    start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
    addListener(name: string, callback: (event: unknown) => void) {
      const set = handlers.get(name) ?? new Set(); handlers.set(name, set); set.add(callback);
      return { remove: () => set.delete(callback) };
    },
  };
  const emit = (name: string, event: unknown = null) => [...(handlers.get(name) ?? [])].forEach(callback => callback(event));
  return { speech, permission, emit, handlers, voice: createNativeVoiceController(speech as unknown as NativeSpeech) };
}
const callbacks = () => ({ onState: vi.fn(), onText: vi.fn(), onError: vi.fn() });
const result = (text: string, isFinal = true) => ({ isFinal, results: [{ transcript: text }] });

describe('native speech lifecycle with a fake native port (no microphone execution)', () => {
  it('reports an interruption after a final transcript so a pending UI submission can be invalidated', async () => {
    const h = harness(), cb = callbacks(); await h.voice.start('en-US', cb);
    h.emit('result', result('log this meal')); h.emit('error', { error: 'interrupted', message: 'Audio session interrupted' });
    expect(cb.onText).toHaveBeenCalledWith('log this meal', true); expect(cb.onError).toHaveBeenCalledWith('Audio session interrupted');
    expect(cb.onState).toHaveBeenLastCalledWith(false); expect([...h.handlers.values()].every(set => set.size === 0)).toBe(true);
    h.emit('result', result('late log this meal')); expect(cb.onText).toHaveBeenCalledOnce();
  });
  it('does not start when a permission request resolves after cancellation', async () => {
    const h = harness(), pending = deferred<{ granted: boolean }>(); h.permission.mockReturnValueOnce(pending.promise);
    const cb = callbacks(), start = h.voice.start('en-US', cb); h.voice.cancel(); pending.resolve({ granted: true }); await start;
    expect(h.speech.start).not.toHaveBeenCalled(); expect(cb.onText).not.toHaveBeenCalled(); expect(h.handlers.size).toBe(0);
  });
  it('keeps a newer capture when an older permission request resolves or rejects late', async () => {
    for (const reject of [false, true]) {
      const h = harness(), old = deferred<{ granted: boolean }>(); h.permission.mockReturnValueOnce(old.promise);
      const first = callbacks(), second = callbacks(), waiting = h.voice.start('en-US', first);
      await h.voice.start('nb-NO', second);
      if (reject) old.reject(new Error('obsolete permission failure')); else old.resolve({ granted: true });
      await waiting; h.emit('result', result('10g olive oil'));
      expect(h.speech.start).toHaveBeenCalledTimes(1); expect(h.speech.start).toHaveBeenCalledWith(expect.objectContaining({ lang: 'nb-NO' }));
      expect(first.onText).not.toHaveBeenCalled(); expect(second.onText).toHaveBeenCalledOnce(); h.voice.cancel();
    }
  });
  it('delivers interim text then one final command, supports graceful stop, and releases listeners at end', async () => {
    const h = harness(), cb = callbacks(); await h.voice.start('en-US', cb);
    h.emit('start'); h.emit('result', result('200 grams', false)); h.voice.stop();
    expect(h.speech.stop).toHaveBeenCalledOnce(); h.emit('result', result('200g chicken')); h.emit('result', result('duplicate'));
    expect(cb.onText.mock.calls).toEqual([['200 grams', false], ['200g chicken', true]]);
    h.emit('end'); expect(cb.onState.mock.calls).toEqual([[true], [false]]);
    expect([...h.handlers.values()].every(set => set.size === 0)).toBe(true);
  });
  it('ignores queued native callbacks from cancelled captures', async () => {
    const h = harness(), first = callbacks(), second = callbacks(); await h.voice.start('en-US', first);
    const late = [...h.handlers.get('result')!][0]; h.voice.cancel(); await h.voice.start('en-US', second);
    late(result('log meal')); expect(first.onText).not.toHaveBeenCalled(); expect(second.onText).not.toHaveBeenCalled();
    expect(h.speech.abort).toHaveBeenCalledOnce(); h.voice.cancel();
  });
  it('handles denial, unavailable runtime and native startup failure without leaving active listeners', async () => {
    const h = harness(), cb = callbacks(); h.permission.mockResolvedValueOnce({ granted: false });
    await expect(h.voice.start('en-US', cb)).rejects.toThrow('access is off'); expect(h.speech.start).not.toHaveBeenCalled();
    h.speech.start.mockImplementationOnce(() => { throw new Error('native start failed'); });
    await expect(h.voice.start('en-US', cb)).rejects.toThrow('native start failed');
    expect([...h.handlers.values()].every(set => set.size === 0)).toBe(true);
    const unavailable = createNativeVoiceController(null); expect(unavailable.available).toBe(false);
    await expect(unavailable.start('en-US', cb)).rejects.toThrow('development build');
  });
  it('releases errored sessions and lets the user explicitly retry', async () => {
    const h = harness(), cb = callbacks(); await h.voice.start('en-US', cb);
    h.emit('error', { error: 'interrupted', message: 'Phone call interrupted speech' });
    expect(cb.onError).toHaveBeenCalledWith('Phone call interrupted speech');
    h.emit('result', result('log meal')); expect(cb.onText).not.toHaveBeenCalled();
    await h.voice.start('en-US', cb); h.emit('result', result('10g olive oil')); expect(cb.onText).toHaveBeenCalledOnce(); h.voice.cancel();
  });
});
