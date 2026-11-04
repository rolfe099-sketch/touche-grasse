import { defineConfig } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
const browsers = path.resolve('.playwright-browsers');
const chromium = existsSync(browsers) ? readdirSync(browsers).find(name => /^chromium-\d+$/.test(name)) : undefined;
const executablePath = chromium && process.platform === 'win32' ? path.join(browsers, chromium, 'chrome-win64/chrome.exe') : undefined;
export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  webServer: process.env.CI ? { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 } : undefined,
  outputDir: process.env.TG_TEST_ARTIFACTS ?? 'test-results/production',
  testDir: 'e2e', fullyParallel: false, workers: 1, timeout: 60000,
  use: { baseURL: process.env.TG_TEST_URL ?? 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
    launchOptions: { executablePath }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  reporter: [['list'], ['json', { outputFile: process.env.TG_TEST_REPORT ?? '../../verification/dark-redesign/browser-results.json' }]],
});
