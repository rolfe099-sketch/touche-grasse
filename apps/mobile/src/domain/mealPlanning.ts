import { z } from 'zod';
import { calendarDaySchema } from './calendarDay';
import { D, LogEntry, meals, nutrients, nutritionSchema, parseAmount, PreparedBatch, snapshotNutrition, snapshotSchema, total } from './model';
import { portionFits } from './portions';

export const planItemsSchema = z.array(snapshotSchema).min(1).max(200);
export const mealPlanSchema = z.object({ id: z.string().min(1).max(200), date: calendarDaySchema, meal: z.enum(meals), name: z.string().trim().min(1).max(300), items: planItemsSchema, nutrition: nutritionSchema, sourceBatchId: z.string().min(1).max(500).optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), cancelledAt: z.iso.datetime().nullable(), loggedAt: z.iso.datetime().nullable(), logIds: z.array(z.string().min(1)).max(200), receipts: z.array(z.object({ at: z.iso.datetime(), ids: z.array(z.string().min(1)).min(1).max(200) })).max(200) });
export type MealPlan = z.infer<typeof mealPlanSchema>;
export const planFormSchema = z.object({ editingId: z.string().min(1).optional(), name: z.string().max(300), dateText: z.string().max(100), meal: z.enum(meals), items: z.array(snapshotSchema).max(200), amounts: z.array(z.string().max(100)).max(200), sourceBatchId: z.string().min(1).max(500).optional() });
export type PlanForm = z.infer<typeof planFormSchema>;
export const planDraftSchema = z.object({ id: z.string().min(1).max(200), value: planFormSchema.nullable() });
export type PlanDraft = z.infer<typeof planDraftSchema>;
export type PlanReview = PlanDraft & { baseId?: string };
export function formItems(form: PlanForm) {
  if (form.items.length !== form.amounts.length) throw new Error('Check each planned amount.');
  return form.items.map((item, i) => {
    const amount = parseAmount(form.amounts[i]); if (amount === null) throw new Error('Check each planned amount.');
    const snapshot = item.kind === 'food' ? { ...item, ingredient: { ...item.ingredient, quantity: amount } } : { ...item, quantity: amount };
    snapshotNutrition(snapshot); return snapshot;
  });
}
export function plannedNutrition(items: MealPlan['items']) { return total(planItemsSchema.parse(items).map(snapshotNutrition)); }
export function validatePlan(input: MealPlan): MealPlan {
  const value = mealPlanSchema.parse(input), computed = plannedNutrition(value.items);
  if (nutrients.some(k => (computed[k] == null) !== (value.nutrition[k] == null) || computed[k] != null && !new D(computed[k]!).eq(value.nutrition[k]!))) throw new Error('This plan contains an invalid nutrition calculation.');
  if (new Set(value.logIds).size !== value.logIds.length || (value.loggedAt === null) !== (value.logIds.length === 0)) throw new Error('This plan has an invalid logging state.');
  if (value.loggedAt && value.cancelledAt) throw new Error('An eaten plan cannot also be cancelled.');
  if (value.loggedAt && value.logIds.length !== value.items.length) throw new Error('This plan has an incomplete logging receipt.');
  if (value.receipts.some(r => new Set(r.ids).size !== r.ids.length) || value.loggedAt && !value.receipts.some(r => r.at === value.loggedAt && JSON.stringify(r.ids) === JSON.stringify(value.logIds))) throw new Error('This plan has an invalid logging receipt.');
  return value;
}
export function checkPlanBatch(plan: Pick<MealPlan, 'items' | 'sourceBatchId'>, batches: PreparedBatch[], logs?: LogEntry[]) {
  if (!plan.sourceBatchId) return;
  const batch = batches.find(b => b.id === plan.sourceBatchId), item = plan.items[0];
  if (!batch) throw new Error('This plan refers to a missing saved batch.');
  if (plan.items.length !== 1 || item.kind !== 'recipe' || JSON.stringify({ ...item.recipe, photo: undefined }) !== JSON.stringify({ ...batch.recipe, photo: undefined })) throw new Error('This plan does not match its saved batch snapshot.');
  if (logs) portionFits(batch, logs, item.quantity, item.unit);
}
export function validatePlans(plans: MealPlan[], batches: PreparedBatch[]) {
  const receipts = new Set<string>();
  plans.forEach(p => { validatePlan(p); checkPlanBatch(p, batches); for (const r of p.receipts) for (const id of r.ids) { if (receipts.has(id)) throw new Error('Meal plans contain duplicate logging receipts.'); receipts.add(id); } });
}
export function validatePlanDraft(draft: PlanDraft | undefined, batches: PreparedBatch[], plans: MealPlan[]) {
  const form = draft?.value; if (!form) return;
  if (form.items.length !== form.amounts.length) throw new Error('The planner draft has invalid amounts.');
  if (form.editingId && !plans.some(p => p.id === form.editingId)) throw new Error('The planner draft refers to a missing plan.');
  form.items.forEach(snapshotNutrition);
  if (form.sourceBatchId) checkPlanBatch(form, batches);
}
export function planIsLogged(plan: MealPlan, logs: LogEntry[]) { return !!plan.loggedAt || plan.receipts.some(r => r.ids.some(id => logs.some(log => log.id === id))); }
export function pendingPlans(plans: MealPlan[], date: string, logs: LogEntry[] = []) { return plans.filter(p => p.date === date && !p.cancelledAt && !planIsLogged(p, logs)); }
