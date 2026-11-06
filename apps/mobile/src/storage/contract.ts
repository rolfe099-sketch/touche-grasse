export const recordKinds = ['food', 'log', 'recipe', 'draft', 'undo', 'deletionUndo', 'profile', 'recipeDraft', 'quickEntry', 'preparedBatch', 'targetChange', 'goalProgram', 'mealPlan', 'mealShortcut', 'dayReview', 'mealCorrection', 'correctionUndo', 'weighIn'] as const;
export type Kind = typeof recordKinds[number];
export type Stored = { key: string; kind: Kind; id: string; value: unknown };
export type Change = { type: 'put'; record: Stored } | { type: 'delete'; key: string };
export type Loaded = { revision: number; records: Stored[] };
export interface StorageAdapter {
  load(): Promise<Loaded>;
  commit(changes: Change[], expectedRevision: number): Promise<number>;
  close(): Promise<void>;
}
export const conflictMessage = 'Data changed in another window. Reload before continuing.';
export const put = (kind: Kind, id: string, value: unknown): Change => ({ type: 'put', record: { key: `${kind}:${id}`, kind, id, value } });
export function validateStoredIdentity(record: Stored) {
  if (!recordKinds.includes(record.kind)) throw new Error('This diary has unsupported record types. A newer app may be required. No records were changed.');
  if (typeof record.id !== 'string' || !record.id || record.key !== `${record.kind}:${record.id}`) throw new Error('Saved data has an invalid record identity. No records were changed.');
  const singleton: Partial<Record<Kind, string>> = { draft: 'active', undo: 'latest', deletionUndo: 'latest', profile: 'identity', quickEntry: 'preferences', correctionUndo: 'latest' };
  if (singleton[record.kind] && record.id !== singleton[record.kind]) throw new Error('Saved data has an invalid record identity. No records were changed.');
  if (['food', 'log', 'recipe', 'preparedBatch', 'targetChange', 'goalProgram', 'mealPlan', 'mealShortcut', 'dayReview', 'mealCorrection', 'weighIn'].includes(record.kind) && (!record.value || typeof record.value !== 'object' || !('id' in record.value) || record.value.id !== record.id)) throw new Error('Saved data has an invalid record identity. No records were changed.');
}
