# Logging dates and meals

Quick Log keeps its destination inline: Today, Yesterday, Choose date and the selected meal. Choose date expands the existing calendar within Quick Log, with an optional YYYY-MM-DD field for older dates. Meal choices expand inline and close after selection. No extra review or confirmation is required for a resolved meal.

Today’s type, voice and scan controls carry the day being viewed. History’s central Log button and “Log food for this day” carry the selected historical day. Logging a past meal returns to that day in History; today’s meals return to Today. An unfinished draft with another date requires an explicit Use date or Keep draft date decision. Opening a different day never silently moves its ingredients. Existing meal edits retain their original historical destination.

## Commands

- `Add 200g chicken to yesterday’s dinner` adds an ingredient for review, with yesterday and Dinner selected. It does not log food as eaten, and generic chicken still needs a verified product choice.
- `Log this for yesterday` logs a resolved draft on that date.
- `Set meal to breakfast then log this` validates the entire sequence before committing.
- `Set date to 2026-11-01` changes only the destination.
- `Log my oats for yesterday` or `Log 1 serving of My batch for yesterday` uses the same destination for a saved meal or portion.
- `Same breakfast as yesterday` retains its previous meaning: yesterday is the source of a repeat, not its destination.

All five quantity fields in the existing ambiguous five-ingredient review remain visible without scrolling at 390 × 844. The destination stays visible beside the logging totals.

The same suffixes work in typed ingredient input. Supported dates are Today, Yesterday and unambiguous YYYY-MM-DD dates between 1900 and 2200. Invalid or future dates are rejected. Natural weekday names and ambiguous numeric dates are not inferred.

## Persistence and accuracy

A draft retains its literal local calendar date across reopening and midnight. New meals default to Today. The last selected or confirmed meal is remembered, while an existing unfinished meal retains its own selection. Adjusted repeats retain their own date, quantities and optional meal override independently of the ordinary ingredient draft.

Calendar dates use local construction rather than UTC date-string parsing. Backdated entries use local noon as a storage anchor and explicitly retain day-only precision. The diary and entry header omit an unknown clock time; an optional time can be supplied in the existing correction form. Old entries retain their original timestamps and precision. Match confirmations and correction audit dates record the actual action time.

Every ingredient in a meal is committed together with its destination, confirmed matches and single Undo action. A rejected transaction changes neither the diary nor the voice acknowledgement. Saved portions retain global finite capacity across all dates, and repeats calculate from the original verified snapshots. Saving a batch still does not log it as eaten.

The new fields are optional in version 2 backups. Existing archives, foods, recipes, historical nutrition snapshots and retained drafts remain readable. Restore uses the current local meal preference when present and otherwise recovers the backed-up preference.

## Verification

All 343 domain and storage tests pass. Domain and real SQLite/IndexedDB regression coverage includes local calendar validation, daylight saving boundaries, typed/spoken destinations, atomic multi-command failures, date/meal persistence, snapshot-preserving repeats, finite portions, correction precision and failed storage transactions.

Browser scenarios in `apps/mobile/e2e/log-destinations.spec.ts` exercise the actual app at 390 × 844: Today and Yesterday logging, remembered meals, History context, draft conflicts and reopening, custom dates, adjusted repeats and speech-adapter command submission. Screenshots and interaction counts are written under `verification/log-destinations` and included in CI browser artifacts. All affected Chromium scenarios pass, including the unchanged five-ingredient relevance/visibility test and separate-draft regression tests. Speech injection verifies the application workflow, not acoustic recognition.

Counting one tap or completed text entry as one interaction, with autofocus and a fully resolved meal:

| Flow | Before | After |
| --- | --- | --- |
| Ordinary meal from Today | 3 | 3: Log, enter meal, Log food |
| Yesterday from Today | Not available in Quick Log | 4: add one Yesterday tap |
| New explicit meal selection | 5 | 5 on first selection; 3 subsequently |
| Already selected History day | Quick Log defaulted to Today | 3; no extra date interaction |

These are automated workflow counts, not human completion-time measurements. Ambiguous products still require a choice. Selecting another date requires opening the calendar and selecting a day, or entering and applying a date. Safeguarding a conflicting unfinished draft costs one explicit decision.

## Remaining device check

On the existing iPhone development app, reload, open Log, add `10g olive oil`, choose Yesterday and Breakfast, then log once. Verify yesterday’s History shows 89 kcal and 9.9 g fat, Today is unchanged and Undo removes the entire new meal. Open another new meal and check that Today and Breakfast are selected. This physical-device check is pending; no standalone build is required.

Full native backup restoration, VoiceOver and large Dynamic Type remain separate pending checks in [iPhone testing](IPHONE_TESTING.md).
