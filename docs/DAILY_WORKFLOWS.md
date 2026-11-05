# Daily workflows

This milestone continues the existing development app. It does not create a standalone build or publish a release.

## Named meal shortcuts

- In Quick Log, resolve the foods, then choose **Save shortcut**, enter a name and **Save to Today**. This saves the verified meal without eating it or clearing the unfinished meal. A batch must first be saved and a specific portion chosen.
- Journal meals can also be saved as shortcuts. Today pins appear immediately below nutrition, ahead of the entry composer. **Log** records the whole shortcut in one action with the normal diary Undo.
- **Adjust** opens the existing Quick Log review with editable amounts and live totals. Amounts persist separately from the ordinary unfinished meal. Logging an adjustment leaves the template unchanged; **Update saved amounts** is an explicit, optional action.
- Say **Log my breakfast**, or **Log shortcut My breakfast** for an exact saved name. A missing or ambiguous name produces an error rather than an ingredient guess. Browser tests deliver final transcripts at the speech adapter boundary; this does not prove microphone recognition accuracy.
- Library supports rename, pin/unpin, deletion and restoration under **Deleted**. Deletion tombstones persist, so an old backup cannot silently resurrect the shortcut. Names must be unique after normalization. Local shortcut changes win during merge restore; conflicting names stop the restore before any writes.
- Food and recipe nutrition are captured snapshots. Edits to Library foods never rewrite shortcut or historical snapshots. Shortcuts referencing finite prepared batches retain that link: the ordinary inventory check blocks overdraw, including concurrent queued logs. Undo returns the consumed portion.

## Complete and partial days

**Mark complete** is an explicit user assertion, available beside the diary on Today and daily History. It is never inferred from targets, entry counts or calorie thresholds. Adding, deleting, correcting or moving intake invalidates the review. Undo of a deletion/log can restore the identical reviewed intake. Reopening a day persists even when an older complete-day backup is merged.

History defaults to **Complete days** for weekly, monthly and lifetime averages. **All recorded days** remains available and warns that partial days may understate intake. Daily charts still show recorded totals with complete/partial detail. Monthly comparisons require three included days in each month and known energy values. Unknown nutrients remain unknown in averages.

An empty, unreviewed day is missing data. An explicitly completed empty day counts as zero; the control states this before completion. Completion also establishes an earlier tracking date if needed. Calendar labels distinguish complete and partial recorded days.

## Entry reliability and recovery

- Added English/Norwegian search vocabulary for fish, oats, legumes, vegetables and berries without changing source foods or nutrients. Generic oatmeal prioritizes flakes and requires product clarification because it can mean dry flakes, flour or prepared porridge. Generic chicken excludes liver paste as well as prepared dishes and added-fat records.
- Label parsing recognizes explicitly printed full unit words (grams, milligrams, millilitres, kilocalories and kilojoules). Unread or corrupt units still need explicit confirmation; ambiguous columns, weak readings and conflicts stay blocked. This broadens text parsing, not camera recognition guarantees.
- Foods and recipes can be archived in Library and restored from **Archived foods and recipes**. Archiving hides a Library listing, not the underlying food record, historical snapshot or prepared batch. Existing references remain usable. Local archive/restore decisions survive backup merges.
- Shortcuts, adjusted reviews, completion markers, archive choices and deletion tombstones are included in version-2 backups and automatic recovery copies. Old backups without these optional fields remain supported. Settings and recovery previews show shortcut and reviewed-day counts. Failed writes do not publish partial changes to the in-memory repository.

## Verification and remaining limits

Automated tests cover both SQLite and IndexedDB, exact snapshot logging, independent quantity changes, Undo, finite inventory, restart/restore, local merge precedence, failed writes and corrupt archives. Browser tests use isolated diaries at 390 × 844; see `apps/mobile/e2e/daily-workflows.spec.ts`. Generated screenshots and interaction measurements are kept in the ignored `verification/daily-workflows` directory.

Shortcut ingredient replacement, adding and removing foods are available in the subsequent [meal editing milestone](MEAL_EDITING_AND_WEIGHT.md). More than a few pinned meals naturally require scrolling; unpin lesser-used meals in Library. Archived items remain discoverable through existing references and food search. Deletion/archiving is reversible in Library rather than sharing the single diary Undo slot.

The new controls still need owner acceptance on the physical iPhone: dictating a saved shortcut name, number-pad dismissal, large text/VoiceOver and restoring a feature-rich exported backup. Broader fresh-photo label coverage, Android hardware, optional cloud sync and weight trends remain separate work. No new native build is required for these JavaScript changes.
