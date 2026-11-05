# Voice and label recovery

This pass improves the existing development app. It does not introduce another native build or a cloud speech/OCR provider.

## Nutrition labels

A new photo is staged alongside the unfinished label instead of replacing its values. For the same units and preparation, **Use photo · keep corrections** fills missing fields and retains every existing reading, explicit zero, manual correction and deliberately blank field. A conflicting reading remains available as a per-field **Use photo** action. Nothing is eaten when a label is saved.

Different gram/millilitre or prepared/unprepared columns require an explicit **Replace values** action. This replaces the nutrition fields; a unit change also clears the amount to add. The app does not infer density, preparation yield or absorbed fat. **Keep current values** dismisses a failed or unwanted rescan. Saving remains blocked until the pending photo has been reviewed or dismissed.

Pending scan text, evidence, corrections and intentionally unknown values survive ordinary reopening, export and recovery. Photos are not included in diary backups. Preserved values that differ from the newly selected OCR column are saved as user-confirmed label values; the selected column's original nutrition remains in provenance. Previous historical food snapshots are unchanged. Failed draft writes offer an explicit retry.

## Commands

Web Speech results are accumulated across the entire utterance and committed once when recognition ends with final results. Interim text, cancellation and recognition errors never execute a command automatically. The native speech adapter continues to use the platform's final transcript, with its existing permission and cancellation guards.

Commands can include explicit sequences, for example:

> I'm making chicken pasta. Six servings. Add 200g chicken and 150g dry pasta. Change chicken to 250g. Final cooked weight 1.2kg.

Each clause is validated in memory before any draft change is persisted. Ambiguous corrections or invalid later clauses reject the entire sequence. Logging or opening a recipe must be last. Repeating another saved meal cannot be mixed with draft changes. An explicit log command still requires verified products, valid units and a resolved meal; a split batch is saved before servings are logged. This is deterministic command parsing, not unrestricted conversational understanding.

Polite action requests such as **Can you add 15 grams of oil?**, **Could you please change oil to 20 grams?** and **Please split into six servings** use the same command path. Courtesy is removed only before a supported action; information questions and negated requests are rejected without changing the meal. Generic **oil** still requires a verified product choice unless that exact query has previously been confirmed.

Unfinished transcript text and the chosen EN/NO recognition language are retained separately from ingredient rows. **Continue voice command** opens the retained text for explicit Apply. Saving a command and acknowledging its transcript happen in the same transaction, including log/repeat/shortcut/portion actions. A failed transaction keeps the text; a repeated callback cannot apply the acknowledged command twice. Undo retains its normal whole-action behavior.

## Verification boundaries

- Shared SQLite and IndexedDB tests cover interruption, export/restore, corrected labels, failed writes, retries, stale results, duplicate commands and finite portions.
- Browser tests at iPhone dimensions exercise cumulative transcripts, explicit recovery, a failed food transaction, multi-command validation and a real local Tesseract rescan of a synthetic nutrition-label image.
- Browser speech fixtures verify the adapter/application boundary, not microphone accuracy. Synthetic image OCR does not establish accuracy across real Norwegian packaging.
- On 5 November 2026, the owner's iPhone 13 Pro screenshot confirmed an add/change/split voice sequence produced 15 g olive oil, six servings and the correct per-serving preview. The owner subsequently confirmed batch saving, logging one serving with five remaining, and Undo restoring six. This verifies that sequence on the device; recipe naming, spoken measured weight and invalid later clauses remain unverified physically.
- The owner also confirmed the lock-mid-command interruption check on iPhone 13 Pro: recording stops, captured text remains available and nothing is logged as eaten. Phone-call interruption, reload after interrupted capture, the newly added polite-request grammar, a corrected label followed by another photo, large-text/VoiceOver use and a feature-rich recovery restore remain physical checks. These require the existing iPhone development app; no standalone build is needed.
