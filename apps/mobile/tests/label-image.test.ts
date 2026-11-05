import { expect, it } from 'vitest';
import { cropFromMargins, fullLabelImage, labelPixelCrop, minimumCrop, moveCropCorner, rotatedSize } from '../src/domain/labelImage';

it('maps crop percentages onto the rotated image axes, retaining boundary pixels', () => {
  const size = { width: 1200, height: 800 };
  expect(rotatedSize(size, 90)).toEqual({ width: 800, height: 1200 });
  expect(labelPixelCrop(size, { rotation: 90, crop: { left: .1, top: .2, right: .9, bottom: .8 } })).toEqual({ originX: 80, originY: 240, width: 640, height: 720 });
  expect(labelPixelCrop(size, fullLabelImage())).toEqual({ originX: 0, originY: 0, width: 1200, height: 800 });
  expect(labelPixelCrop({ width: 101, height: 99 }, { rotation: 0, crop: { left: .01, top: .01, right: .99, bottom: .99 } })).toEqual({ originX: 1, originY: 0, width: 99, height: 99 });
});
it('rejects inverted, non-finite, tiny and out-of-bounds crops instead of guessing a selection', () => {
  for (const crop of [ { left: 0, top: 0, right: .01, bottom: 1 }, { left: .8, top: 0, right: .2, bottom: 1 }, { left: NaN, top: 0, right: 1, bottom: 1 }, { left: -.1, top: 0, right: 1, bottom: 1 }, { left: 0, top: 0, right: 1.01, bottom: 1 } ]) expect(() => labelPixelCrop({ width: 1200, height: 800 }, { rotation: 0, crop })).toThrow();
  expect(() => rotatedSize({ width: 1200, height: 800 }, 45)).toThrow();
  expect(() => rotatedSize({ width: 100000, height: 100000 }, 0)).toThrow();
});
it('keeps dragged crop corners inside the photo without crossing the opposing corner', () => {
  const original = { left: .2, top: .2, right: .8, bottom: .8 };
  const inward = moveCropCorner(original, 'top-left', 1, 1);
  expect(inward.right - inward.left).toBeCloseTo(minimumCrop); expect(inward.bottom - inward.top).toBeCloseTo(minimumCrop);
  expect(moveCropCorner(original, 'bottom-right', 1, 1)).toEqual({ ...original, right: 1, bottom: 1 });
  expect(moveCropCorner(original, 'top-right', 1, -1)).toEqual({ ...original, right: 1, top: 0 });
  expect(original).toEqual({ left: .2, top: .2, right: .8, bottom: .8 });
});
it('supports accessible edge fields with decimal commas and rejects incomplete values', () => {
  expect(cropFromMargins(['10,5', '20', '5', '0'])).toEqual({ left: .105, top: .2, right: .95, bottom: 1 });
  for (const values of [['', '0', '0', '0'], ['80', '0', '80', '0'], ['-1', '0', '0', '0'], ['1e2', '0', '0', '0']]) expect(() => cropFromMargins(values)).toThrow();
});
