import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const output = path.resolve('../../verification/iphone-readiness');
test.beforeEach(async ({ page }) => { mkdirSync(output, { recursive: true }); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('iPhone-sized meal correction, six portions, reload, one serving and undo retain exact nutrition', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/entry');
  await page.getByTestId('quick-text').fill('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (const [i, id] of ['03.205', '05.016', '06.144'].entries()) await page.getByTestId(`choice-${i}-mvt:${id}`).click();
  await page.getByTestId('quantity-0').click(); await page.keyboard.insertText('250');
  await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  if (test.info().project.use.hasTouch) {
    await page.getByTestId('quantity-1').tap(); await page.keyboard.insertText('150');
    await expect(page.getByTestId('quantity-1')).toHaveValue('150');
  }
  await expect(page.getByTestId('quantity-1')).toHaveValue('150'); await expect(page.getByTestId('quantity-4')).toHaveValue('50');
  await page.getByTestId('quantity-0').fill('200');
  await expect(page.getByTestId('meal-kcal')).toContainText('1,116');
  await expect(page.getByTestId('commit-food')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-review.png`) });
  await page.getByRole('button', { name: 'Split into servings', exact: true }).click();
  await page.getByTestId('batch-servings').fill('6');
  await page.getByTestId('save-batch').click();
  // A document navigation must wait for the acknowledged storage commit,
  // rather than racing WebKit's IndexedDB transaction from the test runner.
  await expect(page.getByText('Batch saved · nothing logged', { exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.reload(); await expect(page.getByTestId('today-portions')).toContainText('6 servings left');
  await page.getByRole('button', { name: /^Log one saved serving of / }).click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('186'); await expect(page.getByTestId('today-fiber')).toContainText('1');
  await expect(page.getByTestId('today-portions')).toContainText('5 servings left');
  await page.reload(); await expect(page.getByTestId('nutrition-kcal')).toHaveText('186');
  await page.screenshot({ path: path.join(output, `${test.info().project.name || 'chromium'}-one-serving.png`) });
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('today-portions')).toContainText('6 servings left');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('–');
});

test('barcode fallback clears stale product guidance and leaves drafts intact', async ({ page }) => {
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('1234567890123');
  await page.getByRole('button', { name: 'Find saved product', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add this product', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Barcode', exact: true }).fill('123');
  await expect(page.getByRole('button', { name: 'Add this product', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Find saved product', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await expect(page.getByTestId('quick-text')).toHaveValue('10g olive oil');
  await expect(page.getByTestId('commit-food')).toBeEnabled();
});

test('denied browser speech recovers to typing and queued speech cannot log after leaving', async ({ page }) => {
  await page.addInitScript(() => {
    class Speech {
      onerror?: (event: { error: string }) => void;
      onresult?: (event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
      onstart?: () => void;
      start() {
        Object.assign(window, { delayedSpeech: () => this.onerror?.({ error: 'not-allowed' }), capturedSpeechResult: this.onresult });
        this.onstart?.();
      }
      stop() {} abort() {}
    }
    Object.assign(window, { SpeechRecognition: Speech });
  });
  await page.goto('/entry'); await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await page.evaluate(() => (window as unknown as { delayedSpeech: () => void }).delayedSpeech());
  await expect(page.getByRole('alert')).toContainText('Microphone access is off');
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Speak a command', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.evaluate(() => (window as unknown as { capturedSpeechResult: (event: unknown) => void }).capturedSpeechResult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'log meal' } }] }));
  await expect(page.getByTestId('log-row')).toHaveCount(0);
  await page.getByTestId('universal-log').click();
  await expect(page.getByTestId('quick-text')).toHaveValue('10g olive oil');
});
