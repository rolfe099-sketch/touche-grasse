export type Kind = 'food' | 'log' | 'recipe' | 'draft' | 'undo' | 'deletionUndo' | 'profile' | 'recipeDraft' | 'quickEntry' | 'preparedBatch' | 'targetChange' | 'mealShortcut' | 'dayReview';
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
