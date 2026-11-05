import { createWorker, PSM, Worker } from 'tesseract.js';
import { LabelOCR, LabelPhoto, LabelPhotoSource, LabelPhotoTransform } from './labelPhoto.types';
import { labelPixelCrop, rotatedSize } from '../domain/labelImage';
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
        const normalized = canvas.toDataURL('image/png'), width = canvas.width, height = canvas.height; canvas.width = 0; canvas.height = 0;
        resolve({ uri: normalized, width, height, release: async () => undefined });
      } catch (reason) { reject(reason); } finally { URL.revokeObjectURL(uri); }
    }; input.click();
  });
}
export const transformLabelPhoto: LabelPhotoTransform = async (photo, edit, signal) => {
  const box = labelPixelCrop(photo, edit), size = rotatedSize(photo, edit.rotation);
  if (signal.aborted) throw new Error('Label scan cancelled.');
  const image = new Image(); image.src = photo.uri; await image.decode();
  if (signal.aborted) throw new Error('Label scan cancelled.');
  const rotated = document.createElement('canvas'), cropped = document.createElement('canvas');
  try {
    rotated.width = size.width; rotated.height = size.height;
    const context = rotated.getContext('2d'); if (!context) throw new Error('Could not rotate the label photo.');
    context.translate(size.width / 2, size.height / 2); context.rotate(edit.rotation * Math.PI / 180);
    context.drawImage(image, -photo.width / 2, -photo.height / 2, photo.width, photo.height);
    cropped.width = box.width; cropped.height = box.height;
    const output = cropped.getContext('2d'); if (!output) throw new Error('Could not crop the label photo.');
    output.drawImage(rotated, box.originX, box.originY, box.width, box.height, 0, 0, box.width, box.height);
    return { uri: cropped.toDataURL('image/png'), width: box.width, height: box.height, release: async () => undefined };
  } finally { rotated.width = 0; rotated.height = 0; cropped.width = 0; cropped.height = 0; }
};
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
