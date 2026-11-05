import { expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Draft, emptyDraft, LogEntry } from '../src/domain/model';
import { QuickEntryPreferences } from '../src/domain/quickEntry';
import { applyLabelColumn, parseNutritionLabel } from '../src/domain/nutritionLabel';

const output = path.resolve('../../verification/voice-scan-reliability');
async function state(page: Page) {
  return page.evaluate(() => new Promise<{ draft: Draft; preferences: QuickEntryPreferences; logs: LogEntry[] }>((resolve, reject) => {
    const open = indexedDB.open('touche-grasse-v1'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('records', 'readonly'), all = tx.objectStore('records').getAll();
      tx.oncomplete = () => { const records = all.result; resolve({ draft: records.find(item => item.key === 'draft:active')?.value, preferences: records.find(item => item.key === 'quickEntry:preferences')?.value, logs: records.filter(item => item.kind === 'log').map(item => item.value) }); db.close(); };
    };
  }));
}
async function settled(page: Page) {
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''), { timeout: 15000 }).toContain('/sw.js');
}
async function importBackup(page: Page, archive: unknown) {
  await page.goto('/settings'); await settled(page);
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'isolated-reliability.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
}
async function commands(page: Page, text: string) {
  await page.getByRole('button', { name: 'Type commands', exact: true }).click();
  await page.getByTestId('voice-command').fill(text); await page.getByRole('button', { name: 'Apply meal command', exact: true }).click();
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('cumulative speech is committed once; interrupted speech resumes explicitly after reload', async ({ page }) => {
  await page.addInitScript(() => {
    class Speech {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { this.onstart?.(); Object.assign(window, { speech: this }); } stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Speech });
  });
  await page.goto('/entry'); await settled(page); await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  const deliver = (parts: { text: string; final: boolean }[], end = false) => page.evaluate(({ parts, end }) => {
    const speech = (window as unknown as { speech: { onresult: (event: unknown) => void; onend: () => void } }).speech;
    speech.onresult({ resultIndex: 0, results: parts.map(part => ({ isFinal: part.final, 0: { transcript: part.text } })) }); if (end) speech.onend();
  }, { parts, end });
  await deliver([{ text: 'Add 10g olive oil', final: true }]); await expect(page.getByTestId('quantity-0')).toHaveCount(0);
  await deliver([{ text: 'Add 10g olive oil', final: true }, { text: 'then change olive oil to 15g', final: true }], true);
  await expect(page.getByTestId('quantity-0')).toHaveValue('15');
  await expect.poll(async () => (await state(page)).preferences.voiceDraft).toBeNull();
  await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await deliver([{ text: 'Add 50g apple', final: false }]);
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await expect.poll(async () => (await state(page)).preferences.voiceDraft?.text).toBe('Add 50g apple');
  await page.reload(); await page.getByRole('button', { name: 'Continue voice command', exact: true }).click();
  await expect(page.getByTestId('voice-command')).toHaveValue('Add 50g apple');
  await expect(page.getByTestId('quantity-1')).toHaveCount(0);
  await page.getByRole('button', { name: 'Apply meal command', exact: true }).click();
  await expect(page.getByTestId('quantity-1')).toHaveValue('50'); await expect(page.getByTestId('commit-food')).toBeDisabled();
  expect((await state(page)).logs).toEqual([]);
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-resumed-command.png`) });
});

test('a failed food transaction retains the command and retry logs exactly once with Undo', async ({ page }) => {
  await page.goto('/entry'); await settled(page);
  await page.getByTestId('quick-text').fill('10g olive oil'); await expect(page.getByTestId('commit-food')).toBeEnabled();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put; let failed = false;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (!failed && args[0]?.kind === 'log') { failed = true; this.transaction.abort(); throw new Error('isolated test write failure'); }
      return original.apply(this, args);
    };
  });
  await commands(page, 'Change olive oil to 15g then log it');
  await expect(page.getByTestId('voice-command')).toHaveValue('Change olive oil to 15g then log it');
  await expect(page.getByRole('button', { name: 'Apply meal command', exact: true })).toBeEnabled();
  await expect.poll(async () => (await state(page)).preferences.voiceDraft?.text).toBe('Change olive oil to 15g then log it');
  const failed = await state(page); expect(failed.logs).toEqual([]); expect(failed.draft.lines[0].quantityText).toBe('10');
  await page.getByRole('button', { name: 'Apply meal command', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  const saved = await state(page); expect(saved.logs).toHaveLength(1); expect(saved.logs[0].snapshot.kind).toBe('food');
  expect(saved.logs[0].nutrition.fat).toBe('14.85'); expect(saved.preferences.voiceDraft).toBeNull();
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect.poll(async () => (await state(page)).logs.length).toBe(0);
});

test('the reported polite speech request creates a measured ambiguous oil row and accepts polite corrections', async ({ page }) => {
  // Inject only the recognition transcript; parsing, matching and persistence
  // run through the real entry UI. This does not test microphone accuracy.
  await page.addInitScript(() => {
    class Speech {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { this.onstart?.(); this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'can you add 15 grams of oil' } }] }); this.onend?.(); }
      stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Speech });
  });
  await page.goto('/entry'); await settled(page);
  await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('15');
  await expect(page.getByRole('button', { name: 'Change food 1', exact: true }).getByText('oil', { exact: true })).toBeVisible();
  await expect(page.getByTestId('entry-search')).toHaveValue('oil');
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await expect.poll(async () => (await state(page)).draft.lines[0].query).toBe('oil');
  expect((await state(page)).logs).toEqual([]);
  await commands(page, 'Could you please change oil to 20 grams?');
  await expect(page.getByTestId('quantity-0')).toHaveValue('20');
  await expect(page.getByTestId('quantity-1')).toHaveCount(0);
  await expect.poll(async () => (await state(page)).preferences.voiceDraft).toBeNull();
  await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('20');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-polite-oil-request.png`) });
});

test('long cooking commands validate as a whole and preserve exact six-serving batch math', async ({ page }) => {
  await page.goto('/entry'); await settled(page);
  await commands(page, 'Add 10g olive oil then change olive oil to 15g then remove salmon');
  await expect(page.getByText('That ingredient is not in this meal.', { exact: true })).toBeVisible();
  expect((await state(page)).draft?.lines ?? []).toHaveLength(0);
  await page.getByTestId('voice-command').fill("I'm making Oil test. Six servings. Add 10g olive oil. Final cooked weight 60g");
  await page.getByRole('button', { name: 'Apply meal command', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('10');
  await expect.poll(async () => (await state(page)).draft.splitPlan).toEqual({ name: 'Oil test', servingsText: '6', cookedWeightText: '60' });
  expect((await state(page)).logs).toEqual([]);
});

test('a real OCR rescan survives reload without erasing corrected values or intentional unknowns', async ({ page }) => {
  test.setTimeout(150000);
  const first = parseNutritionLabel({ engine: 'platform', text: 'Per 100 g\nEnergy 400 kcal\nFat 20 g\nProtein 25 g', blocks: [] });
  const form = applyLabelColumn({ id: 'retained-test-label', name: 'Rescan test', barcode: '', basis: 'g', amount: '15', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } }, first, 0);
  form.values.fat = '23'; form.values.protein = ''; form.edited = ['fat', 'protein'];
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.setContent('<html><body style="margin:0;background:white;color:black;font:44px Arial"><div style="padding:55px"><h1 style="font-size:54px">Nutrition information</h1><p>Per 100 g</p>' + [['Energy', '488 kcal'], ['Fat', '24 g'], ['Carbohydrate', '63 g'], ['Protein', '5.6 g'], ['Fiber', '3.2 g']].map(row => '<div style="display:grid;grid-template-columns:420px 700px;gap:25px;border-top:2px solid black;padding:22px 0">' + row.map(cell => '<span>' + cell + '</span>').join('') + '</div>').join('') + '</div></body></html>');
  const image = path.join(output, 'synthetic-rescan.png'); await page.screenshot({ path: image }); await page.setViewportSize({ width: 390, height: 844 });
  await importBackup(page, { format: 'touche-grasse', version: 2, foods: [], recipes: [], logs: [], draft: emptyDraft(() => 'empty-test-draft'), quickEntry: { matches: {}, favorites: [], labelDrafts: { 'new:': form } } });
  await page.goto('/manual');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose label photo', exact: true }).click(); await (await chooser).setFiles(image);
  await expect(page.getByTestId('label-rescan-review')).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('textbox', { name: 'Fat · g', exact: true })).toHaveValue('23');
  await expect.poll(async () => !!(await state(page)).preferences.labelDrafts?.['new:'].rescan).toBe(true);
  await page.reload(); await expect(page.getByTestId('label-rescan-review')).toBeVisible();
  await page.getByRole('button', { name: 'Merge new label column 1', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
  await expect(page.getByRole('textbox', { name: 'Fat · g', exact: true })).toHaveValue('23');
  await expect(page.getByRole('textbox', { name: 'Protein · g', exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Use new reading for kcal', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use new reading for kcal', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('488');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-rescan-corrections.png`), fullPage: true });
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page).toHaveURL(/\/entry$/);
  const saved = await state(page); expect(saved.logs).toEqual([]); expect(saved.draft.lines[0].food?.nutrition.fat).toBe('23');
  expect(saved.draft.lines[0].food?.nutrition.kcal).toBe('488'); expect(saved.draft.lines[0].food?.nutrition.protein).toBeNull();
});
