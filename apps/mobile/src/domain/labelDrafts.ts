import { LabelForm } from './nutritionLabel';

export type LabelReviewTarget = { key: string; form: LabelForm; params: { barcode?: string; edit?: string; line?: string } };
export function labelReviewTargets(drafts: Record<string, LabelForm> | undefined, editableFoodIds: ReadonlySet<string>): LabelReviewTarget[] {
  return Object.entries(drafts ?? {}).reverse().flatMap(([key, form]): LabelReviewTarget[] => {
    if (key.startsWith('new:')) return [{ key, form, params: { barcode: key.slice(4) } }];
    const prefix = `edit:${form.id}:`;
    if (!key.startsWith(prefix) || !editableFoodIds.has(form.id)) return [];
    const line = key.slice(prefix.length);
    return [{ key, form, params: { edit: form.id, ...(line ? { line } : {}) } }];
  }).sort((a, b) => (b.form.scan?.scannedAt ?? '').localeCompare(a.form.scan?.scannedAt ?? ''));
}
