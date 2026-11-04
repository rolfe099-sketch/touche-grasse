import { z } from 'zod';
import { Draft, draftSchema, Food, foodNutrition, IdFactory, Line, lineIngredient, LogEntry, parseEntry, total } from './model';
import { FoodIndex, normalize } from './search';
import { cookingRecordAllowed, preparationNeedsChoice } from './foodLanguage';
import { labelFormSchema } from './nutritionLabel';
import { repeatReviewSchema } from './repeatMeal';

// References only: nutrients always come from the current verified Food record.
export const quickEntrySchema = z.object({
  matches: z.record(z.string().max(500), z.object({ foodId: z.string().max(200), confirmedAt: z.iso.datetime() })),
  favorites: z.array(z.string().max(200)).max(20000),
  entryMethod: z.enum(['text', 'voice', 'scan']).optional(),
  repeatReview: repeatReviewSchema.optional(),
  labelDrafts: z.record(z.string().max(500), labelFormSchema).refine(value => Object.keys(value).length <= 20, 'Finish or discard an earlier label draft first.').optional(),
});
export type QuickEntryPreferences = z.infer<typeof quickEntrySchema>;
export const emptyPreferences = (): QuickEntryPreferences => ({ matches: {}, favorites: [] });
export function mealProgress(draft: Draft) {
  const rows = draft.lines.map(line => {
    try { const ingredient = lineIngredient(line); return { line, nutrition: foodNutrition(ingredient.food, ingredient.quantity, ingredient.unit), error: null }; }
    catch (error) { return { line, nutrition: null, error: line.food ? (error instanceof Error ? error.message : 'Check amount') : 'Choose product' }; }
  });
  const resolved = rows.filter(row => row.nutrition !== null);
  return { rows, resolved: resolved.length, nutrition: total(resolved.map(row => row.nutrition!)), valid: rows.length > 0 && resolved.length === rows.length && liveTextIsCurrent(draft) };
}

// Input adapters produce this boundary; resolution, review, validation and commit
// are shared. Voice/scanner/recipe providers are deliberately not added here.
export type MealInput = { kind: 'text'; text: string } | { kind: 'ingredients'; ingredients: Omit<Line, 'id'>[] };
export function matchIngredient(query: string, index: FoodIndex, preferences: QuickEntryPreferences): { food: Food | null; reason: 'remembered' | 'exact' | 'needs-choice'; candidates: Food[] } {
  const remembered = preferences.matches[normalize(query)];
  const previous = remembered && index.get(remembered.foodId);
  const learned = previous && cookingRecordAllowed(query, previous) ? previous : undefined;
  // A provider's generic product name/alias is not a confirmed cooking query.
  // Barcode reuse is immediate; text matching needs its own explicit choice.
  const exact = index.exact(query).filter(food => !['openFoodFacts', 'confirmedOCR'].includes(food.provenance.source) && cookingRecordAllowed(query, food));
  const food = learned || (exact.length === 1 && !preparationNeedsChoice(query, exact[0]) ? exact[0] : null);
  const candidates = index.search(query);
  return { food, reason: learned ? 'remembered' : food ? 'exact' : 'needs-choice', candidates: food ? [food, ...candidates.filter(f => f.id !== food.id)] : candidates };
}
export function reviewInput(input: MealInput, draft: Draft, index: FoodIndex, preferences: QuickEntryPreferences, id: IdFactory): Draft {
  const lines = input.kind === 'text' ? parseEntry(input.text, id) : input.ingredients.map(line => ({ ...line, id: id() }));
  if (draft.lines.length + lines.length > 200) throw new Error('A meal can contain up to 200 ingredients.');
  return { ...draft, text: '', textRows: undefined, lines: [...draft.lines, ...lines.map(line => ({ ...line, food: line.food ?? matchIngredient(line.query, index, preferences).food }))] };
}

// Source rows are persisted separately from editable resolved rows. Reconcile
// exact source occurrences first, then quantity changes, then renamed rows.
// This keeps confirmed products and independent edits stable during typing.
export function updateLiveText(text: string, draft: Draft, index: FoodIndex, preferences: QuickEntryPreferences, id: IdFactory): Draft {
  const parsed = parseEntry(text, id), previous = draft.textRows ?? [], used = new Set<string>();
  const current = new Map(draft.lines.map(line => [line.id, line]));
  const assignments = parsed.map(line => {
    const source = previous.find(old => !used.has(old.id) && normalize(old.query) === normalize(line.query) && old.quantityText === line.quantityText && old.unit === line.unit);
    if (source) used.add(source.id); return source;
  });
  parsed.forEach((line, position) => {
    if (assignments[position]) return;
    const source = previous.find(old => !used.has(old.id) && normalize(old.query) === normalize(line.query));
    if (source) { used.add(source.id); assignments[position] = source; }
  });
  const rows: NonNullable<Draft['textRows']> = [];
  const lines = parsed.map((source, position) => {
    const previousSource = assignments[position] ?? (previous[position] && !used.has(previous[position].id) ? previous[position] : undefined);
    if (previousSource) used.add(previousSource.id);
    const old = previousSource && current.get(previousSource.id);
    const lineId = old?.id ?? source.id;
    rows.push({ id: lineId, query: source.query, quantityText: source.quantityText, unit: source.unit });
    const sameQuery = old && previousSource && normalize(previousSource.query) === normalize(source.query);
    return { ...source, id: lineId,
      ...(sameQuery && old.entrySource ? { entrySource: old.entrySource } : {}),
      food: sameQuery ? old.food : matchIngredient(source.query, index, preferences).food,
      quantityText: sameQuery && previousSource.quantityText === source.quantityText ? old.quantityText : source.quantityText,
      unit: sameQuery && previousSource.unit === source.unit ? old.unit : source.unit };
  });
  const linked = new Set(previous.map(row => row.id));
  const manual = draft.lines.filter(line => !linked.has(line.id));
  return draftSchema.parse({ ...draft, text, textRows: rows, lines: [...lines, ...manual] });
}
export function liveTextIsCurrent(draft: Draft): boolean {
  if (!draft.text.trim()) return !draft.textRows?.length;
  if (!draft.textRows) return false;
  try {
    const parsed = parseEntry(draft.text, () => 'source');
    return parsed.length === draft.textRows.length && new Set(draft.textRows.map(row => row.id)).size === parsed.length && parsed.every((source, i) => {
      const row = draft.textRows![i];
      return row.query === source.query && row.quantityText === source.quantityText && row.unit === source.unit && draft.lines.some(line => line.id === row.id && line.query === row.query);
    });
  } catch { return false; }
}
// Quantity/unit changes and removal also update the source text, so there is
// never a stale amount in the input contradicting the visible ingredient row.
export function editLiveLine(draft: Draft, lineId: string, patch: Partial<Pick<Line, 'quantityText' | 'unit' | 'food'>> | null): Draft {
  const lines = patch ? draft.lines.map(line => line.id === lineId ? { ...line, ...patch } : line) : draft.lines.filter(line => line.id !== lineId);
  if (!draft.textRows?.some(row => row.id === lineId) || (patch && patch.quantityText === undefined && patch.unit === undefined)) return { ...draft, lines };
  const textRows = draft.textRows.filter(row => lines.some(line => line.id === row.id)).map(row => {
    const line = lines.find(line => line.id === row.id)!;
    return { ...row, quantityText: line.quantityText, unit: line.unit };
  });
  const text = textRows.map(row => row.quantityText ? `${row.quantityText}${row.unit} ${row.query}` : row.query).join(', ');
  return { ...draft, text, textRows, lines };
}
// A batch is exactly one logged action. Repeating it never accidentally includes
// unrelated food logged under the same meal label later in the day.
export function recentMealBatches(logs: LogEntry[], limit = 3, minimumEntries = 1): LogEntry[][] {
  const batches = new Map<string, LogEntry[]>();
  for (const log of [...logs].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))) {
    const batch = batches.get(log.batchId) ?? []; batch.push(log); batches.set(log.batchId, batch);
  }
  const seen = new Set<string>();
  return [...batches.values()].filter(batch => {
    if (batch.length < minimumEntries) return false;
    const signature = mealSignature(batch);
    if (seen.has(signature)) return false; seen.add(signature); return true;
  }).slice(0, limit);
}
function mealSignature(batch: LogEntry[]) {
  return JSON.stringify(batch.map(l => l.snapshot.kind === 'food' ? [l.meal, l.snapshot.ingredient.food.id, l.snapshot.ingredient.quantity, l.snapshot.ingredient.unit] : [l.meal, l.snapshot.recipe.id, l.snapshot.quantity, l.snapshot.unit]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function frequentMealBatches(logs: LogEntry[], limit = 2): LogEntry[][] {
  const batches = new Map<string, LogEntry[]>();
  for (const log of logs) { const batch = batches.get(log.batchId) ?? []; batch.push(log); batches.set(log.batchId, batch); }
  const groups = new Map<string, { entries: LogEntry[]; count: number; latest: string }>();
  for (const entries of batches.values()) {
    if (entries.length < 2) continue;
    const key = mealSignature(entries), latest = entries.reduce((at, entry) => entry.recordedAt > at ? entry.recordedAt : at, '');
    const previous = groups.get(key);
    groups.set(key, { count: (previous?.count ?? 0) + 1, latest: previous && previous.latest > latest ? previous.latest : latest, entries: previous && previous.latest > latest ? previous.entries : entries });
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest)).slice(0, limit).map(group => group.entries);
}
