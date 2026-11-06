import { z } from 'zod';

export const recoveryMetaSchema = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), createdAt: z.iso.datetime(), reason: z.enum(['automatic', 'before-restore', 'manual']), bytes: z.number().int().positive().max(50000000), checksum: z.string().regex(/^fnv1a32-utf16:[0-9a-f]{8}$/) });
export const recoveryCopySchema = recoveryMetaSchema.extend({ json: z.string().max(50000000) });
export type RecoveryMeta = z.infer<typeof recoveryMetaSchema>;
export type RecoveryCopy = z.infer<typeof recoveryCopySchema>;
export interface RecoveryPort { list(): Promise<RecoveryMeta[]>; read(id: string): Promise<RecoveryCopy>; write(copy: RecoveryCopy): Promise<void>; remove(id: string): Promise<void>; }
function byteLength(value: string) {
  let size = 0; for (const char of value) { const point = char.codePointAt(0)!; size += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4; } return size;
}
// Accidental-corruption detection only, not encryption or tamper protection.
function checksum(value: string) { let hash = 2166136261; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return 'fnv1a32-utf16:' + (hash >>> 0).toString(16).padStart(8, '0'); }
export function inspectRecoveryJSON(json: string) {
  if (json.length > 50000000 || byteLength(json) > 50000000) throw new Error('This recovery copy exceeds 50 MB.');
  let value; try { value = JSON.parse(json); } catch { throw new Error('This recovery copy is unreadable. Other copies are kept.'); }
  if (value?.format === 'touche-grasse' && typeof value.version === 'number' && value.version > 2) throw new Error('This backup needs a newer app. Update Touche Grasse before restoring. Your current diary is unchanged.');
  if (value?.format !== 'touche-grasse' || value.version !== 2 || !Array.isArray(value.logs) || !Array.isArray(value.foods) || !Array.isArray(value.recipes) || !value.draft) throw new Error('This is not a Touche Grasse recovery copy.');
  const record = (input: unknown) => input !== null && typeof input === 'object' && !Array.isArray(input);
  for (const key of ['weighIns', 'mealCorrections', 'shortcuts', 'dayReviews', 'preparedBatches', 'targets', 'goalPrograms', 'mealPlans']) if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error('This backup has an invalid record list. Choose another file.');
  for (const key of ['draft', 'quickEntry', 'recipeDrafts']) if (value[key] !== undefined && !record(value[key])) throw new Error('This backup has invalid draft data. Choose another file.');
  if (value.quickEntry?.portionDrafts !== undefined && !record(value.quickEntry.portionDrafts)) throw new Error('This backup has invalid portion drafts. Choose another file.');
  if (value.quickEntry?.labelDrafts !== undefined && !record(value.quickEntry.labelDrafts)) throw new Error('This backup has invalid label drafts. Choose another file.');
  if ((value.weighIns ?? []).some((item: unknown) => !record(item)) || (value.shortcuts ?? []).some((item: unknown) => !record(item))) throw new Error('This backup has an invalid record list. Choose another file.');
  const drafts = {
    meal: !!(value.draft.text || value.draft.lines?.length || value.draft.recipeName || value.draft.splitPlan),
    recipes: Object.keys(value.recipeDrafts ?? {}).length,
    labels: Object.keys(value.quickEntry?.labelDrafts ?? {}).length,
    portions: Object.values(value.quickEntry?.portionDrafts ?? {}).filter(slot => slot !== null && typeof slot === 'object' && 'value' in slot && slot.value !== null).length,
    command: !!value.quickEntry?.voiceDraft?.text,
    weight: !!value.quickEntry?.weightDraft,
    adjustment: !!(value.quickEntry?.mealEdit || value.quickEntry?.repeatReview),
    ...(value.quickEntry?.planDraft?.value ? { planner: true } : {}),
  };
  return { goalPrograms: (value.goalPrograms?.length ?? 0) as number, mealPlans: (value.mealPlans?.filter((p: { cancelledAt?: string }) => !p.cancelledAt).length ?? 0) as number, weighIns: (value.weighIns?.filter((item: { deletedAt?: string }) => !item.deletedAt).length ?? 0) as number, mealCorrections: (value.mealCorrections?.length ?? 0) as number, logs: value.logs.length as number, recipes: value.recipes.length as number, foods: value.foods.length as number, shortcuts: (value.shortcuts?.filter((item: { deletedAt?: string }) => !item.deletedAt).length ?? 0) as number, reviewedDays: (value.dayReviews?.length ?? 0) as number, portions: (value.preparedBatches?.length ?? 0) as number, targets: (value.targets?.length ?? 0) as number, drafts, meaningful: !!(value.logs.length || value.foods.length || value.recipes.length || Object.values(drafts).some(Boolean) || Object.keys(value.quickEntry?.libraryHidden ?? {}).length || value.weighIns?.length || value.mealCorrections?.length || value.shortcuts?.length || value.dayReviews?.length || value.targets?.length || value.preparedBatches?.length || value.goalPrograms?.length || value.mealPlans?.length) };
}
export class RecoveryService {
  private queue: Promise<unknown> = Promise.resolve(); private lastJSON?: string;
  constructor(private port: RecoveryPort, private id: () => string, private now = () => new Date()) {}
  async list() { return (await this.port.list()).map(value => recoveryMetaSchema.parse(value)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  async read(id: string) {
    recoveryMetaSchema.shape.id.parse(id); const copy = recoveryCopySchema.parse(await this.port.read(id));
    if (copy.id !== id || copy.bytes !== byteLength(copy.json) || copy.checksum !== checksum(copy.json)) throw new Error('This recovery copy is incomplete or damaged. Other copies are kept.');
    inspectRecoveryJSON(copy.json); return copy;
  }
  save(json: string, reason: RecoveryMeta['reason'] = 'automatic'): Promise<RecoveryMeta | null> {
    const task = this.queue.then(async () => {
      const summary = inspectRecoveryJSON(json); if (reason === 'automatic' && !summary.meaningful) return null;
      const existing = await this.list();
      if (reason === 'automatic' && json === this.lastJSON && existing.length) return existing[0];
      const latestTime = existing.length ? Date.parse(existing[0].createdAt) : 0;
      const copy = recoveryCopySchema.parse({ id: this.id(), createdAt: new Date(Math.max(this.now().getTime(), latestTime + 1)).toISOString(), reason, bytes: byteLength(json), checksum: checksum(json), json });
      if (existing.some(item => item.id === copy.id)) throw new Error('Could not create a unique recovery copy. Earlier copies are kept.');
      try {
        await this.port.write(copy);
        const verified = await this.read(copy.id); if (verified.json !== json) throw new Error('The recovery copy could not be verified. Earlier copies are kept.');
      } catch (error) { try { await this.port.remove(copy.id); } catch { /* Earlier copies remain untouched. */ } throw error; }
      // Delete older versions only after reading back the complete new copy.
      const all = [copy, ...existing.filter(item => item.id !== copy.id)];
      const protectedCopy = all.find(item => item.reason === 'before-restore');
      const keep = new Set([copy.id, ...(protectedCopy ? [protectedCopy.id] : [])]);
      let bytes = all.filter(item => keep.has(item.id)).reduce((sum, item) => sum + item.bytes, 0);
      for (const item of all) if (!keep.has(item.id) && keep.size < 6 && bytes + item.bytes <= 100000000) { keep.add(item.id); bytes += item.bytes; }
      for (const item of all) if (!keep.has(item.id)) await this.port.remove(item.id);
      this.lastJSON = json;
      return recoveryMetaSchema.parse(copy);
    });
    this.queue = task.catch(() => undefined); return task;
  }
}
