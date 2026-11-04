import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/daily-loop');
test('daily loop: auto focus, isolated correction, folded journal, repeat, reload and undo', async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await page.getByTestId('universal-log').click();
  await expect(page.getByTestId('quick-text')).toBeFocused();
  await page.getByTestId('quick-text').fill('200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan');
  for (const [i, id] of ['03.205', '05.016', '06.144'].entries()) await page.getByTestId(`choice-${i}-mvt:${id}`).click();
  await page.getByTestId('quantity-0').click(); await page.keyboard.insertText('250');
  for (const [i, amount] of ['250', '150', '15', '10', '50'].entries()) await expect(page.getByTestId(`quantity-${i}`)).toHaveValue(amount);
  await expect(page.getByTestId('meal-kcal')).toHaveText('1,172 kcal');
  await page.screenshot({ path: path.join(output, 'review-corrected-390.png') });
  await page.reload(); await expect(page.getByTestId('quantity-0')).toHaveValue('250');
  // Reduced viewport is a layout stress test, not a simulated physical iPhone keyboard.
  await page.setViewportSize({ width: 390, height: 520 });
  await page.getByTestId('quantity-4').click();
  await expect(page.getByTestId('quantity-4')).toBeFocused();
  await expect(page.getByTestId('commit-food')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('screen-footer')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: path.join(output, 'compact-viewport-390x520.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  // Exercise visual-only resizing independently of the layout viewport.
  await page.evaluate(() => { Object.defineProperty(visualViewport!, 'height', { configurable: true, value: 500 }); visualViewport!.dispatchEvent(new Event('resize')); });
  await expect.poll(async () => { const box = await page.getByTestId('screen-footer').boundingBox(); return Math.round(box!.y + box!.height); }).toBe(500);
  await page.evaluate(() => { Reflect.deleteProperty(visualViewport!, 'height'); visualViewport!.dispatchEvent(new Event('resize')); });
  await expect.poll(async () => { const box = await page.getByTestId('screen-footer').boundingBox(); return Math.round(box!.y + box!.height); }).toBe(844);
  await page.getByTestId('commit-food').click();
  const summary = page.getByTestId('meal-summary');
  await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(summary).toContainText('5 foods');
  await expect(page.getByRole('button', { name: 'View Kylling, filet, uten skinn, rå entry', exact: true })).toBeHidden();
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('log-row').filter({ visible: true })).toHaveCount(5);
  await page.getByRole('button', { name: 'View Kylling, filet, uten skinn, rå entry', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Logged amount', exact: true })).toHaveValue('250');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.reload(); await expect(summary).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('1,172');
  await page.getByTestId('repeat-meal').first().click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('2,344');
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('nutrition-kcal')).toHaveText('1,172');
});

test('entry method is remembered but a draft takes priority; Type focuses the meal without another panel', async ({ page }) => {
  await page.goto('/entry');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await expect(page.getByTestId('inline-scanner')).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('universal-log').click();
  await expect(page.getByTestId('inline-scanner')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('inline-scanner')).toBeVisible();
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await expect(page.getByTestId('quick-text')).toBeFocused();
  await expect(page.getByTestId('voice-command')).toHaveCount(0);
  await page.getByTestId('quick-text').fill('10g olive oil');
  await page.getByRole('button', { name: 'Scan a barcode', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('quick-text')).toHaveValue('10g olive oil');
  await expect(page.getByTestId('commit-food')).toBeEnabled();
  await page.getByRole('button', { name: 'Change meal type, Dinner', exact: true }).click();
  await page.getByRole('button', { name: 'Lunch', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Change meal type, Lunch', exact: true })).toBeVisible();
  await page.getByTestId('commit-food').click();
  await expect(page.getByText('LUNCH', { exact: true })).toBeVisible();
});

test('direct voice starts once; backgrounding stops capture and remembered voice never starts it automatically', async ({ page }) => {
  await page.addInitScript(() => {
    let starts = 0;
    class Recognition {
      onstart?: () => void; onend?: () => void;
      start() { starts++; this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: Recognition, voiceStarts: () => starts });
  });
  const starts = () => page.evaluate(() => (window as unknown as { voiceStarts: () => number }).voiceStarts());
  await page.goto('/'); await page.getByRole('button', { name: 'Log with voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop listening', exact: true })).toBeVisible();
  expect(await starts()).toBe(1);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button', { name: 'Speak a command', exact: true })).toBeVisible();
  await page.evaluate(() => { Reflect.deleteProperty(document, 'visibilityState'); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await starts()).toBe(1);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('universal-log').click();
  await expect(page.getByTestId('voice-command')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speak a command', exact: true })).toBeVisible();
  expect(await starts()).toBe(1);
  await page.getByRole('button', { name: 'Type a meal', exact: true }).click();
  await expect(page.getByTestId('quick-text')).toBeFocused();
  expect(await starts()).toBe(1);
});
