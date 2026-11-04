import { LabelDocument } from '../domain/nutritionLabel';
import { LabelPhoto, LabelPhotoSource } from './labelPhoto.types';
export function createLabelSession(port: { pick(source: LabelPhotoSource): Promise<LabelPhoto | null>; recognize(uri: string, signal: AbortSignal): Promise<LabelDocument> }, callbacks: { state(busy: boolean): void; photo(uri?: string): void; result(document: LabelDocument): void; error(message: string): void }, timeoutMs = 90000) {
  let generation = 0, request: AbortController | undefined, owned: LabelPhoto | undefined;
  function cancel() {
    generation++; request?.abort(); request = undefined;
    const photo = owned; owned = undefined; if (photo) void photo.release().catch(() => undefined);
    callbacks.photo(undefined); callbacks.state(false);
  }
  return { cancel, async start(source: LabelPhotoSource) {
    cancel(); const current = generation, controller = new AbortController(); request = controller; callbacks.state(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const photo = await port.pick(source); if (!photo) return;
      if (current !== generation) { await photo.release(); return; }
      owned = photo; callbacks.photo(photo.uri);
      const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Label scan cancelled.')), { once: true }));
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new Error('Label recognition took too long. Try a closer photo or enter the label.')); controller.abort(); }, timeoutMs); });
      const document = await Promise.race([port.recognize(photo.uri, controller.signal), stopped, timeout]);
      if (current === generation) callbacks.result(document);
    } catch (reason) { if (current === generation) { const photo = owned; owned = undefined; if (photo) await photo.release().catch(() => undefined); callbacks.photo(undefined); callbacks.error(reason instanceof Error ? reason.message : 'Could not read the label. Try a clearer photo.'); } }
    finally { if (timer) clearTimeout(timer); if (current === generation) { request = undefined; callbacks.state(false); } }
  } };
}
