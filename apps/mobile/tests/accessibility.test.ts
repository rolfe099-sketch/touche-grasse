import { expect, it } from 'vitest';
import { nutrientDescription, readableLayout } from '../src/domain/accessibility';

it('makes room for larger text without changing the ordinary iPhone layout or clamping fonts', () => {
  expect(readableLayout(390, 1)).toEqual({ compact: false, formColumns: 2, nutrientColumns: 4 });
  expect(readableLayout(320, 1)).toEqual({ compact: true, formColumns: 1, nutrientColumns: 2 });
  expect(readableLayout(390, 1.8)).toEqual({ compact: true, formColumns: 1, nutrientColumns: 2 });
  expect(readableLayout(1200, 2)).toMatchObject({ compact: true });
  expect(readableLayout(NaN, NaN)).toMatchObject({ compact: true });
});
it('distinguishes missing nutrients, an empty diary and an explicitly recorded zero', () => {
  expect(nutrientDescription('Fiber', undefined, { target: '30', remaining: null, fraction: null }, true)).toBe('Fiber: unknown. Target 30 grams. Remaining amount is unknown.');
  expect(nutrientDescription('Fiber', '0', null, false)).toBe('Fiber: no recorded intake.');
  expect(nutrientDescription('Fiber', '0', null, true)).toBe('Fiber: 0 grams.');
});
it('describes remaining and over-target amounts using the existing decimal values', () => {
  expect(nutrientDescription('Fat', '40.1', { target: '30', remaining: '-10.1', fraction: 1 }, true)).toBe('Fat: 40.1 grams. Target 30 grams. 10.1 grams over target.');
  expect(nutrientDescription('Energy', '488', { target: '2000', remaining: '1512', fraction: .244 }, true, true)).toBe('Energy: 488 kcal. Target 2,000 kcal. 1,512 kcal left.');
});
