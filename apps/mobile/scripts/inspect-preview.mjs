import { chromium } from '@playwright/test';
import path from 'node:path';
import { readdirSync } from 'node:fs';
const folder = readdirSync('.playwright-browsers').find(n => /^chromium-\d+$/.test(n));
const browser = await chromium.launch({ executablePath: path.resolve('.playwright-browsers', folder, 'chrome-win64/chrome.exe') });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(process.env.TG_TEST_URL ?? 'http://127.0.0.1:4173');
await page.getByTestId('today-add').waitFor();
console.log(JSON.stringify(await page.getByText('Foods', { exact: true }).evaluate(el => {
  const result = []; for (let node = el; node && result.length < 5; node = node.parentElement) { const s = getComputedStyle(node); result.push({ tag: node.tagName, box: node.getBoundingClientRect().toJSON(), height: s.height, fontSize: s.fontSize, lineHeight: s.lineHeight, overflow: s.overflow, padding: s.padding }); } return result;
}), null, 2));
await browser.close();
