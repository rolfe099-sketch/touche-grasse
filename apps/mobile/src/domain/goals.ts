import { z } from 'zod';
import { D, dayKey, decimalSchema } from './model';
import { calendarDaySchema } from './calendarDay';
import { localDate } from './history';
import { TargetChange, targetOn, targetValuesSchema, TargetValues } from './targets';

const bounded = (min: number, max: number) => decimalSchema.refine(s => new D(s).gte(min) && new D(s).lte(max), `Use a value between ${min} and ${max}.`);
export const estimateInputSchema = z.object({ weightKg: bounded(30, 350), heightCm: bounded(100, 250), age: z.number().int().min(19).max(78), coefficient: z.enum(['male', 'female']), activityFactor: bounded(1.2, 2), eligibleAdult: z.literal(true) });
export type EstimateInput = z.infer<typeof estimateInputSchema>;
export const goalDetailsSchema = z.object({ kind: z.enum(['cut', 'maintain', 'gain']), maintenanceKcal: bounded(1000, 10000), adjustmentPercent: bounded(0, 20), targetWeightKg: bounded(30, 350).nullable(), method: z.enum(['manual', 'mifflin-1990']), estimate: estimateInputSchema.optional() }).superRefine((v, ctx) => {
  if ((v.method === 'mifflin-1990') !== !!v.estimate) ctx.addIssue({ code: 'custom', message: 'Keep the estimate inputs with their calculation method.' });
  if (v.kind === 'maintain' && !new D(v.adjustmentPercent).isZero()) ctx.addIssue({ code: 'custom', message: 'Maintenance uses no calorie adjustment.' });
  if (v.estimate) { try { if (estimateMaintenance(v.estimate).maintenanceKcal !== v.maintenanceKcal) ctx.addIssue({ code: 'custom', message: 'The maintenance estimate does not match its inputs.' }); } catch { ctx.addIssue({ code: 'custom', message: 'This maintenance estimate is outside the supported range.' }); } }
});
export type GoalDetails = z.infer<typeof goalDetailsSchema>;
export const goalProgramSchema = z.object({ id: z.string().min(1).max(200), effectiveOn: calendarDaySchema, recordedAt: z.iso.datetime(), goal: goalDetailsSchema, rest: targetValuesSchema, training: targetValuesSchema, trainingDays: z.array(z.number().int().min(0).max(6)).max(7).refine(v => new Set(v).size === v.length, 'Choose each training day once.') });
export type GoalProgram = z.infer<typeof goalProgramSchema>;
export type ResolvedTarget = TargetChange & { dayType?: 'training' | 'rest'; goalKind?: GoalDetails['kind'] };

export function estimateMaintenance(input: EstimateInput) {
  const v = estimateInputSchema.parse(input);
  // Original published regression (Mifflin et al., 1990), not measured TDEE.
  const resting = new D(v.weightKg).times('9.99').plus(new D(v.heightCm).times('6.25')).minus(new D(v.age).times('4.92')).plus(v.coefficient === 'male' ? 5 : -161);
  const maintenance = resting.times(v.activityFactor).toDecimalPlaces(0);
  if (resting.lte(0) || maintenance.lt(1000) || maintenance.gt(10000)) throw new Error('This generic estimate is outside the supported range. Use your own maintenance estimate.');
  return { restingKcal: resting.toFixed(), maintenanceKcal: maintenance.toFixed() };
}
export function goalEnergy(details: GoalDetails) {
  const v = goalDetailsSchema.parse(details), factor = new D(v.adjustmentPercent).div(100).times(v.kind === 'cut' ? -1 : v.kind === 'gain' ? 1 : 0).plus(1);
  const energy = new D(v.maintenanceKcal).times(factor).toDecimalPlaces(0);
  if (energy.lt(1000) || energy.gt(10000)) throw new Error('This starting estimate is outside the supported range. Review your maintenance and adjustment.');
  return energy.toFixed();
}
// An editable starting template, not individualized coaching. Integer protein
// and fat leave exact quarter-gram carbs, conserving the chosen 4/4/9 energy.
export function startingTargets(energy: string): TargetValues {
  const kcal = bounded(1000, 10000).parse(energy), p = new D(kcal).times('.25').div(4).toDecimalPlaces(0), f = new D(kcal).times('.25').div(9).toDecimalPlaces(0);
  return { kcal, protein: p.toFixed(), fat: f.toFixed(), carbohydrate: new D(kcal).minus(p.times(4)).minus(f.times(9)).div(4).toFixed(), fiber: null };
}
export function resolveTargets(manual: TargetChange[], programs: GoalProgram[], date: string): ResolvedTarget | undefined {
  localDate(date);
  const target = targetOn(manual, date), program = programs.filter(p => p.effectiveOn <= date).sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn) || b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id))[0];
  if (!program || target && (target.effectiveOn > program.effectiveOn || target.effectiveOn === program.effectiveOn && target.recordedAt >= program.recordedAt)) return target;
  const mondayIndex = (localDate(date).getDay() + 6) % 7, dayType = program.trainingDays.includes(mondayIndex) ? 'training' : 'rest';
  return { id: program.id, effectiveOn: program.effectiveOn, recordedAt: program.recordedAt, values: program[dayType], dayType, goalKind: program.goal.kind };
}
export function validateNewProgram(program: GoalProgram, now = new Date()) {
  const value = goalProgramSchema.parse(program);
  if (value.effectiveOn < dayKey(now)) throw new Error('Goal changes start today or later. Earlier days keep their targets.');
  return value;
}
export const goalSources = {
  equation: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
  adultScope: 'https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner',
  startingSplit: 'https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables/reference-values-macronutrients.html',
};
