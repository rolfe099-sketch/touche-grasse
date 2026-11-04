import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testMatch: ['iphone-readiness.spec.ts', 'deletion.spec.ts', 'voice-multi.spec.ts'],
  outputDir: 'test-results/iphone-webkit',
  reporter: [['list'], ['json', { outputFile: '../../verification/iphone-readiness/webkit-results.json' }]],
  projects: [{ name: 'webkit-iphone13pro', use: {
    browserName: 'webkit', viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true,
    launchOptions: { executablePath: undefined },
  } }],
});
