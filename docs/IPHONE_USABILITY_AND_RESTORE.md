# iPhone review controls and restore clarity

## Photo review

Opening **Compare with photo** shows the reading without automatically focusing a field. Tap a value to edit it. While editing, switching nutrients retains input focus and selects the next value for replacement; merely browsing nutrients leaves the keyboard closed. **Hide keyboard**, zooming, returning to All values and entering/leaving crop mode dismiss the keyboard without changing the values.

The photo viewport reserves more space for input while editing and responds to keyboard overlap. Android resized windows are not reduced twice. Larger native text scales use full-width nutrient fields and fewer controls per row. Shared button labels can wrap, and crop actions can move onto another row. Numeric keyboards retain their existing Done control.

Browser focus and selection tests exercise actual typing, zoom dimensions and a smaller viewport. An enlarged-browser-text stress test checks crop action bounds. These are not claims of native Dynamic Type, VoiceOver or OS keyboard acceptance; those still need a physical-device check.

## Backup review

The selected file's name is displayed before merge. Counts include diary entries, foods, recipes, saved batches, shortcuts, target revisions, reviewed days, weigh-ins and meal corrections. Unfinished meal, recipe, label, command, weight and adjustment drafts are also identified. Saved-batch counts are record counts; remaining portions still come from the actual batch and log snapshots.

Starting another file selection clears the previous proposal. Cancelling, choosing an unreadable file or rejecting malformed collections cannot leave an older Confirm restore action active. Recovery-copy selection follows the same rule. Invalid record-schema errors use concise English rather than exposing validation internals. No successful-restore message is shown for a rejected file, and repository validation/transactions retain their existing safeguards.

The preview describes contents; final nutrition, identity, calculation and capacity validation still happens in the repository before a restore is committed. Existing merge/recover-missing rules, historical snapshots, current drafts, correction history and duplicate protection are unchanged.

## Verification boundaries

Unit tests cover keyboard overlap, responsive layout choices, summary shapes and native file-bridge contracts. The original native backup adapter tests remain in place, with a selected-filename case added. Those mocked bridge tests do not establish real iOS Files/share-sheet execution.

Browser tests restore an isolated archive containing all record families, ordinary and specialized drafts, a consumed finite portion and correction history. They export it, restore it repeatedly and restore that export into another fresh browser context, checking exact records and drafts. Invalid/cancelled replacement selections and invalid nested records must preserve the pre-existing diary. All browser stores are isolated from the owner's app.

On 5 November 2026, the owner confirmed that choosing a previously exported copy through Files on iPhone 13 Pro opens its review with the filename and contents counts. This establishes native file selection and review.

Native photo comparison, keyboard/zoom comfort, Dynamic Type, VoiceOver and a feature-rich Files restore remain physical checks. The previously owner-confirmed crop/reread result remains recorded separately. This pass adds no native module or standalone build.
