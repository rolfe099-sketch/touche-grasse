import { expect, it } from 'vitest';
import { keyboardOverlap, labelReviewLayout } from '../src/domain/reviewLayout';

it('counts only keyboard overlap and avoids subtracting it twice on resized windows', () => {
  expect(keyboardOverlap(852, { height: 300, screenY: 552 })).toBe(300);
  expect(keyboardOverlap(552, { height: 300, screenY: 552 })).toBe(0);
  expect(keyboardOverlap(852, { height: 300, screenY: 852 })).toBe(0);
  expect(keyboardOverlap(852, { height: NaN, screenY: 552 })).toBe(0);
});
it('keeps the ordinary grid compact and gives larger text full-width fields', () => {
  expect(labelReviewLayout(349, 852, 1)).toMatchObject({ columns: 2, chipColumns: 5, photoHeight: 220 });
  expect(labelReviewLayout(349, 852, 1.8)).toMatchObject({ columns: 1, chipColumns: 3 });
  expect(labelReviewLayout(240, 568, 1)).toMatchObject({ columns: 1, chipColumns: 3 });
});
it('reserves space for editing while keeping a zoomable photo available', () => {
  const reading = labelReviewLayout(349, 852, 1), editing = labelReviewLayout(349, 852, 1, 300, true);
  expect(editing.photoHeight).toBeLessThan(reading.photoHeight); expect(editing.photoHeight).toBeGreaterThanOrEqual(88);
  expect(labelReviewLayout(349, 667, 2, 300, true).photoHeight).toBe(88);
});
