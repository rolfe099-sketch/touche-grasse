# Expo implementation status — 2026-10-22

**Latest revision: 24 October 2026, dark reference.** The near-black / cream / amber / sage redesign is implemented with Today / Library / circular Log / Discover / History navigation and Settings on Today. Unified voice/text/scan review, conversational commands, searchable personal content and one-tap saved portions are preserved. Current checks: 94 unit/storage tests and 20 browser tests passed, with one historical baseline capture skipped; both redesign flows also passed at localhost:8082. TypeScript, lint, production web export and local iOS JS/Hermes export pass. See `../../verification/dark-redesign/README.md` for screenshots, contrast, interaction counts and runtime limits. Native direct voice needs a development build; physical recognition is unverified. The original migration report below is retained as its dated baseline.

## Delivered

Stages A–C have working code, local builds and browser verification. Stage D has recipe creation/editing, saved ingredients/instructions/servings, favorite/duplicate actions and portion logging. Stage E is limited to cached barcode lookup and Expo Camera source; recognition contracts exist for future work.

38 pre-existing project files match the pre-migration SHA-256 manifest, including SwiftUI, Swift core/tests, SQL, source captures and documentation. The original catalog was reused; all 2,121 imported records are compared against its values in tests. No Git commit was made: this workspace is not a Git repository.

## Verification evidence

| Check | Observed result |
| --- | --- |
| Strict TypeScript | Passed |
| ESLint | Passed |
| Domain and storage tests | 41 passed across 2 files |
| Browser acceptance | 5 passed in real Chromium at 390 × 844 |
| Expo dependency alignment | Dependencies up to date |
| Expo Doctor | 18/18 passed |
| Web export | 848 modules; 21 local assets in offline manifest |
| iOS JS/Hermes export | 1,237 modules; local bundle produced, not a native binary/device test |
| Live development preview | Rendered at 375 × 812 and 430 × 932, no page errors |
| Fast Refresh | Temporary screen-text edit rendered, then restored without restarting Metro |
| Original-file preservation | 38 checked, zero changed/missing |

Browser workflows cover:

1. Actual Matvaretabellen olive oil, 10 g, totals, repeat, undo, reload, offline cold reload and offline repeat.
2. Structured four-item input, decimal comma, blocked unresolved food, corrections and retained draft after navigation/reload.
3. Recipe creation, edit, logged snapshot unchanged, JSON export and restore without duplicated history.
4. Pesto meal preparation with seven explicit real-food selections, unresolved stock blocking commit, a clearly labelled subtotal, pesto changed to 150 g while other amounts remain unchanged, six servings and persistent portion log.
5. Manual per-100ml test-only food, unknown nutrient propagation and a saved-barcode lookup round trip. This exercises barcode lookup, not a camera.

SQL adapter tests execute the actual implementation against Node SQLite, including on-disk reopen, migrations, rollback and future-schema refusal. IndexedDB contract tests use fake-indexeddb; browser integration uses real IndexedDB. Historical-food/recipe changes, corrupted restore rejection, duplicate barcodes and stale writers are also tested.

Measured performance: a Node run averaged 0.020 ms per query across 1,000 mixed warm cached queries; the browser fill-to-visible measurement is in `verification/expo/browser-search-timing.json` and includes Playwright overhead. These are desktop measurements, not iPhone latency claims. Initial catalog indexing yields to the UI between batches.

Evidence lives in `../../verification/expo/`: browser JSON report, actual screenshots, source-preservation report, audit report and development/Fast Refresh report. Previous failed-test traces can remain in local test-results; the latest browser JSON report is authoritative for the last run.

## Remaining verification and limitations

- Physical iPhone: Expo Go launch, Expo SQLite persistence after force-close, camera permissions/reading, haptics, SF Symbols, keyboard, dynamic type/safe areas, native file picking/sharing and actual device performance remain unverified.
- All seven pesto test ingredients use real source data, but those selections are test assumptions rather than owner-confirmed brands. Chicken stock and seasoning quantities are missing; no complete meal nutritional total is claimed.
- Native speech recognition, label OCR, spoken instructions and remote barcode discovery are not implemented. No mock camera/OCR/voice success is presented.
- Browser state is per origin and can be evicted. No account/cloud sync exists. Native and browser stores are separate; version 2 JSON export/restore transfers current-app records. Earlier Swift backup migration is not implemented.
- SDK 54 is intentional for the current App Store Expo Go path. The npm audit has 31 affected package entries (23 high, 8 moderate); a nonbreaking fix did not clear them. Expo Doctor compatibility checks are not a security audit. Before release, reassess patches and supported SDK/runtime options.
- No EAS Build, EAS Update, `eas go`, Apple signing, paid setup, cloud deployment or physical-device run was performed.

## Next milestone

Run the documented physical-iPhone acceptance flow against this Metro project and resolve device-specific defects. Confirm the pesto ingredient/product choices and missing stock/seasoning quantities. Only then select an OCR/STT implementation and its runtime/permission requirements; obtain explicit authorization before any build/signing/cloud workflow.
