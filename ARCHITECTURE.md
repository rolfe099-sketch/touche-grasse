> Historical implementation notes. For the active Expo application, start with the [project README](README.md) and [development guide](docs/DEVELOPMENT.md).

# Architecture

## Boundaries

`SwiftUI screens → @MainActor AppModel → LibraryStore actor → SQLite`

`Food / Ingredient / Recipe / LogEntry / EntryDraft` are Foundation value types in a local Swift package. They have no SwiftUI, UIKit, Vision, Speech, networking, or account dependency. The portable contract is quantities + units + a normalized nutritional reference + provenance + snapshot values. A future Android implementation can share JSON fixtures and arithmetic requirements; it cannot execute Swift directly without a separate portability decision.

AppModel owns user-visible state, orders draft writes, prevents concurrent submissions, and refreshes observable lists after persistence succeeds. Database work executes within the repository actor rather than doing queries in view bodies. Food search uses cancellable SwiftUI tasks and discards canceled responses. Search does not call a remote service.

## Nutrition invariants

- Use `Decimal` through domain calculations and serialization. Do not round intermediate values. Format only at the UI boundary.
- Reference nutrients are per 100 g or per 100 ml, explicitly typed.
- `nil` is unknown, not zero. If any ingredient lacks a particular nutrient, that nutrient's total is unknown. Other independently known totals remain visible.
- Reject nonpositive, nonfinite, malformed, or excessively large quantities. Strict parsing supports decimal commas and points, not grouping or scientific notation.
- kg→g and l→ml are dimension-preserving. Mass↔volume needs food-specific density. Teaspoons, tablespoons and pieces need a food-specific grams-per-measure entry. No universal oil absorption or density rule.
- Recipes sum ingredients; per-serving divides by declared servings. A cooked-weight portion requires declared final batch weight. Changing cooked weight never changes total nutrients.
- Food preparation state remains explicit in the source name (e.g. raw/dry/cooked); this slice has no inferred preparation-state conversion.

## Persistence and migrations

SQLite is accessed through a small C wrapper with bound parameters, explicit statement finalization, WAL, FULL synchronous durability, busy timeout and actor ownership. Avoiding GRDB keeps initial dependencies at zero; the wrapper is intentionally narrow. A future growth in schema/query complexity is a reason to reassess GRDB, not to expand an ad hoc ORM.

The exact SQL migration is a SwiftPM resource and is also executed by Windows tests. `PRAGMA user_version=1` is written inside the same initial migration transaction. Existing newer versions fail closed, with no reset or deletion. No destructive fallback exists. Migration tests on Apple SQLite remain required. Future migrations must be additive, versioned, transactional and tested from each supported prior version. Perform backup/restore drills before shipping any destructive migration.

Tables:

| Table | Responsibility |
|---|---|
| `foods` | Source/user records, saved-library flag, optional unique barcode, JSON payload |
| `food_search` | FTS5 normalized names/aliases/barcode, maintained by insert/update/delete triggers |
| `logs` | Unique entry ID, food ID, timestamp, immutable ingredient + nutrient snapshot |
| `recipes` | Version-1 recipe payload, including ingredient snapshots and exact quantities |
| `draft` | Singleton resumable Quick Entry text and structured rows |
| `search_events` | Local bounded failure/correction observations; excluded from export |

Catalog import is transactional and only seeds when no Matvaretabellen rows exist. It never replaces saved records at launch. Refresh/version reconciliation is not implemented. Raw API responses and their hashes are retained as evidence; only normalized foods are app resources.

Batch commit validates all lines first, then saves foods, inserts snapshots and removes the draft in one transaction. Draft line UUIDs are log IDs: retrying the same batch is idempotent. An intentional repeat gets a new UUID and copies the original ingredient snapshot, preserving original quantities and nutrition even after a food edit. Undo deletes the most recent action's log IDs; it does not erase library records. Undo history is session-only.

## Search

Search normalizes case, diacritics, Norwegian `æ`/`ø`, and punctuation. The initial index contains 2,121 real foods with Norwegian and English names. FTS uses quoted token prefixes joined with AND and bound arguments. Query length/term count are capped. An empty query prioritizes saved/recent records. Exact names/aliases receive an additional ranking boost within saved/source tiers.

If FTS returns nothing, a conservative local fallback requires every query term to match a word prefix, a bounded spelling edit, selected plural variation, or a joined compound. This is an initial heuristic, not a complete Norwegian morphological analyzer. It can still produce imperfect results and needs real query fixtures. Broad source category keywords are deliberately excluded to avoid unrelated-food matches. Brand and barcode text are supported by the storage model; remote branded catalog search is pending.

Full fallback currently scans stored payloads. It needs native timing before claiming the 100 ms target. Windows FTS timing measures only an isolated SQL query and excludes decoding, ranking, actor scheduling, rendering and device overhead.

## Backup and restoration

Versioned JSON archive: saved foods, log snapshots, recipes, and current entry draft. Excludes reproducible source catalog and search diagnostics. Export uses a read-consistent transaction. Restore validates schema version, food data, recalculated log snapshots and recipes, then merges atomically. Duplicate log IDs are ignored; existing food/recipe IDs may update after the user confirms restoration. An active draft takes precedence over the backup's draft. The UI reloads a restored draft into memory. Maximum accepted archive size is 50 MB. Files are plaintext and user-controlled.

JSON decimals are numbers as encoded by Swift `Decimal`; external consumers should use decimal-aware JSON decoding. Cross-language round-trip contract tests remain pending. Large export/import encoding and file IO should be profiled and moved off the main actor where needed before handling large libraries. This is an initial backup path, not a verified disaster-recovery guarantee.

## Future integrations

No inert fake camera, speech, or provider adapters are exposed. Add them as separate boundaries that produce **reviewable drafts**, never direct database writes:

- Matvaretabellen refresh: explicit user-triggered import with schema checks and provenance/version reconciliation.
- Open Food Facts: cache-first barcode request, client identification, throttling, source separation, missing-value handling, explicit community-data review. Licensing and current API findings are in `docs/INTEGRATIONS.md`.
- Vision label OCR: extracted field candidates with confidence, bounding boxes, original text and column/basis metadata. User correction/confirmation precedes Food creation.
- Speech: bounded foreground session that produces deterministic command intents. Validate against the active recipe/draft before mutation. Support cancellation, denial, interruptions and on-device availability. No network audio fallback without consent.

The first source revision intentionally stops at Milestone 0 and the first food loop, with a modest recipe foundation. It does not pretend to implement scanning, speech, full recipes, targets or body measurements.
