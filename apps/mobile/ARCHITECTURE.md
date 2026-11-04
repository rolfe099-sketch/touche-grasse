# Expo migration decisions

## Reuse and translation

The existing SwiftUI views remain a behavioral/design reference; they cannot execute inside React Native. Swift domain arithmetic, parser behavior, snapshot rules and meaningful test scenarios were translated into TypeScript. Swift SQLite schema/database code remains intact; the Expo app has a separate database and schema migrations. This is not an automatic importer of a previously installed Swift app's database or its older backup format.

The captured and normalized Matvaretabellen catalog is reused without refetching. `scripts/import_catalog.py` reads the original normalized resource, converts numeric values into decimal strings and writes the bundled catalog plus manifest. Names, aliases, IDs, null nutrients, source URLs/IDs and nutrient provenance remain intact. Domain tests compare every source nutrient. Raw catalog captures and the original importer remain untouched.

## Application structure

| Location | Responsibility |
| --- | --- |
| `app/(tabs)` | Today, History, Library and Discover; circular Log opens the shared workspace |
| `app/entry.tsx` | Persistent structured draft, resolution and logging |
| `app/recipe.tsx` | Recipe ingredients, steps, portions and edits |
| `app/manual.tsx`, `app/scan.tsx` | Explicit manual nutrition, cached barcode lookup/camera |
| `app/settings.tsx` | Backup, restore, attribution and privacy |
| `src/domain` | Decimal arithmetic, validation, parser, shared search and repository |
| `src/storage` | Transactional SQLite native / IndexedDB browser adapters |
| `src/state` | Initialization, serialized actions, retained draft and feedback |
| `src/ui` | Shared controls, colors, typography and platform icon rendering |
| `src/platform` | Native/browser backup and offline shell differences |
| `src/data` | Bundled real catalog and manifest |
| `tests`, `e2e` | Domain/adapter/migration tests and browser acceptance workflows |

## Correctness and persistence

Nutrition quantities are decimal strings, calculated using decimal.js at 40 significant digits, half-even rounding. Only display values are rounded. Recipe portions multiply before dividing. Unknown nutrients propagate independently as null. Grams and milliliters require a known conversion when the food's reference unit differs; no oil absorption, cooked-water, density or household-measure guess is inserted.

The repository serializes writes and commits related changes atomically. Log snapshots include ingredient/recipe source values. Edits affect future logs; repeating an old log preserves its snapshot. Draft line IDs provide retry idempotence, and explicit repeats receive new IDs. Latest undo IDs persist across restarts. Revision comparisons fail closed on stale writers instead of overwriting another tab's changes. Reload after a stale-writer message to resynchronize.

Native uses Expo SQLite async APIs, WAL, full synchronous writes, migrations v1→v2 and exclusive transactions. Browser uses IndexedDB v2 transactions with the same repository contract. Adapter tests use a real Node SQLite driver for the SQL implementation and fake-indexeddb for the browser contract; browser integration separately exercises actual Chromium IndexedDB. Neither substitutes for Expo SQLite execution on iPhone.

SQLite Web currently needs WASM handling and COOP/COEP headers for SharedArrayBuffer ([Expo documentation](https://docs.expo.dev/versions/latest/sdk/sqlite/)). Its runtime and FTS capabilities are not assumed to match native. IndexedDB avoids those constraints during browser development. Both platforms use a shared normalized prefix index, all-term matching, conservative typo fallback, relevance/personal/usage ranking and a bounded query cache. Initial indexing yields after each 100 records; the search tab virtualizes results. No network API is called per keystroke.

Backups are version 2 JSON with runtime validation, size bounds, source snapshots and recalculated log checks. Restore merges personal foods and recipes by ID, preserves existing historical entries and a nonempty current draft, and rejects duplicate identities/barcodes. Swift version 1 backups need a deliberate future converter.

## Design system

The latest 24 October redesign follows the provided image: near-black green `#0D1110`, charcoal surfaces `#171C19`, cream text `#F3EEDF`, amber `#E8BD86` and sage `#B4C397`. Legacy semantic token names remain for source compatibility; current values live in `theme.ts`. Functional headings use Source Sans 3; conversational transcripts use bundled Newsreader. Navigation is Today / Library / circular Log / Discover / History, with Settings on Today. The nutrition ring displays actual macro energy proportions without introducing a target. Native transitions, short reveals and the active listening-state indicator respect Reduce Motion. See `../../verification/dark-redesign/README.md` for real screenshots and checks.

Shared controls keep 22-point horizontal spacing, 44-point utility targets and compact rules. Navigation retains Expo Router's tab-bar contract and legacy route paths. Safe-area, keyboard and Reduce Motion providers remain shared. Native keyboard, dynamic type and safe areas still need device review. Earlier History, photo, correction and retained-editor behavior is preserved from `PRODUCT_EXPERIENCE.md`.

## Recognition extension boundary

`recognition.ts` retains future label-recognition contracts. `naturalInput.ts` and `commands.ts` now route deterministic meal/recipe commands through the existing draft, resolver and repository. `platform/voice.ts` uses the optional SDK-54 speech module; `voice.web.ts` uses the browser recognition API. Interim text is display-only; final results enter the editable review. Native direct recognition needs a development build, while Expo Go retains keyboard-dictation/typed commands. Expo Camera and saved-barcode lookup share the inline Scanner component. OCR and remote barcode lookup remain unimplemented. Recognition never supplies nutrition or rewrites historical snapshots.

The native app stores local data without an account or analytics service. Browser caches can be evicted and clearing site data removes local records; regular JSON export is the current portability mechanism. No cloud synchronization is implemented.
