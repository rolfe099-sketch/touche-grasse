import { expect, it } from 'vitest';
import { LabelForm, parseNutritionLabel } from '../src/domain/nutritionLabel';
import { labelReviewTargets } from '../src/domain/labelDrafts';
const form = (id = 'label'): LabelForm => ({ id, name: 'Unfinished label', barcode: '7038010001918', basis: 'g', amount: '37', values: { kcal: '488', protein: '', carbohydrate: '', fat: '', fiber: '' } });
it('reopens the exact saved new-label key even when its editable barcode has changed, without a camera intent', () => {
  const draft = form(), drafts: Record<string, LabelForm> = { 'new:original-key': draft }, before = structuredClone(drafts);
  const [review] = labelReviewTargets(drafts, new Set());
  expect(review.params).toEqual({ barcode: 'original-key' }); expect(review.form).toBe(draft);
  expect(drafts[`new:${review.params.barcode}`]).toEqual(before['new:original-key']); expect(drafts).toEqual(before);
});
it('retains food and ingredient identifiers containing colons and hides unavailable or malformed edit targets', () => {
  const draft = form('off:703'), drafts = { 'edit:off:703:meal:line': draft, 'edit:off:703:': draft, 'edit:missing:': form('missing'), 'edit:wrong:line': draft };
  const reviews = labelReviewTargets(drafts, new Set(['off:703']));
  expect(reviews.map(review => review.params)).toEqual([{ edit: 'off:703' }, { edit: 'off:703', line: 'meal:line' }]);
});
it('keeps all unfinished labels available, prioritizes recent scans and leaves preferences unchanged', () => {
  const scan = (at: string) => parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 488 kcal', blocks: [] }, at);
  const drafts = { 'new:old': { ...form(), scan: scan('2026-11-03T12:00:00Z') }, 'new:recent': { ...form(), scan: scan('2026-11-05T12:00:00Z') }, 'new:manual': form() }, before = structuredClone(drafts);
  expect(labelReviewTargets(drafts, new Set()).map(review => review.key)).toEqual(['new:recent', 'new:old', 'new:manual']);
  expect(drafts).toEqual(before); expect(labelReviewTargets(undefined, new Set())).toEqual([]);
});
