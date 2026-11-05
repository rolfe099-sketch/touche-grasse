import { expect, Page, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve('../../verification/label-capture');
async function fixture(page: Page, perServing = false) {
  await page.goto('/');
  const data = await page.evaluate(perServing => {
    const base = document.createElement('canvas'); base.width = 1600; base.height = 1400;
    const ctx = base.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, base.width, base.height); ctx.fillStyle = 'black';
    ctx.font = 'bold 60px Arial'; ctx.fillText('Nutrition information', 190, 210); ctx.font = '50px Arial'; ctx.fillText(perServing ? 'Per portion 30 g' : 'Per 100 g', perServing ? 850 : 900, 320);
    for (const [i, row] of (perServing ? [['Energy', '120 kcal'], ['Fat', '6 g'], ['Carbohydrate', '9 g'], ['Protein', '7.5 g'], ['Fiber', '1.5 g']] : [['Energy', '400 kcal'], ['Fat', '20 g'], ['Carbohydrate', '30 g'], ['Protein', '25 g'], ['Fiber', '5 g']]).entries()) {
      const y = 440 + i * 160; ctx.fillRect(190, y - 60, 1200, 2); ctx.fillText(row[0], 190, y); ctx.fillText(row[1], 900, y);
    }
    if (perServing) return base.toDataURL('image/png');
    const sideways = document.createElement('canvas'); sideways.width = 1400; sideways.height = 1600;
    const rotated = sideways.getContext('2d')!; rotated.translate(1400, 0); rotated.rotate(Math.PI / 2); rotated.drawImage(base, 0, 0);
    return sideways.toDataURL('image/png');
  }, perServing);
  const file = path.join(output, perServing ? 'synthetic-30g-label.png' : 'synthetic-sideways-label.png'); writeFileSync(file, Buffer.from(data.split(',')[1], 'base64')); return file;
}
async function choose(page: Page, file?: string) {
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose label photo', exact: true }).click(); await (await chooser).setFiles(file ? file : []);
}
async function dimensions(page: Page) {
  return page.getByRole('img', { name: 'Latest nutrition label photo', exact: true }).evaluate(image => { const img = image as HTMLImageElement; return [img.naturalWidth, img.naturalHeight]; });
}
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('rotate and crop a real image, compare the matching photo, retain corrections and save verified nutrition without eating', async ({ page }) => {
  test.setTimeout(180000); const file = await fixture(page);
  await page.goto('/manual'); await choose(page, file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 });
  await expect.poll(() => dimensions(page)).toEqual([1400, 1600]);
  await page.getByRole('textbox', { name: 'Food name', exact: true }).fill('Crop test label');
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('410');
  await page.getByRole('textbox', { name: 'Fat · g', exact: true }).fill('23');
  // The sideways first read differs across engines. Make clearing a real edit:
  // filling an already-empty field emits no input event in WebKit.
  await page.getByRole('textbox', { name: 'Protein · g', exact: true }).fill('1');
  await page.getByRole('textbox', { name: 'Protein · g', exact: true }).fill('');
  // Cancelling a replacement picker preserves the local preview and readings.
  await choose(page); await expect.poll(() => dimensions(page)).toEqual([1400, 1600]);
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410');
  await page.getByRole('button', { name: 'Crop or rotate label photo', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate label photo left', exact: true }).click();
  const handle = page.getByTestId('crop-top-left'); await handle.scrollIntoViewIfNeeded(); const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + 22, box.y + 22); await page.mouse.down(); await page.mouse.move(box.x + 42, box.y + 42, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Adjust edges precisely', exact: true }).click();
  await expect.poll(async () => Number(await page.getByRole('textbox', { name: 'Left trim · %', exact: true }).inputValue())).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Reset label photo crop', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate label photo left', exact: true }).click();
  for (const edge of ['Left', 'Top', 'Right', 'Bottom']) await page.getByRole('textbox', { name: `${edge} trim · %`, exact: true }).fill('10');
  await page.getByTestId('label-photo-editor').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-crop-editor.png`) });
  await page.getByRole('button', { name: 'Read cropped photo', exact: true }).click();
  await expect(page.getByTestId('label-rescan-review')).toBeVisible({ timeout: 90000 });
  await expect.poll(() => dimensions(page)).toEqual([1280, 1120]);
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410');
  await expect(page.getByRole('button', { name: 'Compare with photo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Merge new label column 1', exact: true }).click();
  await page.getByRole('button', { name: 'Compare with photo', exact: true }).click();
  await page.getByRole('button', { name: 'Compare label energy', exact: true }).click();
  await expect(page.getByTestId('label-photo-comparison')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410');
  await expect(page.getByText(/^Read:.*400.*kcal/i)).toBeVisible();
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('405');
  await page.getByRole('button', { name: 'Zoom photo', exact: true }).click(); await expect(page.getByRole('button', { name: 'Fit photo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fit photo', exact: true }).click();
  await page.getByRole('button', { name: 'Compare label fat', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Fat · g', exact: true })).toHaveValue('23');
  await page.getByTestId('label-photo-comparison').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-photo-comparison.png`) });
  await page.getByRole('button', { name: 'All values', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Protein · g', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Amount to add · g', exact: true }).fill('20');
  await page.getByRole('button', { name: 'Confirm and add', exact: true }).click(); await expect(page).toHaveURL(/\/entry$/);
  await expect(page.getByTestId('meal-kcal')).toContainText('81'); await expect(page.getByTestId('quantity-0')).toHaveValue('20');
  const saved = await page.evaluate(() => new Promise<{ draft: { lines: { food: { nutrition: { kcal: string; fat: string; protein: null } } }[] }; logs: unknown[] }>((resolve, reject) => {
    const open = indexedDB.open('touche-grasse-v1'); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result, tx = db.transaction('records', 'readonly'), all = tx.objectStore('records').getAll(); tx.oncomplete = () => { resolve({ draft: all.result.find(row => row.key === 'draft:active').value, logs: all.result.filter(row => row.kind === 'log') }); db.close(); }; };
  }));
  expect(saved.logs).toEqual([]); expect(saved.draft.lines[0].food.nutrition).toMatchObject({ kcal: '405', fat: '23', protein: null });
});

test('invalid crop bounds block reading and cancelling crop leaves the saved label untouched', async ({ page }) => {
  test.setTimeout(120000); const file = await fixture(page); await page.goto('/manual'); await choose(page, file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 });
  await page.getByRole('textbox', { name: 'Energy · kcal', exact: true }).fill('410');
  await page.getByRole('button', { name: 'Crop or rotate label photo', exact: true }).click();
  await page.getByRole('button', { name: 'Adjust edges precisely', exact: true }).click();
  await page.getByRole('textbox', { name: 'Left trim · %', exact: true }).fill('80');
  await page.getByRole('textbox', { name: 'Right trim · %', exact: true }).fill('80');
  await expect(page.getByRole('button', { name: 'Read cropped photo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel crop', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('410'); await expect(page.getByTestId('label-rescan-review')).toHaveCount(0);
  await expect.poll(() => dimensions(page)).toEqual([1400, 1600]);
});

test('photo comparison distinguishes printed serving values from normalized per-100 nutrition', async ({ page }) => {
  test.setTimeout(120000); const file = await fixture(page, true); await page.goto('/manual'); await choose(page, file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 });
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
  await page.getByRole('button', { name: 'Compare with photo', exact: true }).click();
  await page.getByRole('button', { name: 'Compare label energy', exact: true }).click();
  await expect(page.getByTestId('label-photo-comparison')).toContainText('Values per 100 g · normalized from 30 g');
  await expect(page.getByText(/^Read:.*120.*kcal/i)).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Energy · kcal', exact: true })).toHaveValue('400');
});

test('comparison starts without a keyboard, preserves editing focus across nutrients and keeps values when zooming', async ({ page }) => {
  test.setTimeout(120000); const file = await fixture(page, true); await page.goto('/manual'); await choose(page, file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Compare with photo', exact: true }).click();
  await page.getByRole('button', { name: 'Compare label energy', exact: true }).click();
  const energy = page.getByRole('textbox', { name: 'Energy · kcal', exact: true }); await expect(energy).not.toBeFocused();
  await energy.click(); await energy.fill('405');
  await page.getByRole('button', { name: 'Compare label fat', exact: true }).click();
  const fat = page.getByRole('textbox', { name: 'Fat · g', exact: true }); await expect(fat).toBeFocused(); await page.keyboard.insertText('23'); await expect(fat).toHaveValue('23');
  await page.getByRole('button', { name: 'Hide keyboard', exact: true }).click(); await expect(fat).not.toBeFocused();
  await page.getByRole('button', { name: 'Compare label energy', exact: true }).click(); await expect(energy).not.toBeFocused(); await expect(energy).toHaveValue('405');
  const image = page.getByRole('img', { name: 'Photo matching these label readings', exact: true }), before = (await image.boundingBox())!.width;
  await page.getByRole('button', { name: 'Zoom photo', exact: true }).click(); await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(before * 1.9);
  await page.getByRole('button', { name: 'Fit photo', exact: true }).click();
  // A small viewport stresses available space; it is not a native keyboard simulation.
  await page.setViewportSize({ width: 393, height: 560 }); await energy.click();
  await expect.poll(async () => (await image.boundingBox())!.height).toBeLessThan(180);
  await page.getByRole('button', { name: 'Hide keyboard', exact: true }).click(); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('label-nutrition-review').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-keyboard-review.png`) });
  await page.getByRole('button', { name: 'All values', exact: true }).click(); await expect(energy).toHaveValue('405'); await expect(fat).toHaveValue('23');
});

test('enlarged browser text keeps crop actions inside the viewport', async ({ page }) => {
  test.setTimeout(120000); const file = await fixture(page); await page.goto('/manual'); await choose(page, file);
  await expect(page.getByTestId('label-scan-review')).toBeVisible({ timeout: 90000 }); await page.getByRole('button', { name: 'Crop or rotate label photo', exact: true }).click();
  // Browser text stress only. Native Dynamic Type still needs a device check.
  await page.evaluate(() => {
    const values = Array.from(document.querySelectorAll<HTMLElement>('div,span,input,textarea')).map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize), line: parseFloat(getComputedStyle(element).lineHeight) }));
    for (const { element, size, line } of values) { element.style.fontSize = `${size * 1.7}px`; element.style.lineHeight = Number.isFinite(line) ? `${line * 1.7}px` : '1.3'; }
  });
  for (const name of ['Rotate label photo left', 'Rotate label photo right', 'Reset label photo crop', 'Read cropped photo', 'Cancel crop']) {
    const control = page.getByRole('button', { name, exact: true }); await control.scrollIntoViewIfNeeded(); const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.x + box.width).toBeLessThanOrEqual(391); expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
