import { calendarDaySchema } from './calendarDay';
import { z } from 'zod';
import { LogEntry, logSchema, meals, parseAmount, PreparedBatch, snapshotNutrition, structuredCopy, total } from './model';
import { assertBatchCapacity } from './portions';

export const repeatReviewSchema = z.object({
  id: z.string().min(1),
  entries: z.array(logSchema).min(1).max(200),
  amounts: z.array(z.string().max(100)).min(1).max(200),
  loggingDate: calendarDaySchema.optional(),
  meal: z.enum(meals).optional(),
  shortcutId: z.string().max(200).optional(),
}).refine(value => value.entries.length === value.amounts.length && new Set(value.entries.map(entry => entry.id)).size === value.entries.length, 'Check the repeat rows.');
export type RepeatReview = z.infer<typeof repeatReviewSchema>;

export function reviewRepeatedMeal(review: RepeatReview) {
  const rows = review.entries.map((entry, index) => {
    try {
      const quantity = parseAmount(review.amounts[index]);
      if (quantity === null) throw new Error('Check amount');
      const snapshot = structuredCopy(entry.snapshot);
      if (snapshot.kind === 'food') snapshot.ingredient.quantity = quantity;
      else snapshot.quantity = quantity;
      return { entry, snapshot, nutrition: snapshotNutrition(snapshot), error: null };
    } catch (reason) {
      return { entry, snapshot: null, nutrition: null, error: reason instanceof Error ? reason.message : 'Check amount' };
    }
  });
  return { rows, valid: rows.length > 0 && rows.every(row => row.nutrition !== null), nutrition: total(rows.flatMap(row => row.nutrition ? [row.nutrition] : [])) };
}

export function makeRepeatReview(entries: LogEntry[], id: string): RepeatReview {
  return repeatReviewSchema.parse({ id, entries: entries.map(entry => ({ ...structuredCopy(entry), corrections: undefined })),
    amounts: entries.map(entry => entry.snapshot.kind === 'food' ? entry.snapshot.ingredient.quantity : entry.snapshot.quantity) });
}

export function repeatAvailability(review: RepeatReview, batches: PreparedBatch[], logs: LogEntry[]): string | null {
  const progress = reviewRepeatedMeal(review);
  if (!progress.valid) return null;
  if (progress.rows.every(row => !row.entry.preparedBatchId)) return null;
  try {
    assertBatchCapacity(batches, [...logs, ...progress.rows.map(row => ({ ...row.entry, snapshot: row.snapshot!, nutrition: row.nutrition! }))]);
    return null;
  } catch (reason) { return reason instanceof Error ? reason.message : 'Check saved portions.'; }
}
