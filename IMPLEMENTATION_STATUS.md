# Implementation status — 22 October 2026

**Milestone 0 and Milestone 1 are not marked complete.** Native sources and the first workflow are prepared, but Xcode build, native tests, simulator interaction and physical-iPhone validation remain outstanding.

## Implemented and verified in the available environment

| Item | Actual evidence |
|---|---|
| Environment audit | Windows NT 10.0.26200; Python 3.10.5; Node 24.12.0; Git available; Swift, Xcode, XcodeGen unavailable; WSL listing returned access denied |
| Real food source capture | Public Matvaretabellen nb/en foods + nb nutrients fetched successfully; original files and SHA-256 manifest retained |
| Deterministic catalog conversion | 2,121 foods; 1,436,835-byte normalized app resource; every imported macro/calorie value checked against raw source, including nulls |
| Actual schema SQL | Executed in SQLite 3.37.2 on Windows; schema, FTS triggers, transaction rollback, disk reopen, historical-payload isolation and barcode uniqueness passed |
| Foundation checks | 13/13 Python checks passed, including failed-migration rollback; `verification/windows-checks.txt` |
| Swift syntax | 16 Swift files parsed with tree-sitter; zero syntax errors; `verification/swift-syntax.json` — NOT compiler/type validation |
| Color tokens | Exact six brand colors checked; six semantic text/background pairs exceed 4.5:1; `verification/contrast.json` |
| Project configuration | YAML parse and referenced source paths checked; XcodeGen itself has NOT run |
| Isolated FTS diagnostic | 100 Windows in-memory SQL samples, measured on 2,121 foods; see `verification/windows-fts-benchmark.json`; not an app/device latency measurement |

The first attempt to fetch official JSON inside the sandbox failed DNS resolution. The subsequent approved network read succeeded. Optional syntax tooling's first requested package version was unavailable; the installed parser versions are tree-sitter 0.25.2 and tree-sitter-swift 0.7.4. No successful iOS test execution is inferred from these tooling checks.

## Implemented in source, not natively verified

- SwiftPM core package and XcodeGen SwiftUI iPhone app/test configuration; deployment target iOS 17.
- Exact brand/semantic tokens, dynamic typography, compact nutrition strip, SF Symbols, accessibility labels/touch targets, confirmation/undo and light native haptic.
- Native Today, local Search, Recipes and Quick Entry navigation with real repository calls.
- Typed quantities, optional nutrients, Decimal scaling, mass/volume conversion validation, recipe totals/per-serving/cooked-weight calculations.
- SQLite actor repository, migration version guard, FTS index, saved foods, unique barcode cache, persistent recipes and draft, immutable log snapshots.
- Deterministic structured text parsing; explicit match selection; inline quantity corrections; saved food lookup; Norwegian/English search and conservative fallback.
- Atomic/idempotent draft logging, repeat with new identity, daily/previous-date review, session undo.
- Manual food creation with explicit confirmation and nullable values, optional manual barcode, per-100-g/ml basis.
- Recipe creation from current ingredients, editing quantities/instructions/servings/final weight, independent duplication. This is a foundation, not Milestone 2 completion.
- Versioned export/merge restoration UI and repository path; bounded/deletable local search diagnostics.
- **27 XCTest methods** in domain/repository test sources, plus **1 XCUITest** for real-food lookup → log → repeat → relaunch. Native results: **NOT RUN**.

## Planned, not implemented

- In-app source refresh/reconciliation and expanded search morphology, brand aliases, nickname editing and favorites distinct from saved-library state.
- Full recipe metadata, photos, preparation/cook times, ingredient additions/removal/substitutions, saved meals, recipe portion logging and recipe recency.
- Open Food Facts API integration, barcode camera capture, real product API fixtures, Vision OCR, uncertain-field/column review and OCR provenance.
- Voice recognition, intent grammar, correction dialogue, cooking steps read aloud, cooking timers and voice-assisted ingredient changes.
- Nutritional targets, weight/waist entry and trends, editing/deleting arbitrary historical log entries, logging directly to a selected past date.
- Full UI localization beyond Norwegian, separately designed dark mode, production app icon and storefront identity.
- Cloud sync, accounts and Android are not current implementation scope.

## Blocked by missing Apple tooling/hardware

1. Generate the project and resolve compiler/type/concurrency/linker diagnostics.
2. Run all 27 domain/repository tests on native SQLite and the simulator food-loop test.
3. Launch the actual app and inspect screenshots at normal and accessibility text sizes; test VoiceOver, Reduce Motion, keyboard/sheet behavior, contrast states and safe areas.
4. Verify repeated logging, force-quit/relaunch, failed disk writes, canceled edits, backup/restore, airplane mode and migration failure on device.
5. Measure full search latency (including fallback), app launch/import, 1–2 interaction repeat flow and recipe timing on a supported iPhone. None of the product speed targets is currently claimed achieved.
6. In later milestones, validate camera, Vision, Norwegian speech support, permissions, interruptions and audio routing on physical hardware.

There are **no simulator screenshots** because no supported iOS simulator ran. No iPhone validation has occurred.

## Most valuable next step

Run `bash scripts/verify-macos.sh` on a Mac with Xcode. Fix all native failures and complete `docs/NATIVE_ACCEPTANCE.md` before expanding the feature surface. Then complete Milestone 2 around recipe portion logging and the owner-supplied pesto chicken acceptance fixture. Keep its unresolved stock/seasonings and nutritional inputs explicit.
