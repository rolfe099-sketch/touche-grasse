# Roadmap

The focus is fast, trustworthy logging. This list reflects implemented work and remaining checks; it is not a release promise.

## Implemented

- Recipe-first Discover with 12 original offline recipes, illustrated browsing, direct save/prepare actions, saved-idea filtering, compact ingredients/method review and source-based nutrition. Ingredient exploration retains bilingual search, explicit reference units and inline amount edits. See [the Discover overhaul](docs/DISCOVER_OVERHAUL.md).

- Live multi-ingredient Quick Log, verified English/Norwegian food matching, remembered product choices and explicit preparation ambiguity.
- Voice/text/barcode entry, retained interrupted commands, cooking sequences, recipes, finite saved portions and one-action logging with Undo.
- Label-photo OCR, crop/rotation, source comparison, explicit uncertain-unit confirmation and retained correction/rescan drafts.
- Named/pinned meal shortcuts, one-tap repeats, independent repeat amount drafts, optional targets and explicit day-completion markers.
- Whole-meal ingredient corrections, date/meal moves, retained audit history and persistent correction Undo.
- Dated weigh-ins and trends, complete-day intake summaries, versioned local recovery copies, portable export and reviewed file restore.
- Inline Today/Yesterday/calendar destinations and remembered meal choices. Destination, calendar, conflict and repeat controls now share a compact visual language. See [the current milestone](docs/LOGGING_CRAFT_AND_MEAL_CORRECTIONS.md).

- Adaptive macro grids and form rows, larger search/day targets, one-tap search clearing, descriptive nutrient groups and selected-tab semantics. See [accessibility and keyboard finish](docs/ACCESSIBILITY_AND_KEYBOARD.md); physical VoiceOver and Dynamic Type remain pending.

- Interrupted automatic speech remains an explicit-resume draft when leaving or backgrounding before submission. Offline barcode attempts no longer impose a reconnection lockout; provider HTTP limits remain enforced. See [offline and interruption recovery](docs/OFFLINE_AND_INTERRUPTION_RECOVERY.md).

- Complete restore validation before confirmation, rejection of unsupported fields/record types, failed-startup handle cleanup and legacy correction/snapshot compatibility. See [backup and upgrade safety](docs/BACKUP_AND_UPGRADE_SAFETY.md); full physical iPhone restoration remains pending.

- Observed ingredient-search failures now have explicit English/Norwegian phrase coverage, complete-word relevance and raw/cooked mismatch guards. See [everyday matching coverage](docs/FOOD_MATCHING_COVERAGE.md).

- Compact recipe and stock-aware portion controls, direct Today batch destinations, exact serving/gram switches, final-fraction shortcuts, Tomorrow logging and immediate acknowledged recipe draft saves. See [meal-prep finishing pass](docs/MEAL_PREP_FINISH.md); hardware acceptance remains pending.

- Per-batch portion drafts retain partial amounts, units and explicit dates across restart and backup. Consumed/reset markers prevent stale writes and old-copy resurrection; automatic Today follows the day. See [portion-draft continuity](docs/PORTION_DRAFT_CONTINUITY.md).

## Next priorities

1. **Coverage from real failures:** improve Norwegian product/alias coverage using observed missed queries and readable package evidence. Preserve sources, missing-nutrient states and raw/cooked distinctions.
2. **Physical restoration acceptance:** complete a controlled native restore with an exported recovery copy. Creation, Files export and review counts are owner-confirmed; desktop upgrade and rollback tests do not establish iOS Files restoration.
3. **Physical interruption acceptance:** verify incoming calls, camera release, permission denial/recovery and airplane-mode reconnect on the owner's iPhone. Browser/native-port contracts and observed software failures are covered; actual OS transitions remain pending.
4. **Physical accessibility acceptance:** check actual iPhone VoiceOver reading/focus order, Dynamic Type, numeric Done and keyboard avoidance against the browser-verified layouts. Do not infer these results from automation.
5. **Release preparation when requested:** standalone signing, installation/update instructions and store preparation follow a nearly finished app and completed device validation. Standalone builds are currently postponed.

The [iPhone checklist](docs/IPHONE_TESTING.md) distinguishes owner-confirmed behavior, browser checks and tests using fake native ports. Do not equate those forms of evidence.

Contributions must preserve offline core functionality, privacy, verified nutrition and one-action logging. Optional cloud synchronization or new remote services require a separate design discussion.
