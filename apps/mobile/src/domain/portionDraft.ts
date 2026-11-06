import { z } from 'zod';
import { dayKey, IdFactory, LogEntry, PreparedBatch, parseAmount } from './model';
import { convertPortionAmount, quickBatchPortion } from './portions';

// Editable strings deliberately include blanks, decimal commas and unfinished
// dates. Validation for eating is separate from preservation of an edit.
export const portionFormSchema = z.object({
  quantities: z.object({ servings: z.string().max(100), g: z.string().max(100) }),
  unit: z.enum(['servings', 'g']),
  dateText: z.string().max(10).optional(),
});
export const portionSlotSchema = z.object({ id: z.string().min(1).max(200), value: portionFormSchema.nullable() });
export const portionDraftsSchema = z.record(z.string().min(1), portionSlotSchema).refine(value => Object.keys(value).length <= 20000, 'Too many portion drafts.');
export type PortionForm = z.infer<typeof portionFormSchema>;
export type PortionSlot = z.infer<typeof portionSlotSchema>;
export type PortionDrafts = z.infer<typeof portionDraftsSchema>;
export type PortionReview = PortionSlot & { value: PortionForm; baseId?: string };
export function openPortionReview(batch: PreparedBatch, logs: LogEntry[], slot: PortionSlot | undefined, id: IdFactory): PortionReview {
  if (slot?.value) return { id: slot.id, baseId: slot.id, value: portionFormSchema.parse(slot.value) };
  const quick = quickBatchPortion(batch, logs);
  return { id: id(), baseId: slot?.id, value: { quantities: { servings: quick?.unit === 'servings' ? quick.quantity : '1', g: quick?.unit === 'g' ? quick.quantity : '' }, unit: quick?.unit ?? 'servings' } };
}
export function switchPortionUnit(batch: PreparedBatch, form: PortionForm, unit: PortionForm['unit']): PortionForm {
  if (unit === form.unit) return form;
  const amount = form.quantities[form.unit];
  return { ...form, unit, quantities: amount.trim() ? { ...form.quantities, [unit]: convertPortionAmount(batch.recipe, amount, form.unit, unit) ?? '' } : form.quantities };
}
export function portionDraftDate(form: PortionForm, now = new Date()) { return form.dateText === undefined ? dayKey(now) : form.dateText; }
export function portionDraftAmount(form: PortionForm) { return parseAmount(form.quantities[form.unit]); }
export function portionReviewWritable(current: PortionSlot | undefined, review: PortionReview) {
  if (current?.id === review.id) return current.value !== null;
  return current?.id === review.baseId;
}
export function validatePortionDrafts(drafts: PortionDrafts | undefined, batches: PreparedBatch[]) {
  for (const [key, slot] of Object.entries(drafts ?? {})) {
    const batch = batches.find(item => item.id === key);
    if (!batch) throw new Error('A portion draft is missing its saved batch.');
    if (slot.value?.unit === 'g' && batch.recipe.cookedWeightGrams === null) throw new Error('A gram portion draft needs its measured batch weight.');
  }
}
