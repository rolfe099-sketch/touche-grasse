import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const expected = process.env.TG_PLAYWRIGHT_IMAGE_VERSION;
const actual = require('playwright/package.json').version;
if (!expected || actual !== expected) throw new Error(`The pinned browser image must match Playwright ${actual}. Update the container tag and TG_PLAYWRIGHT_IMAGE_VERSION together.`);
const { chromium, webkit } = require('playwright');
for (const browser of [chromium, webkit]) {
  if (!existsSync(browser.executablePath())) throw new Error(`The ${browser.name()} runtime is missing. Use the pinned Playwright image for CI.`);
  console.log(`${browser.name()} ${actual}: installed runtime found`);
}
