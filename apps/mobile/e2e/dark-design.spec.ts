import { expect, Locator, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
async function contrast(locator: Locator) {
  return locator.evaluate(element => {
    const luminance = (text: string) => { const channels = text.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722; };
    let node: Element | null = element, background = 'rgb(255,255,255)';
    while (node) { const candidate = getComputedStyle(node).backgroundColor; if (candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') { background = candidate; break; } node = node.parentElement; }
    const foreground = getComputedStyle(element).color, a = luminance(foreground), b = luminance(background);
    return { foreground, background, backgroundLuminance: b, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
}
test('dark reference treatment remains readable, Settings stays on Today, and the circular Log action is centered in the requested navigation order', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('tab')).toHaveText(['Today', 'Library', 'Discover', 'History']);
  const heading = await contrast(page.getByRole('heading', { name: 'Today', exact: true }));
  expect(heading.backgroundLuminance).toBeLessThan(0.03); expect(heading.ratio).toBeGreaterThanOrEqual(4.5);
  const log = (await page.getByTestId('universal-log').boundingBox())!, width = page.viewportSize()!.width;
  expect(Math.abs(log.x + log.width / 2 - width / 2)).toBeLessThan(1); expect(log.width).toBe(log.height);
  const library = (await page.getByRole('tab', { name: 'Library', exact: true }).boundingBox())!, discover = (await page.getByRole('tab', { name: 'Discover', exact: true }).boundingBox())!;
  expect(library.x + library.width).toBeLessThanOrEqual(log.x); expect(discover.x).toBeGreaterThan(log.x + log.width);
  await expect(page.getByRole('tab', { name: /settings/i })).toHaveCount(0);
  const settings = (await page.getByRole('button', { name: 'Your data and settings', exact: true }).boundingBox())!;
  expect(settings.x).toBeGreaterThan(width - 140); expect(settings.width).toBeLessThanOrEqual(44);
  const support = page.getByRole('link', { name: 'Support Touche Grasse on Buy Me a Coffee', exact: true });
  await expect(support).toHaveAttribute('href', 'https://buymeacoffee.com/endoftheend');
  expect((await support.boundingBox())!.x).toBeGreaterThan(settings.x);
  await page.getByRole('button', { name: 'Your data and settings', exact: true }).click(); await expect(page.getByRole('button', { name: 'Export backup', exact: true })).toBeVisible();
  await page.goto('/entry'); await page.getByTestId('quick-text').fill('10g olive oil'); await expect(page.getByTestId('commit-food')).toBeEnabled();
  const field = await contrast(page.getByTestId('quick-text')), action = await contrast(page.getByTestId('commit-food').getByText('Log food today', { exact: true }));
  expect(field.ratio).toBeGreaterThanOrEqual(4.5); expect(action.ratio).toBeGreaterThanOrEqual(4.5);
  await expect(page.getByTestId('voice-start')).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: 'Type commands', exact: true }).click(); const voice = await contrast(page.getByTestId('voice-command')); expect(voice.ratio).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const output = path.resolve(process.env.TG_REDESIGN_OUTPUT ?? '../../verification/dark-redesign'); mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'readability.json'), JSON.stringify({ viewport: page.viewportSize(), heading, field, action, voice, centerAction: log, settings, horizontalOverflow: false }, null, 2));
});
