# Meal editing and optional weight tracking

## Ingredient corrections

- Library shortcuts have **Edit foods**. Shortcut amount reviews also offer **Edit foods**, carrying the adjusted amounts into the ingredient editor.
- Expand a multi-food journal meal and choose **Edit ingredients**, or open a single logged entry and choose **Edit ingredients**. History also offers ingredient editing for a selected meal label.
- The existing Quick Log route hosts this editor. Replace a verified product, change an amount or unit, add a food, or remove a row. Other amounts stay unchanged. A missing conversion blocks saving; changing foods never assumes density, cooking yield or absorbed oil.
- Recipe ingredient fields are explicitly for the **whole recipe**, with its serving count and measured final weight shown. The entered portion scales from that recipe. The editor does not flatten one-sixth quantities into rounded ingredient weights.
- Correcting an eaten saved portion keeps the original recipe as its inventory reference. The corrected portion keeps its original serving/weight basis, and remaining portions retain the original batch ingredients and nutrition. Extra foods can be separate rows in the corrected meal.
- Ordinary Quick Log drafts, amount-repeat reviews and ingredient-edit drafts remain separate. Only one adjusted/edit review is active at a time. Input text, including an incomplete quantity, survives reopening and backup restoration.

Saving a shortcut changes future logs only. Saving a logged meal is one atomic correction: existing IDs keep a previous-version record, added entries receive new IDs, and a whole-meal audit retains removed entries as well. **Undo meal correction** restores the original meal and finite portion inventory. New diary actions replace the single Undo slot; a later direct correction invalidates a stale whole-meal Undo rather than overwriting newer work. The audit remains available in daily History and Today.

Unchanged rows retain their exact stored snapshot and nutrition, including absent legacy fiber fields. Failed writes do not publish partial corrections. A meal changed elsewhere while its editor is open must be reopened before saving. Older backups cannot silently resurrect ingredients removed by a local meal correction.

## Weigh-ins and weekly summaries

History now has **Intake** and **Weight** views, retaining Day, Week, Month and Lifetime exploration. Today also links to weight entry. Weight tracking is optional and never changes food targets or nutrition.

- Record a dated measurement in kilograms or pounds. Pounds convert using the defined factor of 0.45359237 kg per pound and decimal arithmetic.
- One active measurement is stored per calendar date. Editing retains prior values. Deletion is reversible under **Deleted**, and an old backup cannot replace a newer local measurement or undo its deletion.
- The seven-day mean includes recorded days only and needs at least two observations. Its change compares adjacent seven-day windows, with observation counts shown. Missing measurements are not estimated.
- The chart plots actual observations; lines stop across missing calendar days. Lifetime charts show the latest 90 measurements within the period, and the dated list can reveal older measurements. No BMI, inferred energy balance, target weight or weight-change prediction is generated.
- Weight entry drafts survive interruption and reopening; cancelled drafts stay cancelled when an older copy is merged. A successful save clears the corresponding draft.
- Intake's weekly summary compares calories, protein and fiber only after each week has at least three explicitly complete days. Counts and unknown nutrients stay visible; partially logged days are excluded.

## Persistence and verification

Version-2 backups have optional `weighIns` and `mealCorrections` arrays and retain new review drafts in Quick Entry preferences. Native and browser storage use the existing generic record tables; no destructive migration is required. Settings and recovery previews include the new record counts. Local measurement dates, correction audits and unfinished edits take precedence during recovery merges.

Tests cover real SQLite and IndexedDB, replacement/add/remove, untouched quantities and legacy fields, persistent correction Undo, finite portions, failed writes, stale editors, kg/lb conversion, sparse windows, deletion tombstones, and restoring a feature-rich archive into an isolated browser context. Browser fixtures use verified catalog nutrition and synthetic diaries, never the owner's diary. Screenshots and reports are written under the ignored `verification/meal-editing-weight` directory.

Physical iPhone acceptance remains separate: number-pad dismissal, VoiceOver/large text, interruption while editing, and native restoration of a backup containing these features. The existing microphone/camera cancellation, permission, actual local OCR and offline-entry regression tests remain required; a browser pass does not establish fresh-photo accuracy on every package. No standalone iPhone build or new native dependency is part of this milestone.
