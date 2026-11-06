import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testMatch: ['meal-prep-finish.spec.ts', 'portions.spec.ts', 'food-matching-coverage.spec.ts', 'backup-upgrades.spec.ts', 'offline-interruptions.spec.ts', 'accessibility-finish.spec.ts', 'logging-craft.spec.ts', 'log-destinations.spec.ts', 'iphone-usability.spec.ts', 'label-capture.spec.ts', 'voice-scan-reliability.spec.ts', 'meal-editing-weight.spec.ts', 'daily-workflows.spec.ts', 'iphone-readiness.spec.ts', 'deletion.spec.ts', 'voice-multi.spec.ts', 'barcode.spec.ts', 'recovery.spec.ts', 'repeat-meals.spec.ts', 'label-scan.spec.ts'],
  outputDir: 'test-results/iphone-webkit',
  reporter: [['list'], ['json', { outputFile: '../../verification/iphone-readiness/webkit-results.json' }]],
  projects: [{ name: 'webkit-iphone13pro', use: {
    browserName: 'webkit', viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true,
    launchOptions: { executablePath: undefined },
  } }],
});
