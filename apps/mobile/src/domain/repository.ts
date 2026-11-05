import { z } from 'zod';
import { Change, put, StorageAdapter } from '../storage/contract';
import { D, dayKey, Draft, draftSchema, duplicateRecipe, emptyDraft, Food, foodSchema, foodNutrition, IdFactory, lineIngredient, LogEntry, logSchema, Meal, Recipe, recipePortion, recipeSchema, recipeTotal, snapshotNutrition, structuredCopy, validateFood, nutrients, profileSchema, recipeDraftSchema, Unit, PreparedBatch, preparedBatchSchema } from './model';
import { assertBatchCapacity, validateBatch, portionFits } from './portions';
import { FoodIndex, normalize } from './search';
import { emptyPreferences, liveTextIsCurrent, quickEntrySchema, QuickEntryPreferences } from './quickEntry';
import { TargetChange, targetChangeSchema, TargetValues, targetValuesSchema } from './targets';
import { sameBarcode } from './barcode';
import { makeRepeatReview, repeatReviewSchema, reviewRepeatedMeal } from './repeatMeal';
import { LabelForm, labelFormSchema } from './nutritionLabel';
import { DayReview, dayReviewSchema, daySignature, MealShortcut, mealShortcutSchema, validateShortcut } from './dailyWorkflows';
import { MealEdit, mealEditSchema, makeMealEdit, MealCorrection, mealCorrectionSchema, reviewMealEdit, validateLogCalculation } from './mealEditor';
import { WeighIn, weighInSchema, validateWeighIn, WeightUnit, weightKg, WeightDraft, weightDraftSchema } from './weight';
import { localDate } from './history';

const archiveSchema = z.object({ format: z.literal('touche-grasse'), version: z.literal(2), foods: z.array(foodSchema).max(20000), logs: z.array(logSchema).max(100000), recipes: z.array(recipeSchema).max(10000), draft: draftSchema, profile: profileSchema.optional(), recipeDrafts: z.record(z.string(), recipeDraftSchema).optional(), quickEntry: quickEntrySchema.optional(), preparedBatches: z.array(preparedBatchSchema).max(20000).optional(), targets: z.array(targetChangeSchema).max(20000).optional(), shortcuts: z.array(mealShortcutSchema).max(1000).optional(), dayReviews: z.array(dayReviewSchema).max(100000).optional(), mealCorrections: z.array(mealCorrectionSchema).max(20000).optional(), weighIns: z.array(weighInSchema).max(100000).optional() });
function utf8Size(value: string) {
  let bytes = 0;
  for (const char of value) { const point = char.codePointAt(0)!; bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4; }
  return bytes;
}
export class Repository {
  readonly index = new FoodIndex();
  targets: TargetChange[] = [];
  shortcuts: MealShortcut[] = [];
  dayReviews: DayReview[] = [];
  mealCorrections: MealCorrection[] = [];
  weighIns: WeighIn[] = [];
  private correctionUndo: string | null = null;
  get isCorrectionUndo() { return !!this.correctionUndo && this.mealCorrections.some(item => item.id === this.correctionUndo && !item.revertedAt); }
  get undoToken() { return JSON.stringify([this.undo, this.isDeletionUndo, this.correctionUndo]); }
  private catalogFoods = new Map<string, Food>();
  foods: Food[] = [];
  preparedBatches: PreparedBatch[] = [];
  logs: LogEntry[] = [];
  recipes: Recipe[] = [];
  draft: Draft;
  undo: string[] = [];
  private deletionUndo: LogEntry[] = [];
  get isDeletionUndo() { return !!this.deletionUndo.length && this.deletionUndo.length === this.undo.length && this.deletionUndo.every(log => this.undo.includes(log.id)); }
  get undoLabel() { if (this.isCorrectionUndo) return 'Undo meal correction'; return this.isDeletionUndo ? 'Undo deletion' : 'Undo last log'; }
  get undoNotice() { if (this.isCorrectionUndo) return 'Meal correction undone'; return this.isDeletionUndo ? 'Deletion undone' : 'Log undone'; }
  profile = { firstUsedAt: new Date().toISOString() };
  recipeDrafts: Record<string, z.infer<typeof recipeDraftSchema>> = {};
  quickEntry: QuickEntryPreferences = emptyPreferences();
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: StorageAdapter, readonly id: IdFactory) { this.draft = emptyDraft(id); }
  async initialize(catalog: Food[], yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0))) {
    this.catalogFoods = new Map(catalog.map(food => [food.id, food]));
    for (let i = 0; i < catalog.length; i += 100) {
      catalog.slice(i, i + 100).forEach(f => this.index.add(f));
      await yieldToUI();
    }
    const loaded = await this.storage.load();
    this.revision = loaded.revision;
    for (const record of loaded.records) {
      if (record.kind === 'food') this.foods.push(validateFood(foodSchema.parse(record.value)));
      else if (record.kind === 'log') this.logs.push(logSchema.parse(record.value));
      else if (record.kind === 'recipe') this.recipes.push(recipeSchema.parse(record.value));
      else if (record.kind === 'draft') this.draft = draftSchema.parse(record.value);
      else if (record.kind === 'undo') this.undo = z.array(z.string()).parse(record.value);
      else if (record.kind === 'deletionUndo') this.deletionUndo = z.array(logSchema).parse(record.value);
      else if (record.kind === 'profile') this.profile = profileSchema.parse(record.value);
      else if (record.kind === 'recipeDraft') this.recipeDrafts[record.id] = recipeDraftSchema.parse(record.value);
      else if (record.kind === 'preparedBatch') this.preparedBatches.push(validateBatch(record.value as PreparedBatch));
      else if (record.kind === 'quickEntry') this.quickEntry = quickEntrySchema.parse(record.value);
      else if (record.kind === 'targetChange') this.targets.push(targetChangeSchema.parse(record.value));
      else if (record.kind === 'mealShortcut') this.shortcuts.push(validateShortcut(record.value));
      else if (record.kind === 'mealCorrection') { const correction = mealCorrectionSchema.parse(record.value); [...correction.previous, ...correction.applied].forEach(validateLogCalculation); this.mealCorrections.push(correction); }
      else if (record.kind === 'correctionUndo') this.correctionUndo = z.string().nullable().parse(record.value);
      else if (record.kind === 'weighIn') this.weighIns.push(validateWeighIn(record.value));
      else if (record.kind === 'dayReview') this.dayReviews.push(dayReviewSchema.parse(record.value));
    }
    const earliest = [this.profile.firstUsedAt, ...this.logs.flatMap(log => [log.recordedAt, ...(log.corrections ?? []).map(c => c.previous.recordedAt)])].sort()[0];
    if (!loaded.records.some(record => record.kind === 'profile') || earliest !== this.profile.firstUsedAt) await this.commit([put('profile', 'identity', { firstUsedAt: earliest })]);
    assertBatchCapacity(this.preparedBatches, this.logs);
    this.sortAndIndex();
  }
  private sortAndIndex() {
    this.logs.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    // Enrich only new selections of an unchanged official record. Never mutate
    // saved foods, drafts, recipes, prepared batches or historical snapshots.
    const selections = this.foods.map(food => {
      const official = this.catalogFoods.get(food.id);
      if (food.nutrition.fiber !== undefined || !official || food.provenance.source !== 'matvaretabellen' ||
        food.provenance.sourceID !== official.provenance.sourceID || food.provenance.retrievedAt !== official.provenance.retrievedAt ||
        food.referenceUnit !== official.referenceUnit || food.name !== official.name ||
        !['kcal', 'protein', 'carbohydrate', 'fat'].every(key => food.nutrition[key as keyof Food['nutrition']] === official.nutrition[key as keyof Food['nutrition']])) return food;
      return { ...food, nutrition: { ...food.nutrition, fiber: official.nutrition.fiber }, provenance: { ...food.provenance, nutrientSources: { ...food.provenance.nutrientSources, fiber: official.provenance.nutrientSources.fiber } } };
    });
    this.index.setPersonal(selections, this.logs, this.quickEntry.favorites, this.quickEntry.matches);
  }
  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async commit(changes: Change[]) {
    const dates = [this.profile.firstUsedAt];
    for (const change of changes) if (change.type === 'put') {
      if (change.record.kind === 'log') { const log = change.record.value as LogEntry; dates.push(log.recordedAt, ...(log.corrections ?? []).map(c => c.previous.recordedAt)); }
      if (change.record.kind === 'weighIn') dates.push(localDate((change.record.value as WeighIn).id).toISOString());
      if (change.record.kind === 'profile') dates.push(profileSchema.parse(change.record.value).firstUsedAt);
    }
    const profile = { firstUsedAt: dates.sort()[0] };
    const correctionState = changes.find(change => change.type === 'put' && change.record.kind === 'correctionUndo');
    const clearsCorrection = changes.some(change => change.type === 'put' && change.record.kind === 'undo') && !correctionState;
    const batch = [...(clearsCorrection ? [put('correctionUndo', 'latest', null)] : []), ...changes.filter(change => change.type !== 'put' || change.record.kind !== 'profile'), put('profile', 'identity', profile)];
    this.revision = await this.storage.commit(batch, this.revision); this.profile = profile;
    if (clearsCorrection) this.correctionUndo = null;
    else if (correctionState?.type === 'put') this.correctionUndo = z.string().nullable().parse(correctionState.record.value);
  }
  private checkBarcodes(foods: Food[]) {
    const map = new Map<string, string>();
    for (const food of foods) if (food.barcode) {
      const existing = map.get(food.barcode);
      if (existing && existing !== food.id) throw new Error('This barcode is already linked to another food.');
      map.set(food.barcode, food.id);
    }
  }
  saveFood(input: Food, inputDraft?: Draft, labelDraftKey?: string) {
    const food = validateFood(structuredCopy(input));
    const draft = inputDraft ? draftSchema.parse(structuredCopy(inputDraft)) : undefined;
    return this.serialized(async () => {
      if (labelDraftKey && food.barcode && this.foods.some(item => item.id !== food.id && item.barcode && sameBarcode(item.barcode, food.barcode!))) throw new Error('This barcode already has a saved food. Edit that label in Library.');
      const foods = [...this.foods.filter(f => f.id !== food.id), food]; this.checkBarcodes(foods);
      const labelDrafts = { ...this.quickEntry.labelDrafts }; if (labelDraftKey) delete labelDrafts[labelDraftKey];
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, labelDrafts });
      await this.commit([put('food', food.id, food), ...(draft ? [put('draft', 'active', draft)] : []), ...(labelDraftKey ? [put('quickEntry', 'preferences', preferences)] : [])]);
      if (labelDraftKey) this.quickEntry = preferences;
      this.foods = foods; if (draft) this.draft = draft; this.sortAndIndex();
    });
  }
  saveLabelDraft(key: string, input: LabelForm | null) {
    z.string().min(1).max(500).parse(key); const form = input ? labelFormSchema.parse(structuredCopy(input)) : null;
    return this.serialized(async () => {
      const labelDrafts = { ...this.quickEntry.labelDrafts }; if (form) labelDrafts[key] = form; else delete labelDrafts[key];
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, labelDrafts });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  saveDraft(input: Draft) {
    const draft = draftSchema.parse(structuredCopy(input));
    return this.serialized(async () => { await this.commit([put('draft', 'active', draft)]); this.draft = draft; });
  }
  addBarcodeFood(input: Food, inputDraft: Draft, amount = '100') {
    const food = validateFood(structuredCopy(input));
    foodNutrition(food, amount, food.referenceUnit);
    const draft = draftSchema.parse({ ...structuredCopy(inputDraft), lines: [...inputDraft.lines, { id: this.id(), query: food.name, food, quantityText: amount, unit: food.referenceUnit, entrySource: 'barcode' }] });
    return this.serialized(async () => {
      const unchangedBarcode = this.foods.some(item => item.id === food.id && item.barcode === food.barcode);
      if (!unchangedBarcode && food.barcode && this.foods.some(item => item.id !== food.id && item.barcode && sameBarcode(item.barcode, food.barcode!))) throw new Error('This barcode is already linked to a saved food. Scan it again to use your saved record.');
      const foods = [...this.foods.filter(item => item.id !== food.id), food]; this.checkBarcodes(foods);
      await this.commit([put('food', food.id, food), put('draft', 'active', draft)]);
      this.foods = foods; this.draft = draft; this.sortAndIndex();
    });
  }
  saveTargets(input: TargetValues, at = new Date()) {
    const values = targetValuesSchema.parse(structuredCopy(input));
    const effectiveOn = dayKey(at);
    return this.serialized(async () => {
      // Keep every revision; same-day saves have an unambiguous order even within one millisecond.
      const latest = Math.max(0, ...this.targets.map(change => Date.parse(change.recordedAt)));
      const change = targetChangeSchema.parse({ id: this.id(), effectiveOn, recordedAt: new Date(Math.max(at.getTime(), latest + 1)).toISOString(), values });
      await this.commit([put('targetChange', change.id, change)]);
      this.targets = [...this.targets, change];
      return change;
    });
  }
  saveEntryMethod(entryMethod: 'text' | 'voice' | 'scan') {
    return this.serialized(async () => {
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, entryMethod });
      await this.commit([put('quickEntry', 'preferences', preferences)]);
      this.quickEntry = preferences;
    });
  }
  archiveLibrary(kind: 'food' | 'recipe', id: string, hidden: boolean) {
    return this.serialized(async () => {
      if (!(kind === 'food' ? this.foods : this.recipes).some(item => item.id === id)) throw new Error('This library item is no longer available.');
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, libraryHidden: { ...this.quickEntry.libraryHidden, [`${kind}:${id}`]: hidden } });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  toggleFavorite(food: Food) {
    const copy = validateFood(structuredCopy(food));
    return this.serialized(async () => {
      const favorites = this.quickEntry.favorites.includes(copy.id) ? this.quickEntry.favorites.filter(id => id !== copy.id) : [...this.quickEntry.favorites, copy.id];
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, favorites });
      const foods = [...this.foods.filter(f => f.id !== copy.id), copy]; this.checkBarcodes(foods);
      await this.commit([put('food', copy.id, copy), put('quickEntry', 'preferences', preferences)]);
      this.foods = foods; this.quickEntry = preferences; this.sortAndIndex();
    });
  }
  logDraft(input: Draft, at = new Date()) {
    const draft = draftSchema.parse(structuredCopy(input));
    return this.serialized(async () => {
      if (this.preparedBatches.some(batch => batch.id === draft.id)) throw new Error('This meal was saved as a batch. Log a portion from Saved portions.');
      if (!draft.lines.length || !liveTextIsCurrent(draft)) throw new Error('Wait for every ingredient to appear and check the highlighted rows before logging.');
      if (new Set(draft.lines.map(l => l.id)).size !== draft.lines.length) throw new Error('This meal contains duplicate rows.');
      const entries: LogEntry[] = draft.lines.map(line => {
        const snapshot: LogEntry['snapshot'] = { kind: 'food', ingredient: lineIngredient(line) };
        return { id: line.id, batchId: draft.id, recordedAt: at.toISOString(), meal: draft.meal, snapshot, nutrition: snapshotNutrition(snapshot) };
      });
      const fresh = entries.filter(e => !this.logs.some(l => l.id === e.id));
      if (!fresh.length) return;
      const foodMap = new Map(this.foods.map(f => [f.id, f]));
      draft.lines.forEach(line => foodMap.set(line.food!.id, line.food!));
      const foods = [...foodMap.values()]; this.checkBarcodes(foods);
      const nextDraft = emptyDraft(this.id), ids = fresh.map(e => e.id);
      const matches = { ...this.quickEntry.matches };
      // Log is the user's confirmation of the complete review. Last correction
      // wins. A cancelled draft or failed transaction never teaches a match.
      for (const line of draft.lines) if (!line.entrySource && normalize(line.query)) matches[normalize(line.query)] = { foodId: line.food!.id, confirmedAt: at.toISOString() };
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, matches });
      await this.commit([...draft.lines.map(l => put('food', l.food!.id, l.food)), ...fresh.map(e => put('log', e.id, e)), put('draft', 'active', nextDraft), put('undo', 'latest', ids), put('deletionUndo', 'latest', []), put('quickEntry', 'preferences', preferences)]);
      this.quickEntry = preferences;
      this.foods = foods; this.logs = [...this.logs, ...fresh]; this.draft = nextDraft; this.undo = ids; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  repeat(entry: LogEntry, at = new Date()) {
    return this.repeatMeal([entry.id], at);
  }
  saveShortcut(name: string, input: LogEntry[], shortcutId?: string) {
    const entries = structuredCopy(input);
    return this.serialized(async () => {
      const previous = shortcutId ? this.shortcuts.find(item => item.id === shortcutId && !item.deletedAt) : undefined;
      if (shortcutId && !previous) throw new Error('This shortcut is no longer available.');
      const now = new Date().toISOString();
      const shortcut = validateShortcut({ id: previous?.id ?? this.id(), name, entries: entries.map(entry => ({ ...entry, corrections: undefined })), pinned: previous?.pinned ?? true, createdAt: previous?.createdAt ?? now, updatedAt: now, deletedAt: null });
      if (this.shortcuts.some(item => item.id !== shortcut.id && !item.deletedAt && normalize(item.name) === normalize(shortcut.name))) throw new Error('A shortcut already uses that name. Choose another name.');
      if (!previous && this.shortcuts.length >= 1000) throw new Error('Your library has reached 1,000 shortcuts.');
      await this.commit([put('mealShortcut', shortcut.id, shortcut)]);
      this.shortcuts = [...this.shortcuts.filter(item => item.id !== shortcut.id), shortcut];
      return shortcut;
    });
  }
  saveDraftShortcut(name: string, input: Draft) {
    const draft = draftSchema.parse(structuredCopy(input));
    if (!draft.lines.length || !liveTextIsCurrent(draft)) throw new Error('Resolve every ingredient first.');
    if (draft.splitPlan) throw new Error('Save this batch first. A shortcut must describe the portion you eat.');
    return this.saveShortcut(name, draft.lines.map(line => { const snapshot: LogEntry['snapshot'] = { kind: 'food', ingredient: lineIngredient(line) }; return { id: line.id, batchId: draft.id, recordedAt: new Date().toISOString(), meal: draft.meal, snapshot, nutrition: snapshotNutrition(snapshot) }; }));
  }
  changeShortcut(id: string, change: { pinned?: boolean; deleted?: boolean }) {
    return this.serialized(async () => {
      const original = this.shortcuts.find(item => item.id === id);
      if (!original) throw new Error('This shortcut is no longer available.');
      const now = new Date().toISOString();
      const shortcut = validateShortcut({ ...original, pinned: change.pinned ?? original.pinned, deletedAt: change.deleted === undefined ? original.deletedAt : change.deleted ? now : null, updatedAt: now });
      if (!shortcut.deletedAt && this.shortcuts.some(item => item.id !== id && !item.deletedAt && normalize(item.name) === normalize(shortcut.name))) throw new Error('Another shortcut now uses this name. Rename it before restoring this one.');
      await this.commit([put('mealShortcut', id, shortcut)]);
      this.shortcuts = this.shortcuts.map(item => item.id === id ? shortcut : item);
    });
  }
  private shortcutEntries(id: string) {
    const shortcut = this.shortcuts.find(item => item.id === id && !item.deletedAt);
    if (!shortcut) throw new Error('This shortcut is no longer available.');
    return structuredCopy(shortcut.entries);
  }
  logShortcut(id: string, at = new Date()) {
    return this.serialized(async () => {
      const batchId = this.id();
      const logs = this.shortcutEntries(id).map(entry => logSchema.parse({ ...entry, id: this.id(), batchId, recordedAt: at.toISOString(), corrections: undefined, nutrition: snapshotNutrition(entry.snapshot) }));
      assertBatchCapacity(this.preparedBatches, [...this.logs, ...logs]);
      const undo = logs.map(entry => entry.id);
      await this.commit([...logs.map(entry => put('log', entry.id, entry)), put('undo', 'latest', undo), put('deletionUndo', 'latest', [])]);
      this.logs = [...this.logs, ...logs]; this.undo = undo; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  startShortcutReview(id: string) {
    return this.serialized(async () => {
      if (this.quickEntry.mealEdit) throw new Error('Finish or cancel your meal edit first.');
      if (this.quickEntry.repeatReview) throw new Error('Finish or cancel your current adjusted meal first.');
      const repeatReview = { ...makeRepeatReview(this.shortcutEntries(id), this.id()), shortcutId: id };
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, repeatReview });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  setDayComplete(date: string, complete: boolean, now = new Date()) {
    localDate(date);
    if (date > dayKey(now)) throw new Error('A future day cannot be marked complete.');
    return this.serialized(async () => {
      const review = dayReviewSchema.parse({ id: date, complete, signature: daySignature(this.logs, date), updatedAt: now.toISOString() });
      await this.commit([put('dayReview', date, review), ...(complete ? [put('profile', 'identity', { firstUsedAt: localDate(date).toISOString() })] : [])]);
      this.dayReviews = [...this.dayReviews.filter(item => item.id !== date), review];
    });
  }
  saveWeighIn(date: string, text: string, unit: WeightUnit = 'kg', now = new Date()) {
    localDate(date); if (date > dayKey(now)) throw new Error('Choose today or an earlier weigh-in date.');
    const kg = weightKg(text, unit);
    return this.serialized(async () => {
      const current = this.weighIns.find(item => item.id === date);
      if ((current?.previous.length ?? 0) >= 200) throw new Error('This weigh-in has reached its correction limit.');
      const value = validateWeighIn({ id: date, kg, recordedAt: now.toISOString(), deletedAt: null, previous: current ? [...current.previous, { kg: current.kg, recordedAt: current.recordedAt }] : [] });
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, weightUnit: unit, weightDraft: null });
      await this.commit([put('weighIn', date, value), put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences; this.weighIns = [...this.weighIns.filter(item => item.id !== date), value];
    });
  }
  deleteWeighIn(date: string, deleted = true) {
    return this.serialized(async () => {
      const current = this.weighIns.find(item => item.id === date); if (!current) throw new Error('This weigh-in is no longer available.');
      const value = { ...current, deletedAt: deleted ? new Date().toISOString() : null };
      await this.commit([put('weighIn', date, value)]); this.weighIns = this.weighIns.map(item => item.id === date ? value : item);
    });
  }
  saveWeightDraft(input: WeightDraft | null) {
    const draft = input ? weightDraftSchema.parse(structuredCopy(input)) : null;
    return this.serialized(async () => {
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, weightDraft: draft });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  startMealEdit(entryIds: string[] | { shortcutId: string }) {
    const target = structuredCopy(entryIds);
    return this.serialized(async () => {
      if (this.quickEntry.mealEdit || this.quickEntry.repeatReview) throw new Error('Finish or cancel the open meal review first.');
      const entries = Array.isArray(target) ? [...new Set(target)].map(id => { const entry = this.logs.find(item => item.id === id); if (!entry) throw new Error('This entry is no longer available.'); return entry; }) : this.shortcutEntries(target.shortcutId);
      const mealEdit = makeMealEdit(entries, this.id(), Array.isArray(target) ? undefined : target.shortcutId);
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, mealEdit });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  editRepeatFoods(reviewId: string) {
    return this.serialized(async () => {
      const review = this.quickEntry.repeatReview;
      if (!review || review.id !== reviewId || !review.shortcutId) throw new Error('Open a saved shortcut to edit its ingredients.');
      const progress = reviewRepeatedMeal(review); if (!progress.valid) throw new Error('Check the amounts first.');
      const original = this.shortcutEntries(review.shortcutId), mealEdit = makeMealEdit(original, this.id(), review.shortcutId);
      mealEdit.rows = progress.rows.map(row => ({ entry: { ...row.entry, snapshot: row.snapshot!, nutrition: row.nutrition! }, amount: row.snapshot!.kind === 'food' ? row.snapshot!.ingredient.quantity : row.snapshot!.quantity, ingredients: {} }));
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, mealEdit, repeatReview: undefined });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  saveMealEditDraft(input: MealEdit) {
    const mealEdit = mealEditSchema.parse(structuredCopy(input));
    return this.serialized(async () => {
      if (this.quickEntry.mealEdit?.id !== mealEdit.id) throw new Error('This meal edit is no longer open.');
      // Target and concurrency baseline are immutable; only editable rows change.
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, mealEdit: { ...this.quickEntry.mealEdit, rows: mealEdit.rows } });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  cancelMealEdit(id: string) {
    return this.serialized(async () => {
      if (this.quickEntry.mealEdit?.id !== id) throw new Error('This meal edit is no longer open.');
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, mealEdit: undefined });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  commitMealEdit(id: string) {
    return this.serialized(async () => {
      const edit = this.quickEntry.mealEdit; if (!edit || edit.id !== id) throw new Error('This meal edit is no longer open.');
      const current = edit.target === 'shortcut' ? this.shortcutEntries(edit.shortcutId!) : edit.original.map(original => this.logs.find(entry => entry.id === original.id));
      if (JSON.stringify(current.map(entry => entry ? logSchema.parse(entry) : null)) !== JSON.stringify(edit.original)) throw new Error('This meal changed while you were editing. Cancel and reopen it to keep the newer changes.');
      const progress = reviewMealEdit(edit); if (!progress.valid) throw new Error('Resolve every ingredient and amount before saving.');
      const now = new Date().toISOString(), first = edit.original[0];
      const applied = progress.rows.map(({ row, snapshot, nutrition }) => {
        const original = edit.original.find(entry => entry.id === row.entry.id);
        if (!original && this.logs.some(entry => entry.id === row.entry.id)) throw new Error('A new row has an existing diary identity.');
        if (original && JSON.stringify(original.snapshot) === JSON.stringify(snapshot)) return structuredCopy(original);
        const baseline = original ?? { id: row.entry.id, batchId: first.batchId, recordedAt: first.recordedAt, meal: first.meal };
        let batchRecipe = original?.batchRecipe;
        if (original?.preparedBatchId) {
          if (original.snapshot.kind !== 'recipe' || snapshot!.kind !== 'recipe') throw new Error('Keep a saved portion as a recipe. Add extra foods separately.');
          batchRecipe = original.batchRecipe ?? original.snapshot.recipe;
          if (snapshot!.recipe.servings !== batchRecipe.servings || snapshot!.recipe.cookedWeightGrams !== batchRecipe.cookedWeightGrams) throw new Error('Keep the original serving and measured weight basis.');
        }
        const changed = original && JSON.stringify(original.snapshot) !== JSON.stringify(snapshot);
        if (changed && (original.corrections?.length ?? 0) >= 200) throw new Error('This entry has reached its correction limit.');
        return logSchema.parse({ ...baseline, snapshot, nutrition, batchRecipe,
          corrections: edit.target === 'logs' && changed ? [...(original.corrections ?? []), { correctedAt: now, previous: { recordedAt: original.recordedAt, meal: original.meal, snapshot: original.snapshot, nutrition: original.nutrition, batchRecipe: original.batchRecipe } }] : original?.corrections });
      });
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, mealEdit: undefined });
      if (edit.target === 'shortcut') {
        const previous = this.shortcuts.find(item => item.id === edit.shortcutId)!;
        const shortcut = validateShortcut({ ...previous, entries: applied.map(entry => ({ ...entry, corrections: undefined })), updatedAt: now });
        // Validate finite portion references without consuming a portion.
        assertBatchCapacity(this.preparedBatches, applied);
        await this.commit([put('mealShortcut', shortcut.id, shortcut), put('quickEntry', 'preferences', preferences)]);
        this.shortcuts = this.shortcuts.map(item => item.id === shortcut.id ? shortcut : item); this.quickEntry = preferences; return;
      }
      if (this.mealCorrections.length >= 20000) throw new Error('This diary has reached its meal-correction limit.');
      const removedIds = new Set(edit.original.map(entry => entry.id)), logs = [...this.logs.filter(entry => !removedIds.has(entry.id)), ...applied];
      assertBatchCapacity(this.preparedBatches, logs);
      const correction = mealCorrectionSchema.parse({ id: this.id(), correctedAt: now, previous: edit.original, applied, revertedAt: null });
      await this.commit([...edit.original.map(entry => ({ type: 'delete' as const, key: `log:${entry.id}` })), ...applied.map(entry => put('log', entry.id, entry)), put('mealCorrection', correction.id, correction), put('correctionUndo', 'latest', correction.id), put('undo', 'latest', applied.map(entry => entry.id)), put('deletionUndo', 'latest', []), put('quickEntry', 'preferences', preferences)]);
      this.logs = logs; this.mealCorrections = [...this.mealCorrections, correction]; this.undo = applied.map(entry => entry.id); this.deletionUndo = []; this.quickEntry = preferences; this.sortAndIndex();
    });
  }
  startRepeatReview(entryIds: string[]) {
    const ids = [...new Set(entryIds)];
    return this.serialized(async () => {
      if (this.quickEntry.mealEdit) throw new Error('Finish or cancel your meal edit first.');
      if (this.quickEntry.repeatReview) throw new Error('Finish or cancel your current repeat first.');
      if (!ids.length || ids.length > 200) throw new Error('Choose a meal with 1–200 entries.');
      const entries = ids.map(id => { const entry = this.logs.find(log => log.id === id); if (!entry) throw new Error('This meal is no longer available.'); return entry; });
      const repeatReview = makeRepeatReview(entries, this.id());
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, repeatReview });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  saveRepeatAmounts(reviewId: string, input: string[]) {
    const amounts = [...input];
    return this.serialized(async () => {
      const current = this.quickEntry.repeatReview;
      if (!current || current.id !== reviewId) throw new Error('This repeat is no longer open.');
      const repeatReview = repeatReviewSchema.parse({ ...current, amounts });
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, repeatReview });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  cancelRepeatReview(reviewId: string) {
    return this.serialized(async () => {
      if (this.quickEntry.repeatReview?.id !== reviewId) throw new Error('This repeat is no longer open.');
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, repeatReview: undefined });
      await this.commit([put('quickEntry', 'preferences', preferences)]); this.quickEntry = preferences;
    });
  }
  logRepeatReview(reviewId: string, at = new Date()) {
    return this.serialized(async () => {
      const review = this.quickEntry.repeatReview;
      if (!review || review.id !== reviewId) throw new Error('This repeat is no longer open.');
      const progress = reviewRepeatedMeal(review);
      if (!progress.valid) throw new Error('Check the highlighted amounts before logging.');
      const batchId = this.id();
      const logs = progress.rows.map(row => logSchema.parse({ id: this.id(), batchId, recordedAt: at.toISOString(), meal: row.entry.meal, preparedBatchId: row.entry.preparedBatchId, batchRecipe: row.entry.batchRecipe, snapshot: row.snapshot, nutrition: row.nutrition }));
      assertBatchCapacity(this.preparedBatches, [...this.logs, ...logs]);
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, repeatReview: undefined }), undo = logs.map(log => log.id);
      await this.commit([...logs.map(log => put('log', log.id, log)), put('quickEntry', 'preferences', preferences), put('undo', 'latest', undo), put('deletionUndo', 'latest', [])]);
      this.logs = [...this.logs, ...logs]; this.quickEntry = preferences; this.undo = undo; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  repeatMeal(entryIds: string[], at = new Date()) {
    const ids = [...new Set(entryIds)];
    return this.serialized(async () => {
      if (!ids.length || ids.length > 200) throw new Error('Choose a meal with 1–200 entries.');
      const batchId = this.id();
      const logs = ids.map(id => {
        const entry = this.logs.find(log => log.id === id);
        if (!entry) throw new Error('This meal is no longer available.');
        const snapshot = structuredCopy(entry.snapshot);
        return logSchema.parse({ ...entry, snapshot, nutrition: snapshotNutrition(snapshot), id: this.id(), batchId, recordedAt: at.toISOString(), corrections: undefined });
      });
      assertBatchCapacity(this.preparedBatches, [...this.logs, ...logs]);
      const undo = logs.map(log => log.id);
      await this.commit([...logs.map(log => put('log', log.id, log)), put('undo', 'latest', undo), put('deletionUndo', 'latest', [])]);
      this.logs = [...this.logs, ...logs]; this.undo = undo; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  deleteLogs(entryIds: string[]) {
    const ids = [...new Set(entryIds)];
    return this.serialized(async () => {
      if (!ids.length || ids.length > 200) throw new Error('Choose 1–200 entries to delete.');
      const deleted = ids.map(id => {
        const entry = this.logs.find(log => log.id === id);
        if (!entry) throw new Error('This entry is no longer available.');
        return structuredCopy(entry);
      });
      await this.commit([...ids.map(id => ({ type: 'delete' as const, key: `log:${id}` })), put('undo', 'latest', ids), put('deletionUndo', 'latest', deleted)]);
      this.logs = this.logs.filter(log => !ids.includes(log.id)); this.undo = ids; this.deletionUndo = deleted; this.sortAndIndex();
    });
  }
  undoLast() {
    return this.serialized(async () => {
      if (!this.undo.length) return;
      if (this.isCorrectionUndo) {
        const correction = this.mealCorrections.find(item => item.id === this.correctionUndo)!;
        if (correction.applied.some(applied => JSON.stringify(this.logs.find(entry => entry.id === applied.id)) !== JSON.stringify(applied))) throw new Error('The corrected meal changed again. Its previous values are kept in correction history.');
        const ids = new Set(correction.applied.map(entry => entry.id)), remaining = this.logs.filter(entry => !ids.has(entry.id));
        if (correction.previous.some(entry => remaining.some(item => item.id === entry.id))) throw new Error('An original entry already exists.');
        const logs = [...remaining, ...structuredCopy(correction.previous)]; assertBatchCapacity(this.preparedBatches, logs);
        const reverted = { ...correction, revertedAt: new Date().toISOString() };
        await this.commit([...correction.applied.map(entry => ({ type: 'delete' as const, key: `log:${entry.id}` })), ...correction.previous.map(entry => put('log', entry.id, entry)), put('mealCorrection', correction.id, reverted), put('undo', 'latest', []), put('deletionUndo', 'latest', [])]);
        this.mealCorrections = this.mealCorrections.map(item => item.id === reverted.id ? reverted : item); this.logs = logs; this.undo = []; this.deletionUndo = []; this.sortAndIndex(); return;
      }
      if (this.isDeletionUndo) {
        if (this.deletionUndo.some(deleted => this.logs.some(log => log.id === deleted.id))) throw new Error('These entries already exist. Reload before continuing.');
        const restored = [...this.logs, ...this.deletionUndo];
        assertBatchCapacity(this.preparedBatches, restored);
        // Restore the exact snapshots and correction history, never recalculate.
        await this.commit([...this.deletionUndo.map(log => put('log', log.id, log)), put('undo', 'latest', []), put('deletionUndo', 'latest', [])]);
        this.logs = restored; this.undo = []; this.deletionUndo = []; this.sortAndIndex(); return;
      }
      const ids = new Set(this.undo);
      await this.commit([...this.undo.map(id => ({ type: 'delete' as const, key: `log:${id}` })), put('undo', 'latest', []), put('deletionUndo', 'latest', [])]);
      this.logs = this.logs.filter(l => !ids.has(l.id)); this.undo = []; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  correctLog(id: string, patch: { quantity: string; unit?: Unit | 'servings'; recordedAt?: string; meal?: Meal }) {
    return this.serialized(async () => {
      const entry = this.logs.find(log => log.id === id);
      if (!entry) throw new Error('This entry is no longer available.');
      if ((entry.corrections?.length ?? 0) >= 200) throw new Error('This entry has reached its correction limit.');
      const snapshot = structuredCopy(entry.snapshot);
      if (snapshot.kind === 'food') {
        if (patch.unit === 'servings') throw new Error('Choose a food quantity unit.');
        snapshot.ingredient.quantity = patch.quantity; snapshot.ingredient.unit = patch.unit ?? snapshot.ingredient.unit;
      } else {
        if (patch.unit && patch.unit !== 'g' && patch.unit !== 'servings') throw new Error('Choose grams or servings for a recipe.');
        snapshot.quantity = patch.quantity; snapshot.unit = patch.unit ?? snapshot.unit;
      }
      const previous = { batchRecipe: entry.batchRecipe, recordedAt: entry.recordedAt, meal: entry.meal, snapshot: entry.snapshot, nutrition: entry.nutrition };
      const corrected = logSchema.parse({ ...entry, recordedAt: patch.recordedAt ?? entry.recordedAt, meal: patch.meal ?? entry.meal, snapshot, nutrition: snapshotNutrition(snapshot), corrections: [...(entry.corrections ?? []), { correctedAt: new Date().toISOString(), previous }] });
      assertBatchCapacity(this.preparedBatches, this.logs.map(log => log.id === id ? corrected : log));
      const invalidateCorrectionUndo = this.isCorrectionUndo && this.undo.includes(id);
      await this.commit([put('log', id, corrected), ...(invalidateCorrectionUndo ? [put('undo', 'latest', []), put('deletionUndo', 'latest', [])] : [])]);
      if (invalidateCorrectionUndo) { this.undo = []; this.deletionUndo = []; }
      this.logs = this.logs.map(log => log.id === id ? corrected : log); this.sortAndIndex();
    });
  }
  saveRecipeDraft(key: string, input: z.infer<typeof recipeDraftSchema>) {
    const value = recipeDraftSchema.parse(structuredCopy(input));
    return this.serialized(async () => { await this.commit([put('recipeDraft', key, value)]); this.recipeDrafts[key] = value; });
  }
  saveRecipe(input: Recipe, draftKey?: string) {
    const recipe = recipeSchema.parse(structuredCopy(input)); recipeTotal(recipe);
    return this.serialized(async () => {
      await this.commit([put('recipe', recipe.id, recipe), ...(draftKey ? [{ type: 'delete' as const, key: `recipeDraft:${draftKey}` }] : [])]);
      this.recipes = [...this.recipes.filter(r => r.id !== recipe.id), recipe];
      if (draftKey) delete this.recipeDrafts[draftKey];
    });
  }
  duplicate(recipe: Recipe) { return this.saveRecipe(duplicateRecipe(recipe, this.id)); }
  logRecipe(recipe: Recipe, quantity = '1', unit: 'servings' | 'g' = 'servings', meal: Meal = 'Middag') {
    const log: LogEntry = { id: this.id(), batchId: this.id(), recordedAt: new Date().toISOString(), meal,
      snapshot: { kind: 'recipe', recipe: { ...structuredCopy(recipe), photo: undefined }, quantity, unit }, nutrition: recipePortion(recipe, quantity, unit) };
    return this.serialized(async () => {
      await this.commit([put('log', log.id, log), put('undo', 'latest', [log.id]), put('deletionUndo', 'latest', [])]);
      this.logs = [...this.logs, log]; this.undo = [log.id]; this.deletionUndo = []; this.sortAndIndex();
    });
  }
  createPreparedBatch(recipe: Recipe, meal: Meal = 'Middag', batchId = this.id()) {
    const batch = validateBatch({ id: batchId, createdAt: new Date().toISOString(), meal, recipe: { ...structuredCopy(recipe), photo: undefined } });
    return this.serialized(async () => {
      const existing = this.preparedBatches.find(b => b.id === batch.id); if (existing) return existing;
      await this.commit([put('preparedBatch', batch.id, batch)]);
      this.preparedBatches = [...this.preparedBatches, batch]; return batch;
    });
  }
  createBatchFromDraft(input: Draft, name: string, servings: string, cookedWeightGrams: string | null) {
    const draft = draftSchema.parse(structuredCopy(input));
    return this.serialized(async () => {
      const existing = this.preparedBatches.find(batch => batch.id === draft.id); if (existing) return existing;
      if (this.logs.some(log => log.batchId === draft.id)) throw new Error('This meal was already logged. Start a new batch.');
      if (!draft.lines.length || !liveTextIsCurrent(draft)) throw new Error('Resolve every ingredient before saving a batch.');
      const recipe: Recipe = { id: 'prepared:' + draft.id, name: name.trim() || 'Meal prep', ingredients: draft.lines.map(lineIngredient), servings, cookedWeightGrams, steps: [], favorite: false };
      const batch = validateBatch({ id: draft.id, createdAt: new Date().toISOString(), meal: draft.meal, recipe });
      const foods = [...new Map([...this.foods, ...draft.lines.map(line => line.food!)].map(food => [food.id, food])).values()]; this.checkBarcodes(foods);
      const matches = { ...this.quickEntry.matches };
      for (const line of draft.lines) if (!line.entrySource && normalize(line.query)) matches[normalize(line.query)] = { foodId: line.food!.id, confirmedAt: batch.createdAt };
      const preferences = quickEntrySchema.parse({ ...this.quickEntry, matches }), nextDraft = emptyDraft(this.id);
      await this.commit([put('preparedBatch', batch.id, batch), ...draft.lines.map(line => put('food', line.food!.id, line.food)), put('quickEntry', 'preferences', preferences), put('draft', 'active', nextDraft)]);
      this.preparedBatches = [...this.preparedBatches, batch]; this.foods = foods; this.quickEntry = preferences; this.draft = nextDraft; this.sortAndIndex(); return batch;
    });
  }
  logPreparedBatch(id: string, quantity = '1', unit: 'servings' | 'g' = 'servings', at = new Date(), meal?: Meal) {
    return this.serialized(async () => {
      const batch = this.preparedBatches.find(batch => batch.id === id); if (!batch) throw new Error('This saved batch is unavailable.');
      portionFits(batch, this.logs, quantity, unit);
      const snapshot: LogEntry['snapshot'] = { kind: 'recipe', recipe: structuredCopy(batch.recipe), quantity, unit };
      const log = logSchema.parse({ id: this.id(), batchId: this.id(), preparedBatchId: id, recordedAt: at.toISOString(), meal: meal ?? batch.meal, snapshot, nutrition: snapshotNutrition(snapshot) });
      await this.commit([put('log', log.id, log), put('undo', 'latest', [log.id]), put('deletionUndo', 'latest', [])]);
      this.logs = [...this.logs, log]; this.undo = [log.id]; this.deletionUndo = []; this.sortAndIndex(); return log;
    });
  }
  async waitForWrites() { await this.queue; }
  async exportJSON() {
    await this.queue;
    const json = JSON.stringify({ format: 'touche-grasse', version: 2, profile: this.profile, foods: this.foods, logs: this.logs, recipes: this.recipes, draft: this.draft, recipeDrafts: this.recipeDrafts, quickEntry: this.quickEntry, preparedBatches: this.preparedBatches, targets: this.targets, shortcuts: this.shortcuts, dayReviews: this.dayReviews, mealCorrections: this.mealCorrections, weighIns: this.weighIns }, null, 2);
    if (utf8Size(json) > 50_000_000) throw new Error('This backup exceeds 50 MB. Remove or reduce recipe photos before exporting.');
    return json;
  }
  restoreJSON(json: string, options: { recoverMissing?: boolean } = {}) {
    if (json.length > 50_000_000 || utf8Size(json) > 50_000_000) throw new Error('This backup is too large.');
    const backup = archiveSchema.parse(JSON.parse(json));
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
    for (const items of [backup.foods, backup.logs, backup.recipes, backup.preparedBatches ?? [], backup.targets ?? [], backup.shortcuts ?? [], backup.dayReviews ?? [], backup.mealCorrections ?? [], backup.weighIns ?? []]) if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('The backup contains duplicate identities.');
    return this.serialized(async () => {
      const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map(value => [value.id, value])).values()];
      const foods = options.recoverMissing ? merge(backup.foods, this.foods) : merge(this.foods, backup.foods); this.checkBarcodes(foods);
      const recipes = options.recoverMissing ? merge(backup.recipes, this.recipes) : merge(this.recipes, backup.recipes);
      // Existing historical entries win, regardless of what the incoming archive says.
      const logs = merge(backup.logs, this.logs);
      const preparedBatches = merge(backup.preparedBatches ?? [], this.preparedBatches);
      // Local edits, explicit reopenings and deletion tombstones win over old copies.
      const shortcuts = merge(backup.shortcuts ?? [], this.shortcuts);
      const dayReviews = merge(backup.dayReviews ?? [], this.dayReviews);
      const mealCorrections = merge(backup.mealCorrections ?? [], this.mealCorrections);
      const weighIns = merge(backup.weighIns ?? [], this.weighIns);
      // Do not resurrect ingredients removed by an already-applied local meal correction.
      const removed = new Set(this.mealCorrections.filter(item => !item.revertedAt).flatMap(item => item.previous.filter(entry => !item.applied.some(after => after.id === entry.id)).map(entry => entry.id)));
      for (let i = logs.length - 1; i >= 0; i--) if (removed.has(logs[i].id) && !this.logs.some(local => local.id === logs[i].id)) logs.splice(i, 1);
      const names = shortcuts.filter(item => !item.deletedAt).map(item => normalize(item.name));
      if (new Set(names).size !== names.length) throw new Error("Two shortcuts use the same name. Rename the local shortcut before restoring.");
      if (shortcuts.length > 1000) throw new Error("This restore exceeds 1,000 shortcuts.");
      // Local target history wins for dates already present; restored targets fill missing dates.
      const localDates = new Set(this.targets.map(change => change.effectiveOn));
      const targets = merge((backup.targets ?? []).filter(change => !localDates.has(change.effectiveOn)), this.targets);
      assertBatchCapacity(preparedBatches, logs);
      const draft = this.draft.lines.length || this.draft.text || this.draft.recipeName || this.draft.splitPlan ? this.draft : backup.draft;
      const recipeDrafts = { ...backup.recipeDrafts, ...this.recipeDrafts };
      const matches = { ...backup.quickEntry?.matches };
      for (const [query, match] of Object.entries(this.quickEntry.matches)) if (options.recoverMissing || !matches[query] || matches[query].confirmedAt <= match.confirmedAt) matches[query] = match;
      const preferences = quickEntrySchema.parse({ weightDraft: this.quickEntry.weightDraft !== undefined ? this.quickEntry.weightDraft : backup.quickEntry?.weightDraft, weightUnit: this.quickEntry.weightUnit ?? backup.quickEntry?.weightUnit, mealEdit: this.quickEntry.mealEdit ?? backup.quickEntry?.mealEdit, libraryHidden: backup.quickEntry?.libraryHidden || this.quickEntry.libraryHidden ? { ...backup.quickEntry?.libraryHidden, ...this.quickEntry.libraryHidden } : undefined, entryMethod: this.quickEntry.entryMethod ?? backup.quickEntry?.entryMethod, repeatReview: this.quickEntry.repeatReview ?? backup.quickEntry?.repeatReview, labelDrafts: backup.quickEntry?.labelDrafts || this.quickEntry.labelDrafts ? { ...backup.quickEntry?.labelDrafts, ...this.quickEntry.labelDrafts } : undefined, matches, favorites: [...new Set([...(backup.quickEntry?.favorites ?? []), ...this.quickEntry.favorites])] });
      const clearingDeletion = this.isDeletionUndo || this.isCorrectionUndo;
      await this.commit([...weighIns.map(item => put('weighIn', item.id, item)), ...mealCorrections.map(item => put('mealCorrection', item.id, item)), ...shortcuts.map(item => put('mealShortcut', item.id, item)), ...dayReviews.map(item => put('dayReview', item.id, item)), ...targets.map(change => put('targetChange', change.id, change)), ...preparedBatches.map(batch => put('preparedBatch', batch.id, batch)), ...foods.map(f => put('food', f.id, f)), ...recipes.map(r => put('recipe', r.id, r)), ...logs.map(l => put('log', l.id, l)), ...Object.entries(recipeDrafts).map(([key, value]) => put('recipeDraft', key, value)), put('draft', 'active', draft), put('quickEntry', 'preferences', preferences), ...(backup.profile ? [put('profile', 'identity', backup.profile)] : []), ...(clearingDeletion ? [put('undo', 'latest', []), put('deletionUndo', 'latest', [])] : [])]);
      if (clearingDeletion) { this.undo = []; this.deletionUndo = []; }
      this.weighIns = weighIns; this.mealCorrections = mealCorrections; this.shortcuts = shortcuts; this.dayReviews = dayReviews; this.targets = targets; this.quickEntry = preferences; this.preparedBatches = preparedBatches;
      this.foods = foods; this.recipes = recipes; this.logs = logs; this.draft = draft; this.sortAndIndex();
      this.recipeDrafts = recipeDrafts;
    });
  }
  async close() { await this.queue; await this.storage.close(); }
}
