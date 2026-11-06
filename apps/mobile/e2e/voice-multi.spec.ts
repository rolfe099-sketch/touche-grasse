import { expect, Page, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import catalog from '../src/data/catalog.json';
import { display, emptyDraft, Food, foodNutrition, total } from '../src/domain/model';
import { FoodIndex } from '../src/domain/search';

const transcript = '10 g olive oil then add 100 grams chicken and add 50 g apple';
const output = path.resolve('../../verification/voice-multi');
const index = new FoodIndex(); (catalog as Food[]).forEach(food => index.add(food));
const oil = index.get('mvt:08.019')!, chicken = index.get('mvt:03.205')!;
const apple = index.search('apple')[0];
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.setViewportSize({ width: 393, height: 852 }); await page.emulateMedia({ reducedMotion: 'reduce' }); });
async function backup(page: Page) {
  // Keep the application/repository alive until Export awaits its write queue.
  // A hard page.goto here could destroy a just-started IndexedDB draft write.
  if (!page.url().endsWith('/settings')) {
    if (page.url().includes('/entry')) await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Your data and settings', exact: true }).click();
  }
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  return JSON.parse(readFileSync((await (await downloading).path())!, 'utf8'));
}
async function checkRows(page: Page, amount = '100') {
  await expect(page.getByTestId('quantity-0')).toHaveValue('10');
  await expect(page.getByTestId('quantity-1')).toHaveValue(amount);
  await expect(page.getByTestId('quantity-2')).toHaveValue('50');
  await expect(page.getByTestId('quantity-3')).toHaveCount(0);
}

test('the reported spoken sentence creates three editable ingredients, preserves corrections and learns only confirmed products', async ({ page }) => {
  // This round trip includes three real backup downloads and two app reloads;
  // Windows WebKit needs more than the default minute for the complete scenario.
  test.setTimeout(90_000);
  // Inject final transcripts at the browser speech adapter boundary. This tests
  // the real review/persistence workflow, not microphone recognition accuracy.
  await page.addInitScript(() => {
    class Speech {
      onstart?: () => void; onend?: () => void; onresult?: (event: unknown) => void;
      start() { this.onstart?.(); Object.assign(window, { deliverSpeech: (text: string, final: boolean) => {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
        if (final) this.onend?.();
      } }); }
      stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Speech });
  });
  async function speak() {
    await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
    await page.evaluate(text => (window as unknown as { deliverSpeech: (text: string, final: boolean) => void }).deliverSpeech(text, false), transcript);
    await expect(page.getByTestId('quantity-0')).toHaveCount(0);
    await page.evaluate(text => (window as unknown as { deliverSpeech: (text: string, final: boolean) => void }).deliverSpeech(text, true), transcript);
  }
  await page.goto('/entry'); await speak(); await checkRows(page);
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  await expect(page.getByTestId('ingredient-1').getByRole('button', { name: 'Change food 2', exact: true })).toContainText('chicken');
  await expect(page.getByTestId('ingredient-2').getByRole('button', { name: 'Change food 3', exact: true })).toContainText('apple');
  await expect(page.getByTestId('entry-search')).toHaveValue('chicken');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-three-ingredients.png`) });
  await page.getByTestId('choice-1-mvt:03.205').click();
  await expect(page.getByTestId('entry-search')).toHaveValue('apple');
  expect(apple.aliases.join(' ')).toMatch(/apple.*raw/i);
  await page.getByTestId(`choice-2-${apple.id}`).click(); await expect(page.getByTestId('commit-food')).toBeEnabled();
  await page.getByTestId('quantity-1').fill('125'); await checkRows(page, '125');
  // Export waits for the persisted source mapping; a reload must retain the edit.
  const draftBackup = await backup(page); expect(draftBackup.logs).toHaveLength(0); expect(draftBackup.draft.lines[1].quantityText).toBe('125');
  await page.goto('/entry'); await page.reload(); await checkRows(page, '125');
  const expected = total([foodNutrition(oil, '10', 'g'), foodNutrition(chicken, '125', 'g'), foodNutrition(apple, '50', 'g')]);
  await expect(page.getByTestId('meal-kcal')).toContainText(display(expected.kcal, 0));
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  const logged = await backup(page); expect(logged.logs).toHaveLength(3);
  expect(total(logged.logs.map((log: { nutrition: ReturnType<typeof total> }) => log.nutrition))).toEqual(expected);
  expect(logged.quickEntry.matches.chicken.foodId).toBe(chicken.id); expect(logged.quickEntry.matches.apple.foodId).toBe(apple.id);
  await page.goto('/entry'); await speak(); await checkRows(page);
  await expect(page.getByTestId('commit-food')).toBeEnabled(); await expect(page.getByTestId('ingredient-choices')).toHaveCount(0);
  await page.getByTestId('commit-food').click(); await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect((await backup(page)).logs.sort(byId)).toEqual(logged.logs.sort(byId));
});

test('typed multi-add phrases and old malformed persisted drafts use the same safe parser without touching history', async ({ page }) => {
  const oldSource = { id: 'old-source', query: 'olive oil then add 100 grams chicken and add 50 g apple', quantityText: '10', unit: 'g' };
  const historic = { id: 'historical', batchId: 'historical-batch', meal: 'Middag', recordedAt: '2026-10-01T12:00:00.000Z', snapshot: { kind: 'food', ingredient: { id: 'historical-ingredient', food: oil, quantity: '10', unit: 'g' } }, nutrition: foodNutrition(oil, '10', 'g') };
  const archive = { format: 'touche-grasse', version: 2, foods: [oil], recipes: [], logs: [historic], draft: { ...emptyDraft(randomUUID), text: transcript, textRows: [oldSource], lines: [{ ...oldSource, food: null }] } };
  await page.goto('/settings'); const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Choose a backup file', exact: true }).click();
  await (await choosing).setFiles({ name: 'isolated-old-speech-draft.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) });
  await page.getByRole('button', { name: 'Confirm restore', exact: true }).click(); await expect(page.getByText('Backup restored', { exact: true })).toBeVisible();
  await page.goto('/entry'); await checkRows(page); await expect(page.getByTestId('entry-search')).toHaveValue('chicken');
  await expect(page.getByTestId('commit-food')).toBeDisabled();
  const repaired = await backup(page); expect(repaired.logs).toEqual([historic]); expect(repaired.draft.textRows).toHaveLength(3);
  await page.goto('/entry'); await page.reload(); await checkRows(page);
  await page.getByTestId('quick-text').fill('Add ten grams of olive oil then add one hundred grams chicken and add fifty grams of apple.'); await checkRows(page);
  const after = await backup(page); expect(after.logs).toEqual([historic]);
  expect(after.draft.lines.map((line: { query: string; quantityText: string }) => [line.query, line.quantityText])).toEqual([['olive oil', '10'], ['chicken', '100'], ['apple', '50']]);
});
