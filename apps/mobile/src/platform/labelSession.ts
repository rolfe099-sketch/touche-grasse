import { LabelDocument } from '../domain/nutritionLabel';
import { LabelImageEdit } from '../domain/labelImage';
import { LabelPhoto, LabelPhotoSource, LabelPhotoTransform, LabelPhotoView } from './labelPhoto.types';

export function createLabelSession(port: { pick(source: LabelPhotoSource): Promise<LabelPhoto | null>; transform?: LabelPhotoTransform; recognize(uri: string, signal: AbortSignal): Promise<LabelDocument> }, callbacks: { state(busy: boolean): void; photo(uri?: string): void; source?(photo?: LabelPhotoView): void; result(document: LabelDocument): void; error(message: string): void }, timeoutMs = 90000) {
  let generation = 0, request: AbortController | undefined, original: LabelPhoto | undefined, currentPhoto: LabelPhoto | undefined;
  const release = (photo?: LabelPhoto) => { if (photo) void photo.release().catch(() => undefined); };
  function stop() { generation++; request?.abort(); request = undefined; callbacks.state(false); }
  function clear() {
    if (currentPhoto !== original) release(currentPhoto); release(original);
    original = undefined; currentPhoto = undefined; callbacks.photo(undefined); callbacks.source?.(undefined);
  }
  function cancel() { stop(); clear(); }
  async function run(getPhoto: (signal: AbortSignal) => Promise<LabelPhoto | null>, replaceOriginal: boolean, timed: boolean) {
    stop(); const token = generation, controller = new AbortController(); request = controller; callbacks.state(true);
    let timer: ReturnType<typeof setTimeout> | undefined, discarded = false;
    const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Label scan cancelled.')), { once: true }));
    // Attach immediately: a cancelled native picker/transform may resolve much later.
    void stopped.catch(() => undefined);
    const deadline = () => new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error('Label recognition took too long. Crop the nutrition table or enter the values.')); controller.abort(); }, timeoutMs); });
    try {
      const loading = getPhoto(controller.signal).then(photo => {
        if (token !== generation || controller.signal.aborted || discarded) { release(photo ?? undefined); return null; }
        return photo;
      });
      const photo = timed ? await Promise.race([loading, stopped, deadline()]) : await loading;
      if (!photo) return;
      if (token !== generation || controller.signal.aborted) { release(photo); return; }
      if (replaceOriginal) { clear(); original = photo; callbacks.source?.({ uri: photo.uri, width: photo.width, height: photo.height }); }
      else if (currentPhoto !== original) release(currentPhoto);
      currentPhoto = photo; callbacks.photo(photo.uri);
      const document = await Promise.race([port.recognize(photo.uri, controller.signal), stopped, ...(timed ? [] : [deadline()])]);
      if (token === generation && !controller.signal.aborted) callbacks.result(document);
    } catch (reason) {
      if (token === generation) callbacks.error(reason instanceof Error ? reason.message : 'Could not read the label. Try a clearer photo.');
    } finally { discarded = true; if (timer) clearTimeout(timer); if (token === generation) { request = undefined; callbacks.state(false); } }
  }
  return { cancel, stop,
    start(source: LabelPhotoSource) { return run(() => port.pick(source), true, false); },
    adjust(edit: LabelImageEdit) {
      const photo = original;
      if (!photo || !port.transform) { callbacks.error('Choose a label photo before cropping.'); return Promise.resolve(); }
      return run(signal => port.transform!(photo, edit, signal), false, true);
    },
  };
}
