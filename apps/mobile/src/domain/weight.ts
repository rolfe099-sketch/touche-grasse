import { z } from 'zod';
import { D, dayKey, decimalSchema, parseAmount, positive } from './model';
import { addDays, localDate } from './history';

export const weighInSchema = z.object({ id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), kg: decimalSchema, recordedAt: z.iso.datetime(), deletedAt: z.iso.datetime().nullable(),
  previous: z.array(z.object({ kg: decimalSchema, recordedAt: z.iso.datetime() })).max(200) });
export type WeighIn = z.infer<typeof weighInSchema>;
export type WeightUnit = 'kg' | 'lb';
export const weightDraftSchema = z.object({ date: z.string().max(10), amount: z.string().max(100), unit: z.enum(['kg', 'lb']) });
export type WeightDraft = z.infer<typeof weightDraftSchema>;
const kgPerPound = '0.45359237';
export function weightKg(text: string, unit: WeightUnit) {
  const parsed = parseAmount(text); if (parsed === null) throw new Error('Enter a weight using up to six decimal places.');
  return positive(unit === 'kg' ? parsed : new D(parsed).times(kgPerPound).toFixed(), '1000').toFixed();
}
export function weightValue(kg: string, unit: WeightUnit) { return unit === 'kg' ? kg : new D(kg).div(kgPerPound).toFixed(); }
export function validateWeighIn(input: unknown) {
  const value = weighInSchema.parse(input); localDate(value.id); positive(value.kg, '1000'); value.previous.forEach(item => positive(item.kg, '1000')); return value;
}
export function weightWindow(values: WeighIn[], end: string) {
  const start = dayKey(addDays(localDate(end), -6)), days = values.filter(value => !value.deletedAt && value.id >= start && value.id <= end);
  return { count: days.length, mean: days.length >= 2 ? days.reduce((sum, value) => sum.plus(value.kg), new D(0)).div(days.length).toFixed() : null };
}
export function weightTrend(values: WeighIn[], end: string) {
  const current = weightWindow(values, end), previous = weightWindow(values, dayKey(addDays(localDate(end), -7)));
  return { current, previous, change: current.mean !== null && previous.mean !== null ? new D(current.mean).minus(previous.mean).toFixed() : null };
}
