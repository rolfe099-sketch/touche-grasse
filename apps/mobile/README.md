# Touche Grasse mobile

This is the active Expo/React Native implementation. See the [project README](../../README.md) for features, screenshots, license, contribution links and current limitations.

## Development

Use Node 24 LTS and npm:

```sh
npm ci
npm run web
# Or choose a port:
npx expo start --web --port 8082
```

No API keys or backend are required for the offline catalog and food diary. The app uses Expo SDK 54. For phone development, use `npm start` and the address/QR printed by Metro on your own network. Do not reuse another developer's LAN address. Check current Expo runtime compatibility before installing or upgrading a phone client.

Direct native speech requires a development build containing `expo-speech-recognition`. Browser speech depends on browser support and permissions. Barcodes check saved products first, then Open Food Facts with inline package review before saving. Camera and recovery file sharing still need physical-device validation. See [barcode and recovery behavior](../../docs/BARCODES_AND_RECOVERY.md).

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build:web
npm run preview
```

The preview serves the export on `http://127.0.0.1:4173`. In a second terminal:

```sh
npx playwright install chromium
npm run test:e2e
```

CI starts the preview automatically when running Playwright after the web build. Test outputs live in ignored `test-results` and root `verification` folders, which the test setup creates automatically. Tests use isolated contexts, not your browser library.

`npm run build:web` creates a service-worker-enabled export for offline reload after the first successful load. Metro development does not install that worker. IndexedDB is scoped by origin: hostname and port changes create separate libraries. Use backup export/restore to transfer records.

For an iOS JavaScript packaging check, use `npx expo export --platform ios --output-dir dist-ios`. This is not a signed native build or physical-device test.

## Data and storage

- Native storage: Expo SQLite. Web storage: IndexedDB.
- Catalog: 2,121 Matvaretabellen records, preserved provenance, English/Norwegian matching, fiber and preparation distinctions.
- Domain arithmetic: exact decimal strings through Decimal.js. Historical snapshots survive later food and recipe edits.
- Backups: validated JSON merge restore, including recipes, portions, drafts, learned matches and dated targets. Exports are unencrypted and may contain personal history and photos. Never commit them.
- Automatic recovery: up to six verified local versions after quiet periods, separate from the diary database, with pre-restore copies and Settings recovery/export. Same-device copies do not replace exports stored elsewhere.

Food data and font/logo attribution are in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). Original code is AGPL-3.0-only. Optional support: https://buymeacoffee.com/endoftheend.

The architecture and status documents in this folder describe implementation details and dated earlier milestones. The root README is the current public entry point.
