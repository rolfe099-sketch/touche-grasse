import { expect, Page, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { milkCode, milkProduct } from '../tests/barcode-fixture';

const output = path.resolve('../../verification/offline-interruptions');
const endpoint = 'https://world.openfoodfacts.org/api/v3.6/product/**';
// Product API fixtures must stay in the page's network stack. Separate existing
// readiness tests exercise the real service-worker shell while offline.
test.use({ serviceWorkers: 'block' });
async function state(page: Page) {
  return page.evaluate(() => new Promise<{ logs: { nutrition: { fat: string } }[]; command?: { text: string }; amount?: string }>((resolve, reject) => {
    const open = indexedDB.open('touche-grasse-v1'); open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction('records', 'readonly'), all = tx.objectStore('records').getAll();
      tx.oncomplete = () => { const records = all.result; resolve({ logs: records.filter(row => row.kind === 'log').map(row => row.value), command: records.find(row => row.key === 'quickEntry:preferences')?.value.voiceDraft, amount: records.find(row => row.key === 'draft:active')?.value.lines[0]?.quantityText }); db.close(); };
    };
  }));
}
test.beforeEach(async ({ page }) => { test.setTimeout(120000); mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.setFixedTime(new Date('2026-11-06T12:00:00Z')); });

for (const interruption of ['leave', 'background'] as const) test(`${interruption} during the final transcript save retains the command without logging; explicit resume logs once`, async ({ page }) => {
  await page.addInitScript(() => {
    class Speech {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { this.onstart?.(); Object.assign(window, { speech: this }); } stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Speech });
  });
  await page.goto('/'); await page.getByTestId('universal-log').click(); await page.getByTestId('quick-text').fill('10g olive oil');
  await expect.poll(async () => (await state(page)).amount).toBe('10');
  // Hold only the acknowledgement of a completed voice-draft transaction.
  // The actual IndexedDB write stays atomic; no production test hook is added.
  await page.evaluate(() => {
    const delayed = new WeakSet<IDBTransaction>(), descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!, put = IDBObjectStore.prototype.put;
    let armed = true;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (armed && args[0]?.key === 'quickEntry:preferences' && args[0].value.voiceDraft?.text === 'Change olive oil to 15g then log it') { armed = false; delayed.add(this.transaction); }
      return put.apply(this, args);
    };
    Object.defineProperty(IDBTransaction.prototype, 'oncomplete', { ...descriptor, set(handler) {
      descriptor.set!.call(this, function (this: IDBTransaction, event: Event) {
        if (delayed.has(this)) Object.assign(window, { releaseVoiceSave: () => handler.call(this, event) }); else handler.call(this, event);
      });
    } });
  });
  await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await page.evaluate(() => {
    const speech = (window as unknown as { speech: { onresult(event: unknown): void; onend(): void } }).speech;
    speech.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Change olive oil to 15g then log it' } }] }); speech.onend();
  });
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseVoiceSave?: unknown }).releaseVoiceSave)).toBe('function');
  if (interruption === 'leave') { await page.getByRole('button', { name: 'Back', exact: true }).click(); await expect(page).toHaveURL(/\/$/); }
  else await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => (window as unknown as { releaseVoiceSave(): void }).releaseVoiceSave());
  // Export waits for the repository's write queue, including the blur save.
  if (interruption === 'background') await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export backup', exact: true }).click(); await downloading;
  const interrupted = await state(page); expect(interrupted.logs).toEqual([]); expect(interrupted.amount).toBe('10'); expect(interrupted.command?.text).toBe('Change olive oil to 15g then log it');
  await page.evaluate(() => { delete (document as unknown as { visibilityState?: string }).visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  await page.goto('/'); await page.getByTestId('universal-log').click();
  await page.getByRole('button', { name: 'Continue voice command', exact: true }).click();
  await expect(page.getByTestId('voice-command')).toHaveValue('Change olive oil to 15g then log it');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-${interruption}-resumed-command.png`) });
  await page.getByRole('button', { name: 'Apply meal command', exact: true }).click();
  await expect(page).toHaveURL(/\/$/); await expect(page.getByTestId('today-overview').getByTestId('nutrition-kcal')).toHaveText('134');
  const saved = await state(page); expect(saved.logs).toHaveLength(1); expect(saved.logs[0].nutrition.fat).toBe('14.85'); expect(saved.command).toBeNull();
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click(); await expect.poll(async () => (await state(page)).logs.length).toBe(0);
});

test('repeated offline barcode attempts leave the meal intact and do not throttle reconnection', async ({ page, context }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await expect.poll(async () => (await state(page)).amount).toBe('10');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click(); await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill(milkCode);
  await context.setOffline(true); await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  for (let attempt = 0; attempt < 13; attempt++) {
    await page.getByRole('button', { name: 'Find product', exact: true }).click();
    await expect(page.getByRole('alert').filter({ visible: true })).toContainText('Saved products work offline');
  }
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-offline-barcode.png`) });
  const offline = await state(page); expect(offline.logs).toEqual([]); expect(offline.amount).toBe('10');
  await context.setOffline(false); let requests = 0; await page.route(endpoint, async route => { requests++; await route.fulfill({ json: milkProduct() }); });
  await page.getByRole('button', { name: 'Find product', exact: true }).click(); await expect(page.getByTestId('barcode-review')).toBeVisible(); expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click(); await expect(page.getByTestId('quantity-0')).toHaveValue('10'); expect((await state(page)).logs).toEqual([]);
});
