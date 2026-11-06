# Roadmap

The focus is fast, trustworthy logging. This list reflects implemented work and remaining checks; it is not a release promise.

## Implemented

- Live multi-ingredient Quick Log, verified English/Norwegian food matching, remembered product choices and explicit preparation ambiguity.
- Voice/text/barcode entry, retained interrupted commands, cooking sequences, recipes, finite saved portions and one-action logging with Undo.
- Label-photo OCR, crop/rotation, source comparison, explicit uncertain-unit confirmation and retained correction/rescan drafts.
- Named/pinned meal shortcuts, one-tap repeats, independent repeat amount drafts, optional targets and explicit day-completion markers.
- Whole-meal ingredient corrections, date/meal moves, retained audit history and persistent correction Undo.
- Dated weigh-ins and trends, complete-day intake summaries, versioned local recovery copies, portable export and reviewed file restore.
- Inline Today/Yesterday/calendar destinations and remembered meal choices. Destination, calendar, conflict and repeat controls now share a compact visual language. See [the current milestone](docs/LOGGING_CRAFT_AND_MEAL_CORRECTIONS.md).

- Adaptive macro grids and form rows, larger search/day targets, one-tap search clearing, descriptive nutrient groups and selected-tab semantics. See [accessibility and keyboard finish](docs/ACCESSIBILITY_AND_KEYBOARD.md); physical VoiceOver and Dynamic Type remain pending.

## Next priorities

1. **Offline and interruption finish:** validate permission denial/recovery, camera release, interrupted speech, offline confirmed-barcode reuse and interrupted editing. Browser and native-port contracts are covered; record the remaining physical results accurately.
2. **Data portability and upgrades:** keep legacy snapshots and unfinished drafts intact through schema upgrades, rejected imports and recovery. Creating/exporting recovery copies and Files review work on the owner's iPhone; full native restoration remains a separate pending check.
3. **Coverage from real failures:** improve Norwegian product/alias coverage using observed missed queries and readable package evidence. Preserve sources, missing-nutrient states and raw/cooked distinctions.
4. **Physical accessibility acceptance:** check actual iPhone VoiceOver reading/focus order, Dynamic Type, numeric Done and keyboard avoidance against the browser-verified layouts. Do not infer these results from automation.
5. **Release preparation when requested:** standalone signing, installation/update instructions and store preparation follow a nearly finished app and completed device validation. Standalone builds are currently postponed.

The [iPhone checklist](docs/IPHONE_TESTING.md) distinguishes owner-confirmed behavior, browser checks and tests using fake native ports. Do not equate those forms of evidence.

Contributions must preserve offline core functionality, privacy, verified nutrition and one-action logging. Optional cloud synchronization or new remote services require a separate design discussion.
