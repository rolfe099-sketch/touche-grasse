import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/craft-redesign');
test('plus dock, real history shortcut, compact review and focused quantities work at iPhone sizes', async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const log = page.getByTestId('universal-log');
  await expect(log.locator('path')).toHaveAttribute('d', 'M16 6v20M6 16h20');
  await page.getByRole('button', { name: 'Explore intake history', exact: true }).click();
  await expect(page).toHaveURL(/history.*scope=week/);
  await expect(page.getByTestId('history-screen')).toBeVisible();
  await page.getByRole('tab', { name: 'Today', exact: true }).click();
  await log.click();
  await expect(page.getByTestId('quick-text')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Speak a command', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Scan a barcode', exact: true })).toBeInViewport({ ratio: 1 });
  const meal = '200g chicken, 150g pasta, 15g pesto, 10g olive oil, 50g parmesan';
  await page.getByTestId('quick-text').fill(meal);
  await page.getByTestId('choice-0-mvt:03.205').click();
  await page.getByTestId('choice-1-mvt:05.016').click();
  await page.getByTestId('choice-2-mvt:06.144').click();
  const measurements = [];
  for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await page.getByTestId('quantity-0').click();
    await expect(page.getByTestId('quantity-0')).toBeFocused();
    await expect(page.getByTestId('quantity-4')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('commit-food')).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId('commit-food')).toBeEnabled();
    await expect(page.getByTestId('meal-kcal')).toHaveText('1,116 kcal');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);
    measurements.push({ ...viewport, horizontalOverflow: overflow, allQuantitiesVisible: true, logActionVisible: true });
    await page.screenshot({ path: path.join(output, `review-${viewport.width}.png`) });
  }
  await page.getByTestId('commit-food').click();
  await expect(page.getByTestId('log-row')).toHaveCount(5);
  await page.reload(); await expect(page.getByTestId('log-row')).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo last log', exact: true }).click();
  await expect(page.getByTestId('log-row')).toHaveCount(0);
  writeFileSync(path.join(output, 'craft-interactions.json'), JSON.stringify({ measurements, centralAction: 'plus', historyShortcut: 'real week view', reloadAndUndo: true }, null, 2));
});
