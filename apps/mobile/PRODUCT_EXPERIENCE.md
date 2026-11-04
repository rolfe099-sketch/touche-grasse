# Product experience revision — 23 October 2026

**Superseded visual direction:** the latest reference-driven dark redesign is implemented and documented in `../../verification/dark-redesign/README.md`. The warm-paper/green palette and old navigation below describe a previous revision. Its working history, recipe, photo, correction and persistence behavior is preserved in the redesigned application.

The revision brief is preserved in `../../docs/PRODUCT_EXPERIENCE_REVISION.md`. This implementation changes the active Expo app. The original SwiftUI project and captured food catalog remain intact.

## Visual system and navigation

Newsreader supplies the wordmark and cookbook titles. Source Sans 3 supplies functional copy, quantities, navigation and statistics. Five static font files load through the SDK 54 font loader and are bundled for offline use; there is no runtime Google Fonts request. Font licenses are retained in `assets/licenses`. Static fonts avoid relying on newer variable-font support ([Expo font documentation](https://docs.expo.dev/develop/user-interface/fonts/)).

Warm paper, dark green ink, firm rules and compact rows establish the layout. The exact six brand colors remain in `src/ui/theme.ts`: Ocean for protein/energy charts, Forrest for primary actions and saved content, Tangerine for food entry/carbohydrates, Toffee for fat/selection, Skyline as the light blue identity color, and Salsa for the error family. Readable semantic derivatives and neutrals complement them.

`Icon.tsx` contains the original SVG pictograms: a bowl/leaf wordmark emblem, a bound cookbook, calendar, history and familiar bold utility geometry. No icon pack was added. The installed Symbols package remains compatible but is no longer the app's visual language.

The bottom bar uses the installed React Navigation tab-bar extension exposed by Expo Router. Text destinations are Today, History, Recipes and Foods. A permanent Tangerine Log action sits between them. Native safe-area insets and at least 44-point action targets are retained. Tabs remain mounted to preserve their state and scroll positions; browser tests scope retained-tab content explicitly.

## Today and cookbook

Today combines date navigation, a calendar picker, recorded meal/entry counts, logged calories, macro values and a proportional macro-energy strip. The strip describes the logged macro mix; it is not a daily target or completion score. An unlogged day shows missing intake, useful entry paths and the owner's real cookbook. Recent shortcuts are derived from retained logs, never fabricated activity.

Meal rows expose amounts, times, calories and repeat actions. Opening a row reveals full stored nutrition and, for recipes, the original ingredients. Saved and recent recipes can be logged directly.

The recipe editor has a Newsreader name, compact serving control, optional owner photo and ingredient rows with inline quantities/units. Long Norwegian source names wrap naturally. Preparation has separate read/edit modes with numbered steps. Optional cooked batch weight enables gram portions without guessing water loss. Nutrition updates from the original decimal calculations.

Unfinished recipe edits, including temporarily invalid amounts, persist locally after a short 180 ms debounce and flush when the editor loses focus. Successful save clears that recipe draft in the same transaction. Existing active drafts win during restore. The food-entry draft continues to use its original persistent contract.

Only user-selected photos are accepted. Browser file selection supports JPEG/PNG/WebP up to 2 MB. The native implementation uses the Expo photo picker and local JPEG resizing; its device behavior remains unverified. Photos remain with saved recipes and backups, and are excluded from new nutrition-log snapshots to avoid repeated image duplication. Export and restore enforce the same 50 MB UTF-8 archive limit, with an explicit export error rather than creating an unrestorable file.

## History and its definitions

- **Entry:** one logged food or recipe portion, with its own nutrient snapshot.
- **Meal:** a distinct calendar date plus meal label (Breakfast, Lunch, Dinner or Other). Multiple entries under the same label on one day count as one meal.
- **Logged day:** a local calendar day with at least one entry. This does not certify a complete day's intake.
- **Recipe servings:** only explicit serving quantities are counted. Gram portions are not inferred into servings; foods in grams are not counted as servings.
- **Average intake:** sum of the nutrient snapshots divided by the number of logged days in that period. Unlogged days are omitted, and unknown nutrient values propagate. The denominator and the possibility of partially logged days are visible.

Day shows meal groups, timestamps and nutrient snapshots, with corrections accessible from each row. Week shows daily bars, a selectable tooltip, metric controls, a day list and averages per logged day. Month adds a navigable calendar, daily trends and a comparison when both months have at least three logged days and known energy averages. All time shows meal/day/entry/library counts, monthly averages, gaps for missing months and a route to the first retained log.

Calendar jumping accepts an explicit year as part of a date; month navigation crosses years naturally. The selected History date and scope are reflected in route parameters and survive reload. Missing dates and periods before known tracking began are distinct from recorded zero intake. There are no streaks, calorie rewards or fabricated insights.

First-use metadata persists in the existing record store. For older archives without it, the earliest retained log date or prior version's recorded date supplies an earlier known bound. Restoration preserves the earliest known date. This cannot reconstruct a first app launch that was never recorded. No body measurements exist in the current Expo data model; no weight, waist or body-fat data was invented.

## Historical corrections and compatibility

Corrections retain entry identity and the prior timestamp, meal, source snapshot and calculated nutrition. Recalculation uses the historical food/recipe snapshot. Editing a current source or recipe does not rewrite that history. The correction and earlier tracking date commit atomically. The entry screen makes the retained prior versions available for inspection.

SQLite and IndexedDB remain at storage schema 2; their existing typed record envelope accepts the new profile and recipe-draft kinds. Backup format 2 gains optional profile, recipe drafts, photos and correction trails while continuing to accept prior format-2 archives. Existing historical entries win on restore, matching the established merge policy. Corrupt nutrition in correction trails is rejected before any writes.

The UI is English. Norwegian food names and English aliases remain unchanged. Locale/date helpers and typed common-message keys live in `src/i18n`, and persisted Norwegian meal identifiers map to English display labels. Future language work can extend this boundary and extract remaining screen-specific English copy; source food records must never be used as translation keys.

## Motion, access and verification

Press feedback and 140 ms reveals provide immediate feedback without gating actions. One shared Reduce Motion subscription disables transitions and press scaling. Logging retains the existing iOS haptic. Chart days are keyboard/touch controls with accessible dates, values and pressed states. Native camera/media permissions are declared in English for a future app-owned binary; Expo Go uses its host permissions.

Browser evidence is under `../../verification/design-revision/`. Screenshots with populated history use explicit isolated verification archives and real catalog nutrient values. They do not modify the owner's browser profile or seed production activity. Tests cover logging/repeat/undo/offline reload, structured drafts, recipe edits, historical snapshots, backup restoration, all History scopes, calendar jumps, corrections, photos and sparse data.

Final results: 54 domain/storage tests and 10 browser workflows passed, strict TypeScript and ESLint passed, Expo Doctor passed 18/18, and local web/iOS JavaScript exports succeeded. The live Metro preview was verified at 375/430 px, with the five expected font faces loaded and Fast Refresh working. All 38 original files in the preservation manifest are unchanged. See the verification README and machine-generated JSON reports for evidence and test-data boundaries.

Physical iPhone verification is still required for custom-font rendering, photo-library permissions/HEIC conversion, native SQLite reopen, keyboard/dynamic type, VoiceOver, safe areas and haptics. A successful iOS JavaScript export is not an iPhone run. No EAS, signing or publishing workflow was initiated.
