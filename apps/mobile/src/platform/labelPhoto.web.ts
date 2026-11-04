import { createWorker, PSM, Worker } from 'tesseract.js';
import { LabelOCR, LabelPhoto, LabelPhotoSource } from './labelPhoto.types';
import { labelDocumentSchema } from '../domain/nutritionLabel';
export function pickLabelPhoto(source: LabelPhotoSource): Promise<LabelPhoto | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) { resolve(null); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15000000) { reject(new Error('Choose a JPEG, PNG or WebP label photo smaller than 15 MB.')); return; }
      const uri = URL.createObjectURL(file);
      try {
        const image = new Image(); image.src = uri; await image.decode();
        if (image.naturalWidth * image.naturalHeight > 50000000) throw new Error('This photo is too large. Crop it to the nutrition table first.');
        const ratio = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight)), canvas = document.createElement('canvas');
        canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
        const context = canvas.getContext('2d'); if (!context) throw new Error('Could not read this photo.'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // Preserve small unit glyphs: JPEG recompression can turn a clear g into
        // an uncertain reading. Canvas PNG still removes EXIF and orientation.
        const normalized = canvas.toDataURL('image/png'); canvas.width = 0; canvas.height = 0;
        resolve({ uri: normalized, release: async () => undefined });
      } catch (reason) { reject(reason); } finally { URL.revokeObjectURL(uri); }
    }; input.click();
  });
}
export function createLabelOCR(): LabelOCR {
  return { available: typeof WebAssembly !== 'undefined', unavailable: 'This browser cannot run local label recognition. Enter the label below.', async recognize(uri, signal) {
    let worker: Worker | undefined;
    let rejectAbort: (reason: Error) => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const abort = () => { rejectAbort(new Error('Label scan cancelled.')); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw new Error('Label scan cancelled.');
      const root = new URL('/ocr/', location.origin).href;
      const loading = createWorker('eng', 1, { workerPath: root + 'worker.min.js', corePath: root, langPath: root, cacheMethod: 'none', workerBlobURL: false, legacyCore: false });
      void loading.then(ready => { if (signal.aborted) void ready.terminate().catch(() => undefined); }).catch(() => undefined);
      worker = await Promise.race([loading, cancelled]);
      if (signal.aborted) throw new Error('Label scan cancelled.');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' });
      const english = await Promise.race([worker.recognize(uri, {}, { blocks: true, text: true }), cancelled]);
      await Promise.race([worker.reinitialize('nor'), cancelled]);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
      const norwegian = await Promise.race([worker.recognize(uri, {}, { blocks: true, text: true }), cancelled]);
      const extract = (data: typeof english.data) => ({ text: data.text, blocks: (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => ({ text: line.text, confidence: line.words.length ? Math.max(0, Math.min(...line.words.map(word => word.confidence))) : 0, box: { x: line.bbox.x0, y: line.bbox.y0, width: line.bbox.x1 - line.bbox.x0, height: line.bbox.y1 - line.bbox.y0 } })))) });
      return labelDocumentSchema.parse({ engine: 'tesseract', ...extract(english.data), alternative: extract(norwegian.data) });
    } finally { signal.removeEventListener('abort', abort); if (worker) await worker.terminate().catch(() => undefined); }
  } };
}
