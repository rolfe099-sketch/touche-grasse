import { z } from 'zod';
import { validatePortionDrafts } from './portionDraft';
import { D, Draft, draftSchema, foodSchema, logSchema, nutrients, preparedBatchSchema, profileSchema, recipeDraftSchema, recipeSchema, recipeTotal, snapshotNutrition, validateFood } from './model';
import { quickEntrySchema } from './quickEntry';
import { targetChangeSchema } from './targets';
import { dayReviewSchema, mealShortcutSchema, validateShortcut } from './dailyWorkflows';
import { mealCorrectionSchema, validateLogCalculation } from './mealEditor';
import { validateWeighIn, weighInSchema } from './weight';
import { assertBatchCapacity, validateBatch } from './portions';
import { localDate } from './history';
import { assertSupportedFields } from './compatibility';
import { validateStoredIdentity } from '../storage/contract';
import { goalProgramSchema } from './goals';
import { mealPlanSchema, validatePlans, validatePlanDraft } from './mealPlanning';

const archiveSchema = z.object({ format: z.literal('touche-grasse'), version: z.literal(2), foods: z.array(foodSchema).max(20000), logs: z.array(logSchema).max(100000), recipes: z.array(recipeSchema).max(10000), draft: draftSchema, profile: profileSchema.optional(), recipeDrafts: z.record(z.string(), recipeDraftSchema).optional(), quickEntry: quickEntrySchema.optional(), preparedBatches: z.array(preparedBatchSchema).max(20000).optional(), targets: z.array(targetChangeSchema).max(20000).optional(), goalPrograms: z.array(goalProgramSchema).max(20000).optional(), mealPlans: z.array(mealPlanSchema).max(20000).optional(), shortcuts: z.array(mealShortcutSchema).max(1000).optional(), dayReviews: z.array(dayReviewSchema).max(100000).optional(), mealCorrections: z.array(mealCorrectionSchema).max(20000).optional(), weighIns: z.array(weighInSchema).max(100000).optional() });
export function utf8Size(value: string) {
  let bytes = 0;
  for (const char of value) { const point = char.codePointAt(0)!; bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return bytes;
}

function requireIdentities(items: { id: string }[], context: 'backup' | 'diary') {
  if (items.some(item => !item.id.length)) throw new Error(`The ${context} contains invalid record identities.`);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error(`The ${context} contains duplicate identities.`);
}
export function validateEditableDrafts(draft: Draft, recipes: Record<string, z.infer<typeof recipeDraftSchema>> = {}, context: 'backup' | 'diary' = 'backup') {
  requireIdentities([draft], context); requireIdentities(draft.lines, context);
  for (const value of Object.values(recipes)) { requireIdentities([value.recipe], context); requireIdentities(value.recipe.ingredients, context); }
}

// The same complete validation is used for file review and the actual restore.
// Parsing never changes the archive, local records or a historical snapshot.
export function parseArchive(json: string, { checkInventory = true }: { checkInventory?: boolean } = {}) {
  if (json.length > 50_000_000 || utf8Size(json) > 50_000_000) throw new Error('This backup is too large.');
  let source: unknown;
  try { source = JSON.parse(json); } catch { throw new Error('This backup is unreadable. Choose another file. Your current diary is unchanged.'); }
  if (source && typeof source === 'object' && 'version' in source && typeof source.version === 'number' && source.version > 2) throw new Error('This backup needs a newer app. Update Touche Grasse before restoring. Your current diary is unchanged.');
  const result = archiveSchema.safeParse(source);
  if (!result.success) {
    if (result.error.issues.some(issue => issue.message.includes('duplicate'))) throw new Error('The backup contains duplicate identities.');
    throw new Error('This backup contains invalid records. Your current diary is unchanged.');
  }
  const backup = result.data;
  assertSupportedFields(source, backup, 'backup');
  (backup.preparedBatches ?? []).forEach(validateBatch);
  (backup.shortcuts ?? []).forEach(validateShortcut);
  (backup.weighIns ?? []).forEach(validateWeighIn);
  (backup.mealCorrections ?? []).forEach(item => [...item.previous, ...item.applied].forEach(validateLogCalculation));
  (backup.dayReviews ?? []).forEach(review => localDate(review.id));
  backup.foods.forEach(validateFood); backup.recipes.forEach(recipeTotal);
  backup.logs.flatMap(log => [log, ...(log.corrections ?? []).map(c => c.previous)]).forEach(log => {
    const computed = snapshotNutrition(log.snapshot);
    for (const key of nutrients) {
      const a = computed[key], b = log.nutrition[key];
      if ((a == null) !== (b == null) || (a != null && b != null && !new D(a).eq(b))) throw new Error('The backup contains an invalid nutrition calculation.');
    }
  });
  const families = [['food', backup.foods], ['log', backup.logs], ['recipe', backup.recipes], ['preparedBatch', backup.preparedBatches ?? []], ['targetChange', backup.targets ?? []], ['goalProgram', backup.goalPrograms ?? []], ['mealPlan', backup.mealPlans ?? []], ['mealShortcut', backup.shortcuts ?? []], ['dayReview', backup.dayReviews ?? []], ['mealCorrection', backup.mealCorrections ?? []], ['weighIn', backup.weighIns ?? []]] as const;
  for (const [kind, items] of families) {
    requireIdentities(items, 'backup');
    for (const item of items) validateStoredIdentity({ kind, id: item.id, key: `${kind}:${item.id}`, value: item });
  }
  for (const [key, value] of Object.entries(backup.recipeDrafts ?? {})) validateStoredIdentity({ kind: 'recipeDraft', id: key, key: `recipeDraft:${key}`, value });
  validateEditableDrafts(backup.draft, backup.recipeDrafts);
  validatePortionDrafts(backup.quickEntry?.portionDrafts, backup.preparedBatches ?? []);
  validatePlans(backup.mealPlans ?? [], backup.preparedBatches ?? []);
  validatePlanDraft(backup.quickEntry?.planDraft, backup.preparedBatches ?? [], backup.mealPlans ?? []);
  if (checkInventory) assertBatchCapacity(backup.preparedBatches ?? [], backup.logs);
  return backup;
}
