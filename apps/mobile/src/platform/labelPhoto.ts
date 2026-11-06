import { requireOptionalNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';
import type { OcrResult } from 'expo-ocr-kit';
import { LabelOCR, LabelPhoto, LabelPhotoSource, LabelPhotoTransform } from './labelPhoto.types';
import { labelPixelCrop } from '../domain/labelImage';
import { labelDocumentSchema, parseNutritionLabel } from '../domain/nutritionLabel';
import { labelTableCrop } from '../domain/labelCrop';
export async function pickLabelPhoto(source: LabelPhotoSource): Promise<LabelPhoto | null> {
  if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Camera access is off. Choose a label photo or enable access in Settings.');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false };
  const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if ((asset.fileSize ?? 0) > 15000000) throw new Error('Choose a label photo smaller than 15 MB.');
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > 4800) context.resize(asset.width >= asset.height ? { width: 4800 } : { height: 4800 });
    const rendered = await context.renderAsync();
    try {
      // Re-encoding normalizes orientation and removes EXIF before Vision sees it.
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: .95 });
      return { uri: saved.uri, width: saved.width, height: saved.height, release: async () => { if (FileSystem.cacheDirectory && saved.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(saved.uri, { idempotent: true }); } };
    } finally { rendered.release(); }
  } finally { context.release(); }
}
export const transformLabelPhoto: LabelPhotoTransform = async (photo, edit, signal) => {
  const crop = labelPixelCrop(photo, edit);
  if (signal.aborted) throw new Error('Label scan cancelled.');
  const context = ImageManipulator.manipulate(photo.uri);
  try {
    if (edit.rotation) context.rotate(edit.rotation);
    context.crop(crop);
    const rendered = await context.renderAsync();
    try {
      if (signal.aborted) throw new Error('Label scan cancelled.');
      const saved = await rendered.saveAsync({ format: SaveFormat.PNG });
      return { uri: saved.uri, width: saved.width, height: saved.height, release: async () => {
        if (FileSystem.cacheDirectory && saved.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(saved.uri, { idempotent: true });
      } };
    } finally { rendered.release(); }
  } finally { context.release(); }
};
export function createLabelOCR(): LabelOCR {
  const module = requireOptionalNativeModule<{ recognizeText(uri: string): Promise<OcrResult> }>('ExpoOcrKit');
  return { available: !!module, unavailable: 'Label scanning needs the updated development build. You can still enter the label below.', async recognize(uri, signal) {
    if (!module) throw new Error('Install the updated development build to scan labels.');
    if (!uri.startsWith('file://')) throw new Error('Choose a local label photo.');
    if (signal.aborted) throw new Error('Label scan cancelled.');
    const result = await module.recognizeText(uri);
    if (signal.aborted) throw new Error('Label scan cancelled.');
    const convert = (result: OcrResult) => ({ text: result.text, blocks: result.blocks.map(block => ({ text: block.text, box: block.boundingBox, confidence: null })) });
    const document = labelDocumentSchema.parse({ engine: 'platform', ...convert(result) });
    const columns = parseNutritionLabel(document).columns;
    if (columns.length && columns.every(column => Object.values(column.nutrition).every(value => value !== null))) return document;
    try {
    const size = await Image.getSize(uri); if (signal.aborted) throw new Error('Label scan cancelled.');
    const crop = labelTableCrop(document, size); if (!crop) return document;
    const context = ImageManipulator.manipulate(uri);
    try {
      context.crop(crop);
      const image = await context.renderAsync();
      try {
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: .98 });
        try {
          if (signal.aborted) throw new Error('Label scan cancelled.');
          const closer = await module.recognizeText(saved.uri);
          if (signal.aborted) throw new Error('Label scan cancelled.');
          const alternative = labelDocumentSchema.parse({ engine: 'platform', ...convert(closer) });
          const alternatives = parseNutritionLabel(alternative).columns;
          // A crop can lose the reference heading. Never discard a readable
          // first pass merely because the optional closer pass lost its basis.
          if (!alternatives.length) return document;
          return labelDocumentSchema.parse({ ...document, alternative });
        } finally { if (FileSystem.cacheDirectory && saved.uri.startsWith(FileSystem.cacheDirectory)) await FileSystem.deleteAsync(saved.uri, { idempotent: true }); }
      } finally { image.release(); }
    } finally { context.release(); }
    } catch { if (signal.aborted) throw new Error('Label scan cancelled.'); return document; }
  } };
}
