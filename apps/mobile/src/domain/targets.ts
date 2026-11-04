import { z } from 'zod';
import { D, decimalSchema, Nutrition, nutrients } from './model';
import { localDate } from './history';

const targetAmount = decimalSchema.refine(value => decimalSchema.safeParse(value).success && new D(value).gt(0) && new D(value).lte(100000), 'Enter a target greater than zero and no more than 100,000.').nullable();
export const targetValuesSchema = z.object({ kcal: targetAmount, protein: targetAmount, carbohydrate: targetAmount, fat: targetAmount, fiber: targetAmount });
export type TargetValues = z.infer<typeof targetValuesSchema>;
export const emptyTargets = (): TargetValues => ({ kcal: null, protein: null, carbohydrate: null, fat: null, fiber: null });
export const targetChangeSchema = z.object({ id: z.string().min(1).max(200), effectiveOn: z.string().refine(value => { try { localDate(value); return true; } catch { return false; } }, 'Invalid target date.'), recordedAt: z.iso.datetime(), values: targetValuesSchema });
export type TargetChange = z.infer<typeof targetChangeSchema>;
export function targetOn(changes: TargetChange[], date: string): TargetChange | undefined {
  return changes.filter(change => change.effectiveOn <= date).sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id))[0];
}
export function hasTargets(values?: TargetValues) { return !!values && nutrients.some(key => values[key] !== null); }
export function targetProgress(intake: Nutrition, key: typeof nutrients[number], values: TargetValues, hasIntake: boolean) {
  const target = values[key], consumed = intake[key];
  if (target === null) return null;
  if (!hasIntake || consumed == null) return { target, remaining: null, fraction: null };
  return { target, remaining: new D(target).minus(consumed).toFixed(), fraction: Math.min(1, Math.max(0, new D(consumed).div(target).toNumber())) };
}
export function macroTargetEnergy(values: TargetValues): string | null {
  if (values.protein === null || values.carbohydrate === null || values.fat === null) return null;
  return new D(values.protein).plus(values.carbohydrate).times(4).plus(new D(values.fat).times(9)).toFixed();
}
