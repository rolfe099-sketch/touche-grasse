# Third-party notices

AGPL-3.0-only applies to original Touche Grasse code and documentation. It does not replace the following third-party terms.

## Food composition data

**Matvaretabellen — Mattilsynet** is the source of the bundled food data. Norwegian and English API responses were captured on 22 October 2026. Raw responses and SHA-256 hashes are retained in `Fixtures/manifest.json`; normalization provenance is in `apps/mobile/src/data/manifest.json`. Food IDs, URLs and nutrient-source IDs are preserved.

Official usage information: https://matvaretabellen.mattilsynet.io/en/api/

The documentation requests attribution and describes local caching. No ownership of the source database is claimed; the software license does not relicense it. Preserve attribution and review the source's current terms when redistributing or refreshing data.

## Open Food Facts product data

Optional barcode lookup uses [Open Food Facts](https://world.openfoodfacts.org/) API v3.6. Contains information from Open Food Facts, made available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/); individual contents are under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/). These terms are separate from the app's AGPL code license. Preserve attribution and applicable share-alike terms when redistributing derived product databases. This integration does not bundle product images or a public combined food database.

Reviewed product records and their exported snapshots retain source URLs, retrieval/review dates, original values, correction provenance and license identification. Matvaretabellen attribution is retained independently. Product review is a user comparison with the package, not independent verification by Touche Grasse. See the provider's [license guidance](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/).

## Fonts

DM Sans and Newsreader are supplied through `@expo-google-fonts` under the SIL Open Font License. A Source Sans 3 notice remains from earlier typography work. Texts are preserved in `apps/mobile/assets/licenses/`. The npm packages and tooling retain their own notices.

## Buy Me a Coffee

The original cup SVG is from https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg. Brand resources: https://buymeacoffee.com/brand. It identifies the optional external support link. The name and logo remain their owner's property and are not relicensed under AGPL. No endorsement is implied.

## Dependencies

Expo, React, React Native, Decimal.js, SQLite adapters, Zod and other dependencies retain their respective licenses in their npm distributions. `apps/mobile/package-lock.json` identifies the pinned tree. Dependencies and browser binaries are not vendored.

## Screenshots and fixtures

README screenshots show the actual app with isolated catalog-derived test meals. Tests create synthetic history, photos and identifiers. Personal databases, exports, recordings and browser profiles are excluded from publication.

## openGym

openGym is an independent project referenced as inspiration for community ownership. No openGym source, exercise database or exercise media is bundled.

## Local nutrition-label recognition

Native recognition uses pinned `expo-ocr-kit` 0.1.4 (published package metadata: MIT, author ManojkanthR), through Apple Vision on iOS and ML Kit on Android. [Upstream source](https://github.com/ManojKanth/expo-ocr-kit). No upstream WebView is used by the app.

Browser recognition uses Tesseract.js 7.0.0 and its core under Apache-2.0, with the English and Norwegian `4.0.0_best_int` traineddata from `@tesseract.js-data/eng` and `/nor` 1.0.0. Those npm package wrappers declare MIT; the underlying [Tessdata distribution](https://github.com/naptha/tessdata) supplies an Apache-2.0 license. License texts and attribution are retained in `apps/mobile/assets/licenses/`; `prepare:ocr` copies them beside the generated, self-hosted OCR assets. Generated engines/models are not committed to Git. Photos are not uploaded to these projects or an OCR service.
