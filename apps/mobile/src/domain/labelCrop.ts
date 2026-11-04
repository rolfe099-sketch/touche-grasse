import { isNutrientHeading, LabelDocument } from './nutritionLabel';
export function labelTableCrop(document: LabelDocument, size: { width: number; height: number }) {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) return null;
  const blocks = document.blocks.filter(block => block.box && block.box.width > 0 && block.box.height > 0);
  const headings = blocks.filter(block => isNutrientHeading(block.text) || /\b(?:per|pr\.?)\s*100\s*(?:g|ml)\b/i.test(block.text));
  if (headings.length < 3) return null;
  const pad = Math.max(32, Math.min(120, Math.max(...headings.map(block => block.box!.height)) * 1.5));
  const top = Math.min(...headings.map(block => block.box!.y)) - pad;
  const bottom = Math.max(...headings.map(block => block.box!.y + block.box!.height)) + pad;
  // Keep every observed column within the table's vertical span.
  const table = blocks.filter(block => block.box!.y + block.box!.height >= top && block.box!.y <= bottom);
  const originX = Math.max(0, Math.floor(Math.min(...table.map(block => block.box!.x)) - pad));
  const originY = Math.max(0, Math.floor(top));
  const width = Math.min(size.width - originX, Math.ceil(Math.max(...table.map(block => block.box!.x + block.box!.width)) + pad - originX));
  const height = Math.min(size.height - originY, Math.ceil(bottom - originY));
  if (width < 150 || height < 150 || width * height >= size.width * size.height * .85) return null;
  return { originX, originY, width, height };
}
