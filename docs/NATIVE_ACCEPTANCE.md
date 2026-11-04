# Native acceptance checklist — not yet executed

Record the date, Xcode version, iOS version, simulator/device model and actual outcome for each run. Keep failures visible rather than checking boxes based on source inspection.

## Foundation and food loop

- [ ] Generate `ToucheGrasse.xcodeproj`; compile app and package with no unresolved diagnostics.
- [ ] Run all 27 package tests; record logs and performance diagnostic without calling it an iPhone benchmark.
- [ ] Run UI food-loop test on an installed iPhone simulator.
- [ ] Fresh launch imports 2,121 source foods; second launch retains user records without reimport overwrite.
- [ ] Search `olivenolje`, `olive oil`, `kylling`, a deliberate typo and an unrelated multiword query. Inspect relevance and full latency.
- [ ] Save a food to library, choose 10 g, log, inspect totals, repeat once, undo once, confirm counts.
- [ ] Parse `200g kylling, 100g pasta, 15,5g pesto, 10g olivenolje`; each food remains unresolved until selected.
- [ ] Correct 200→250 and replace a food match. Other quantities and units remain intact.
- [ ] Close Quick Entry, change tabs, relaunch. Draft text and structured entries survive.
- [ ] Invalid amount, unsupported ml↔g and unresolved line prevent commit; unknown nutrient remains a dash, never zero.
- [ ] Force quit after a completed commit; retry cannot insert the same draft IDs twice.
- [ ] Airplane mode: search bundled data, save, log, repeat, restart successfully.
- [ ] Source-food edits do not change existing log snapshots or repeat nutrition.
- [ ] Previous dates show only their calendar interval, including DST transitions; repeat explicitly logs to today.

## Recipes and backup

- [ ] Save recipe from draft, reopen, edit quantities/steps/servings, save, reopen, duplicate independently.
- [ ] Per-serving math is correct; final cooked weight does not change batch energy.
- [ ] Export with an active draft, restore into a separate test database, compare exact records and unknown values.
- [ ] Restore same backup twice; no duplicate historical IDs.
- [ ] Active draft survives a restore; empty draft receives the backed-up draft and the UI displays it.
- [ ] Corrupt/unsupported/oversized backup fails without partial writes.
- [ ] Database version >1 is refused without resetting the database.
- [ ] Simulate failed migration or disk write; existing data remains available and an honest error appears.

## Product and accessibility

- [ ] Capture genuine Today, Search, Quick Entry and Recipe screenshots from the simulator.
- [ ] Test at smallest supported iPhone size and largest Dynamic Type accessibility setting.
- [ ] Check VoiceOver reading/action order, repeated button labels, numeric fields and errors.
- [ ] Review low vision/increased contrast, keyboard obstruction, sheet cancellation and control targets.
- [ ] Confirm no entry-blocking animation, nutritional guilt/reward mechanic, or hidden network request.
- [ ] Run the common workflow repeatedly on a physical iPhone and measure interaction count/time.

Milestones remain unverified until these results are recorded. Synthetic OCR inputs are future parser fixtures, not evidence of scanning support.
