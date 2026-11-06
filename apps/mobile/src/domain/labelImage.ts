export type ImageSize = { width: number; height: number };
export type CropBox = { left: number; top: number; right: number; bottom: number };
export type LabelImageEdit = { rotation: 0 | 90 | 180 | 270; crop: CropBox };
export const fullLabelImage = (): LabelImageEdit => ({ rotation: 0, crop: { left: 0, top: 0, right: 1, bottom: 1 } });
export const minimumCrop = 0.04;

export function rotatedSize(size: ImageSize, rotation: number): ImageSize {
  if (![0, 90, 180, 270].includes(rotation) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1 || size.width * size.height > 50_000_000) throw new Error('Invalid label image.');
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}
export function labelPixelCrop(size: ImageSize, edit: LabelImageEdit) {
  const rotated = rotatedSize(size, edit.rotation), { left, top, right, bottom } = edit.crop;
  if (![left, top, right, bottom].every(Number.isFinite) || left < 0 || top < 0 || right > 1 || bottom > 1 || right - left < minimumCrop - 1e-9 || bottom - top < minimumCrop - 1e-9) throw new Error('Keep a larger crop inside the photo.');
  const originX = Math.floor(left * rotated.width), originY = Math.floor(top * rotated.height);
  return { originX, originY, width: Math.min(rotated.width, Math.ceil(right * rotated.width)) - originX, height: Math.min(rotated.height, Math.ceil(bottom * rotated.height)) - originY };
}
export function moveCropCorner(crop: CropBox, corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', dx: number, dy: number): CropBox {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return { ...crop,
    ...(corner.endsWith('left') ? { left: clamp(crop.left + dx, 0, crop.right - minimumCrop) } : { right: clamp(crop.right + dx, crop.left + minimumCrop, 1) }),
    ...(corner.startsWith('top') ? { top: clamp(crop.top + dy, 0, crop.bottom - minimumCrop) } : { bottom: clamp(crop.bottom + dy, crop.top + minimumCrop, 1) }),
  };
}
export function cropFromMargins(values: string[]): CropBox {
  if (values.length !== 4 || values.some(value => !/^\d+(?:[.,]\d+)?$/.test(value.trim()))) throw new Error('Enter a percentage for each edge.');
  const [left, top, right, bottom] = values.map(value => Number(value.replace(',', '.')) / 100);
  const crop = { left, top, right: 1 - right, bottom: 1 - bottom };
  labelPixelCrop({ width: 1000, height: 1000 }, { rotation: 0, crop }); return crop;
}
