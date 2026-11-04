# Universal Quick Entry

Open **Log food** and enter a whole meal. Ingredients parse and match immediately in the same screen. Previously confirmed query matches are preselected and visibly editable. Choose products only for unresolved rows, then tap **Log**. There is no Review action.

## Domain and persistence

`src/domain/model.ts` defines the explicit-unit parser and decimal nutrition rules. Commas, semicolons and newlines separate ingredients; decimal commas stay inside quantities. Missing amounts and unsupported input remain visible for correction. No nutrition or food conversion is guessed.

`src/domain/quickEntry.ts` owns text and structured ingredient ingress, product matching, live text reconciliation and usual-meal ranking. The optional `Draft.textRows` field links raw source occurrences to their editable rows. Exact occurrence matches are reconciled first, then quantity changes and renamed rows. Quantities and resolved products survive unrelated typing and reordering. Renaming a query invalidates its old product. Quantity/unit edits and row deletion update the input text. Manual additions remain independent.

Only remembered normalized queries or unique complete database names/aliases auto-resolve. Favorites, historical use and saved products rank suggestions. Fuzzy or broad ambiguous results require a product choice. Last confirmed product corrections are remembered when the complete meal is successfully logged. Cancelled drafts and failed commits do not teach matches.

`Repository.logDraft` checks live source synchronization and validates every ingredient before one atomic write containing verified food snapshots, all log entries, learned matches, cleared draft and whole-batch undo. Undo removes the complete most recent logging action while retaining product preferences. Historical nutrition stays tied to its snapshots. Live metadata, confirmed references and favorites persist in both SQLite/IndexedDB and version-2 backup export/merge. Existing generic schema-2 records need no destructive migration; old drafts and backups remain readable.

## Interaction

Resolved rows keep quantities directly editable with select-on-focus. The Log action is fixed below the entry scroll area. Product changes, unit controls, ambiguity filters and food creation remain inline or use the existing app routes.

Today exposes up to two usual multi-food batches above its diary, ranked by frequency and then recency. One tap repeats every historical snapshot into a new batch, with one whole-batch undo. Individual repeat and complete diary-meal repeat remain available. Other application screens were not redesigned.

The `MealInput` boundary accepts text or structured ingredient proposals so future voice, barcode and recipe adapters can share resolution and validation. No new capture providers or screens were introduced.

The current compact review expands one product at a time and advances automatically. It shows verified live subtotals until every row is ready. English product labels and index vocabulary preserve all original Norwegian source records. Basic chicken cuts and plain pasta rank above dishes/offal; Parmesan is recognized as the existing Parmigiano Reggiano record. Preparation states are never supplied implicitly by a generic exact alias.

See `../../verification/quick-entry-polish/README.md` for current measurements, before/after screenshots, checks and limits; the original baseline remains under `../../verification/quick-entry/`.

## Preparation and optional portions

Generic cooking queries prefer clean raw/uncooked records. Matching excludes descriptions with unlisted cooking fat, including unsafe remembered matches; explicit cooked/product alternatives remain available. No cooking yield or absorption is inferred. See `src/domain/foodLanguage.ts` for the descriptor rules.

Quick Entry and recipes optionally expose **Split into servings**, with custom servings and a measured final cooked weight if available. Saving creates a finite batch without logging it as eaten. Cookbook's Saved portions panel logs a chosen serving/gram amount today or on an explicit date. Remaining stock derives from linked immutable recipe snapshots; undo, corrections and repeat logging share capacity checks. Source split drafts, prepared batches and linked portion logs persist on both adapters and in version-2 backups. `src/domain/portions.ts` owns inventory rules; `src/ui/Portions.tsx` is shared by all three existing routes.

Verification, exact one-sixth nutrition, screenshots and remaining limits: `../../verification/portions/README.md`.
