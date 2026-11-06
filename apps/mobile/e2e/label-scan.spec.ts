import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { emptyDraft } from '../src/domain/model';
import { applyLabelColumn, LabelForm, parseNutritionLabel } from '../src/domain/nutritionLabel';
const output = path.resolve('../../verification/label-scanning');
// Real rendered label images and real local OCR. No recognition response mocks.
async function labelImage(page: Page, columns = false, unknownBasis = false) {
  const header = unknownBasis ? 'Per serving' : columns ? '<span>Per 100 g</span><span>Per portion 30 g</span>' : '<span>Per 100 g</span>';
  const data = columns ? [ ['Energy', '400 kcal', '120 kcal'], ['Fat', '20 g', '6 g'], ['Carbohydrate', '30 g', '9 g'], ['Protein', '25 g', '7,5 g'], ['Fiber', '5 g', '1,5 g'] ] : [ ['Energi', '1680 kJ / 400 kcal'], ['Fett', '20 g'], ['Karbohydrat', '30 g'], ['Protein', '25 g'], ['Kostfiber', '5 g'] ];
  await page.setViewportSize({ width: 1400, height: 1100 });
  await page.setContent(`<html><body style="margin:0;background:white;color:black;font-family:Arial,sans-serif;font-size:44px"><div style="padding:55px"><h1 style="font-size:54px;margin:0 0 40px">${columns ? 'Nutrition information' : 'Næringsinnhold'}</h1><div style="display:grid;grid-template-columns:420px ${columns ? '340px 420px' : '700px'};gap:25px;margin-bottom:32px"><span></span>${header}</div>${data.map(row => `<div style="display:grid;grid-template-columns:420px ${columns ? '340px 420px' : '700px'};gap:25px;border-top:2px solid black;padding:22px 0">${row.map(cell => `<span>${cell}</span>`).join('')}</div>`).join('')}</div></body></html>`);
  const file = path.join(output, `synthetic-${unknownBasis ? 'unknown-basis' : columns ? 'two-column' : 'norwegian'}.png`); await page.screenshot({ path: file }); await page.setViewportSize({ width: 390, height: 844 }); return file;
}
async function choosePhoto(page: Page, file: string) {
  const picker = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose label photo', exact: true }).click(); await (await picker).setFiles(file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 });
  const draft = await page.evaluate(() => new Promise<unknown>((resolve, reject) => { const open = indexedDB.open('touche-grasse-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records','readonly'), value = tx.objectStore('records').get('quickEntry:preferences'); tx.oncomplete = () => { resolve(value.result?.value?.labelDrafts); db.close(); }; }; }));
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-${test.info().title.replace(/[^a-z0-9]+/gi, '-').slice(0, 55)}-reading.json`), JSON.stringify(draft ?? {}, null, 2));
  await page.getByRole('button', { name: 'Recognized text', exact: true }).click();
  writeFileSync(path.join(output, 'last-recognized-test-text.txt'), await page.getByTestId('label-recognized-text').innerText());
  await page.getByRole('button', { name: 'Hide recognized text', exact: true }).click();
  const normalized = await page.evaluate(() => document.querySelector<HTMLImageElement>('img[src^="data:image/png"]')?.src);
  if (normalized) writeFileSync(path.join(output, 'last-normalized-test-image.png'), Buffer.from(normalized.split(',')[1], 'base64'));
}
async function exportJSON(page: Page) {
  await page.goto('/settings');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); return JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
}
async function reviewFat(page: Page) {
  const field = page.getByRole('textbox', { name: 'Fat · g', exact: true });
  // Windows and Linux WebKit assign different confidence to the small unit
  // glyph in the same synthetic table. A weak reading must require review;
  // accepting an incorrect nonempty value would still fail this test.
  const neededCorrection = (await field.inputValue()) === '';
  if (neededCorrection) {
    await expect(page.getByText(/^Read: (?:Fett|Fat)\b/)).toBeVisible();
    await field.fill('20');
  }
  await expect(field).toHaveValue('20');
  return neededCorrection;
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('real Norwegian image OCR → editable review → exact food math → offline barcode reuse and historical preservation', async ({ page, context }) => {
  test.setTimeout(150000);
  const image = await labelImage(page), external: { url: string; method: string; body: string | null }[] = []; page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173')) external.push({ url: request.url(), method: request.method(), body: request.postData() }); });
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  // Poll the current state: activation can occur between a controller check
  // and attaching an event listener, leaving an event-only wait stuck forever.
  // Wait before hard navigation: an install that claims clients during an
  // in-flight navigation may miss the not-yet-committed destination document.
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? ''), { timeout: 15000 }).toContain('/sw.js');
  await page.goto('/manual?barcode=7038010001918');
  await choosePhoto(page, image);
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
  await expect(page.getByRole('textbox', { name: 'Protein · g', exact: true })).toHaveValue('25');
  await expect(page.getByRole('textbox', { name: 'Carbs · g', exact: true })).toHaveValue('30');
  const correctedFat = await reviewFat(page);
  await expect(page.getByRole('textbox', { name: 'Fiber · g', exact: true })).toHaveValue('5');
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Reviewed test label');
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('410'); await page.getByRole('textbox', { name: 'Amount to add · g', exact: true }).fill('15');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-review.png`), fullPage: true });
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page).toHaveURL(/\/entry$/); await expect(page.getByTestId('meal-kcal')).toContainText('62');
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('151');
  const saved = await exportJSON(page), food = saved.foods.find((food: { name: string }) => food.name === 'Reviewed test label');
  expect(saved.logs).toHaveLength(2); expect(food.provenance.source).toBe('confirmedOCR'); expect(food.provenance.labelScan.originalNutrition.kcal).toBe('400'); expect(food.nutrition.kcal).toBe('410'); expect(JSON.stringify(saved)).not.toContain('data:image');
  expect(food.nutrition.fat).toBe('20'); expect(food.provenance.labelScan.originalNutrition.fat).toBe(correctedFat ? null : '20');
  if (correctedFat) expect(food.provenance.nutrientSources.fat).toBe('User-confirmed label value');
  await page.goto('/entry'); await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click(); await context.setOffline(true);
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('7038010001918'); await page.getByRole('button', { name: 'Find product', exact: true }).click();
  await expect(page.getByTestId('quantity-0')).toHaveValue('100'); await expect(page.getByTestId('meal-kcal')).toContainText('410'); await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('561'); await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('151');
  // The first scan warmed the local OCR cache. A fresh worker can read another
  // image offline without making the photo part of the retained/exported diary.
  await page.goto('/manual'); await choosePhoto(page, image);
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
  await page.getByRole('button', { name: 'Discard label draft', exact: true }).click();
  await expect(page).toHaveURL(/\/entry$/);
  await context.setOffline(false); const after = await exportJSON(page); expect(after.logs).toEqual(saved.logs);
  // expo-camera's existing web adapter loads its QR code reader from this CDN
  // on import. OCR itself uses local worker/models and sends no image payload.
  expect(external.every(request => request.url === 'https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js' && request.method === 'GET' && request.body === null)).toBe(true);
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-real-ocr.json`), JSON.stringify({ engine: 'actual local Tesseract.js', uploadedImage: image, sourceNutrition: food.provenance.labelScan.originalNutrition, correctedNutrition: food.nutrition, externalRequests: external }, null, 2));
});

test('two-column image requires an explicit basis and keeps measured serving nutrition separate from per-100 values', async ({ page }) => {
  test.setTimeout(120000); const image = await labelImage(page, true); await page.goto('/manual'); await choosePhoto(page, image);
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Two-column label'); await expect(page.getByRole('button', { name: 'Confirm and add', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Use label column 2: Per 30 g', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
  await reviewFat(page);
  // The actual engine misreads 7,5 g / 1,5 g in this column. Keep the weak
  // readings unknown, then verify real user corrections use normalized values.
  await expect(page.getByRole('textbox', { name: 'Protein · g', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Fiber · g', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Protein · g', exact: true }).fill('25');
  await page.getByRole('textbox', { name: 'Fiber · g', exact: true }).fill('5');
  await page.getByRole('textbox', { name: 'Amount to add · g', exact: true }).fill('30'); await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('meal-kcal')).toContainText('120');
});

test('unmeasured serving image leaves values unknown and supports manual fallback without disturbing the existing meal', async ({ page }) => {
  test.setTimeout(120000); const image = await labelImage(page, false, true); await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Add food', exact: true }).click(); await page.getByRole('button', { name: 'Create a food', exact: true }).click(); await choosePhoto(page, image);
  await expect(page.getByText(/Reference amount not read/)).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Manual label'); await expect(page.getByRole('button', { name: 'Confirm and add', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Enter manually', exact: true }).click(); await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('400');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page.getByTestId('quantity-0')).toHaveValue('10'); await expect(page.getByTestId('quantity-1')).toHaveValue('100');
});

test('label draft survives reload with corrections and a cancelled picker does not create a food', async ({ page }) => {
  await page.goto('/manual?barcode=7038010001918'); await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Unfinished label'); await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('410');
  // Normal navigation flushes the input event; wait for the durable draft before a hard reload.
  await expect.poll(async () => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => { const request = indexedDB.open('touche-grasse-v1'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('records', 'readonly'), saved = tx.objectStore('records').get('quickEntry:preferences'); tx.oncomplete = () => { resolve(saved.result?.value?.labelDrafts?.['new:7038010001918']?.values.kcal); db.close(); }; }; }))).toBe('410');
  await page.reload(); await expect(page.getByRole('textbox', { name: 'Food name', exact: true })).toHaveValue('Unfinished label'); await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410');
  const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose label photo', exact: true }).click();
  await (await choosing).element().evaluate(input => input.dispatchEvent(new Event('cancel')));
  await expect(page.getByRole('button', { name: 'Cancel scan', exact: true })).toHaveCount(0); await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410');
  await page.getByRole('button', { name: 'Discard label draft', exact: true }).click(); await expect(page).toHaveURL(/\/entry$/);
  const saved = await exportJSON(page); expect(saved.foods).toEqual([]); expect(saved.logs).toEqual([]); expect(saved.quickEntry.labelDrafts?.['new:7038010001918']).toBeUndefined();
});


test('retained native observations recover readable values, require missing-unit confirmation and preserve history', async ({ page }) => {
  const text = 'N/ERINGSINNHOLD PR. 100 g:\nEnergi\n2043 kJ/488 kcal\nFett\n23 g\nhvorav\n-mettede fettsyrer\n10 g\n-enumettede fettsyrer\n8,5 g\n-flerumettede fettsyrer\n3,1 g\nKarbohydrater\n63\nhvorav sukkerarter\n34\nKostfiber\nProtein\nSalt\n8';
  const scan = parseNutritionLabel({ engine: 'platform', text, blocks: [] }); delete scan.parserVersion;
  for (const key of ['kcal', 'fat', 'carbohydrate', 'protein', 'fiber'] as const) scan.columns[0].nutrition[key] = null;
  const value = { format: 'touche-grasse', version: 2, foods: [], recipes: [], logs: [], draft: emptyDraft(() => 'retained-meal'), quickEntry: { matches: {}, favorites: [], labelDrafts: { 'new:': { id: 'retained-label', name: 'Retained test label', barcode: '', basis: 'g', amount: '100', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' }, scan, column: 0 } } } };
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-retained-label.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto('/manual');
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('488');
  await expect(page.getByRole('textbox', { name: 'Fat · g', exact: true })).toHaveValue('23');
  await expect(page.getByRole('textbox', { name: 'Carbs · g', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Protein · g', exact: true })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Fiber · g', exact: true })).toHaveValue('');
  await expect(page.getByText('Read: Karbohydrater 63', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-separated-observations.png`), fullPage: true });
  await page.getByRole('button', { name: 'Confirm label carbohydrate in grams', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Carbs · g', exact: true })).toHaveValue('63');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click();
  await expect(page.getByTestId('meal-kcal')).toContainText('488');
  const saved = await exportJSON(page); expect(saved.logs).toEqual([]); expect(saved.foods[0].nutrition).toEqual({ kcal: '488', protein: null, carbohydrate: '63', fat: '23', fiber: null });
});


test('reported unfinished native readout repairs energy and requires two explicit unit confirmations before logging', async ({ page }) => {
  // Replay captured text shapes, not a mocked claim about native photo OCR.
  const lines = ['Per 100 g', 'energi 2043 kJ/488 kcal', 'Fett 23 g', 'Karbohydrater 63 g', 'Protein 5,6 Dr', 'Kostfiber 3,2'];
  const blocks = lines.map((text, i) => ({ text, confidence: null, box: { x: 10, y: i < 2 ? i * 5 : i * 100, width: 500, height: 30 } }));
  const scan = parseNutritionLabel({ engine: 'platform', text: lines.join('\n'), blocks });
  scan.parserVersion = 2; scan.columns[0].nutrition.kcal = null; delete scan.columns[0].evidence.kcal; delete scan.columns[0].suggestions!.protein;
  const form: LabelForm = applyLabelColumn({ id: 'unit-review', name: 'Unit review fixture', barcode: '', basis: 'g', amount: '100', values: { kcal: '', protein: '', carbohydrate: '', fat: '', fiber: '' } }, scan, 0);
  const value = { format: 'touche-grasse', version: 2, foods: [], recipes: [], logs: [], draft: emptyDraft(() => 'unit-review-meal'), quickEntry: { matches: {}, favorites: [], labelDrafts: { 'new:': form } } };
  await page.goto('/settings'); const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await chooser).setFiles({ name: 'synthetic-unit-review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto('/'); await page.getByTestId('universal-log').click();
  const resume = page.getByRole('button', { name: 'Continue label review', exact: true }); await expect(resume).toBeInViewport();
  await expect(page.getByTestId('quick-text')).not.toBeFocused(); await resume.click();
  expect(new URL(page.url()).searchParams.has('capture')).toBe(false);
  await expect(page.getByRole('textbox', { name: 'Energy \u00b7 kcal', exact: true })).toHaveValue('488');
  for (const label of ['Protein \u00b7 g', 'Fiber \u00b7 g']) { const field = page.getByRole('textbox', { name: label, exact: true }); await expect(field).toHaveValue(''); await expect(field).toHaveAttribute('placeholder', 'Confirm unit'); }
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-unit-confirmation.png`), fullPage: true });
  await page.getByRole('button', { name: 'Confirm label protein in grams', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Protein \u00b7 g', exact: true })).toHaveValue('5.6');
  await expect(page.getByRole('textbox', { name: 'Fiber \u00b7 g', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Confirm label fiber in grams', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Fiber \u00b7 g', exact: true })).toHaveValue('3.2');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('488'); await expect(page.getByTestId('today-fiber')).toHaveText('3.2 g');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('–');
  const saved = await exportJSON(page); expect(saved.logs).toEqual([]); expect(saved.foods[0].nutrition.protein).toBe('5.6'); expect(saved.foods[0].nutrition.fiber).toBe('3.2');
  expect(saved.foods[0].provenance.labelScan.originalNutrition.protein).toBeNull(); expect(saved.foods[0].provenance.labelScan.originalNutrition.fiber).toBeNull();
});


test('saved label resumes from Today in two taps after reload without a photo or losing the separate meal', async ({ page }) => {
  const stored = (key: string) => page.evaluate(key => new Promise<unknown>((resolve, reject) => { const request = indexedDB.open('touche-grasse-v1'); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result, tx = db.transaction('records', 'readonly'), record = tx.objectStore('records').get(key); tx.oncomplete = () => { resolve(record.result?.value); db.close(); }; }; }), key);
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil');
  await expect.poll(async () => (await stored('draft:active') as { lines?: { quantityText: string }[] })?.lines?.[0]?.quantityText).toBe('10');
  await page.goto('/manual?barcode=7038010001918');
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Pending package');
  await page.getByRole('textbox', { name: 'Energy \u00b7 kcal', exact: true }).fill('488');
  await page.getByRole('textbox', { name: 'Barcode (optional)', exact: true }).fill('012345678905');
  await page.getByRole('textbox', { name: 'Amount to add \u00b7 g', exact: true }).fill('37');
  await expect.poll(async () => (await stored('quickEntry:preferences') as { labelDrafts?: Record<string, LabelForm> })?.labelDrafts?.['new:7038010001918']?.amount).toBe('37');
  await page.goto('/'); await page.reload(); let photos = 0; page.on('filechooser', () => { photos++; });
  await page.getByTestId('universal-log').click();
  const resume = page.getByRole('button', { name: 'Continue label review', exact: true }); await expect(resume).toBeInViewport();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-continue-label.png`) });
  await resume.click();
  expect(new URL(page.url()).searchParams.has('capture')).toBe(false); expect(photos).toBe(0);
  await expect(page.getByRole('textbox', { name: 'Food name', exact: true })).toHaveValue('Pending package');
  await expect(page.getByRole('textbox', { name: 'Barcode (optional)', exact: true })).toHaveValue('012345678905');
  await expect(page.getByRole('textbox', { name: 'Energy \u00b7 kcal', exact: true })).toHaveValue('488');
  await expect(page.getByRole('textbox', { name: 'Amount to add \u00b7 g', exact: true })).toHaveValue('37');
  await page.getByRole('button', { name: 'Discard label draft', exact: true }).click();
  await expect(page).toHaveURL(/\/entry$/); await expect(page.getByTestId('label-draft-resume')).toHaveCount(0); await expect(page.getByTestId('quantity-0')).toHaveValue('10');
  const saved = await exportJSON(page); expect(saved.logs).toEqual([]); expect(saved.foods).toEqual([]); expect(saved.draft.lines[0].quantityText).toBe('10');
  writeFileSync(path.join(output, `${test.info().project.name || 'chromium'}-resume-interactions.json`), JSON.stringify({ actions: ['Log', 'Continue label review'], interactions: 2, newPhotos: photos, preservedLabelAmount: '37', preservedMealAmount: '10' }, null, 2));
});
