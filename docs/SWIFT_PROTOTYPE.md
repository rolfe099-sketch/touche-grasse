Historical guide for the original Swift prototype (22 October 2026). For the active Expo application, see the [current README](../README.md).

# Touche Grasse

Norwegian-first native food logging. A deliberate first vertical slice: find a real food, choose a quantity, save it locally, log it, see the day's totals, and repeat an entry.

**This project was prepared on Windows on 22 October 2026. The iOS application has NOT been compiled, run, simulator-tested, or tested on an iPhone.** The Swift sources and native target configuration exist; Windows verification covers source data, SQL, contrast calculations and syntax only. See [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) for the evidence boundary.

## What is here

- `ToucheGrasse/`: SwiftUI Today, local Search, Recipes, Quick Entry, manual food review, and user-controlled backup screens.
- `Packages/ToucheGrasseCore/`: Foundation domain, Decimal nutrition arithmetic, strict quantities and unit conversions, SQLite actor repository, FTS5 search, transactional logging, immutable log snapshots, draft persistence, recipes, backup merge.
- `project.yml`: XcodeGen iOS app and UI test targets, local package linkage and shared scheme.
- `Fixtures/`: actual captured official API responses, SHA-256 manifest, clearly labeled future OCR and recipe acceptance inputs.
- `scripts/`: reproducible catalog conversion, Windows verification, optional Swift syntax check, macOS native validation script.
- `verification/`: actual Windows results. No fabricated screenshots or native test reports.
- Original product requests remain in the private working folder and are not part of this public release.

## First native build on macOS

Requirements: macOS supported by your Xcode installation, Xcode 16 or later with an iOS simulator runtime, Command Line Tools pointed at that Xcode, Python 3, and XcodeGen 2.44 or later. The source package uses Swift tools 5.9 and Swift 5 language mode. Deployment target is **iOS 17.0**, iPhone portrait. No runtime third-party libraries or remote Swift package downloads are needed. XcodeGen is a development tool only.

```bash
xcode-select -p
xcodebuild -version
brew install xcodegen
swift test --package-path Packages/ToucheGrasseCore
xcodegen generate --spec project.yml
open ToucheGrasse.xcodeproj
```

Select the **ToucheGrasse** scheme and an installed iPhone simulator. Run with Command-R; run tests with Command-U. The scheme includes the package tests and UI test. For a connected physical phone, choose your own signing team and a unique bundle identifier; no team ID or credentials are invented here.

For command-line validation:

```bash
bash scripts/verify-macos.sh
# Or choose a specific installed simulator:
SIMULATOR_ID=<actual-UDID-from-simctl> bash scripts/verify-macos.sh
```

The script runs package tests, generates the project, executes simulator tests, installs and launches the app, and prints the genuine screenshot command. It stops on a build/test failure. Inspect and fix any first-build diagnostics before treating this milestone as validated. The script itself has not been run on macOS.

## Try the food loop

1. Open **I dag → Legg til mat**.
2. Search `olivenolje` and choose **Olivenolje** from Matvaretabellen.
3. Change `100` to `10`; check the displayed quantity and unit.
4. Tap **Logg 1 matvare i dag**. Logging also saves that source food to your personal library.
5. Review the totals. Tap the plus next to the entry to repeat it immediately; **Angre** removes the last batch/repeat.
6. Close and relaunch. Entries and saved foods should remain. Repeat the workflow in airplane mode; this slice uses no in-app network requests.

Alternatively type `200g kylling, 100g pasta, 15,5g pesto, 10g olivenolje`, tap **Del opp i matvarer**, and select a specific food for each line. Raw/cooked and brand ambiguities are never silently resolved. Changing a match keeps the entered amount and unit. Unresolved or invalid lines disable logging. Unparsed text must be resolved or cleared before committing. Household measures require a food-specific conversion; the bundled catalog deliberately does not invent those conversions.

Search results can also be saved with the bookmark action before logging. **Mitt bibliotek** filters to saved foods. Manual foods require an explicit confirmation and retain unknown nutrients as unknown. Manual barcodes can be cached locally; camera scanning and remote barcode lookup are not implemented.

For the recipe foundation, assemble ingredients in Quick Entry, choose **Lagre som oppskrift**, name it, set servings and steps, then save. Reopen from **Oppskrifter** to edit quantities or duplicate. Recipe portion logging and full recipe management belong to Milestone 2.

## Windows checks

```powershell
python scripts/prepare_catalog.py
python scripts/verify_foundation.py
# Optional syntax-only check:
python -m pip install --target .verification-tools tree-sitter==0.25.2 tree-sitter-swift==0.7.4
python scripts/check_swift_syntax.py
```

These commands do **not** build Swift, execute XCTest, or prove iOS behavior. Captured raw API files are kept to make normalization reproducible without network access. The app bundles the much smaller normalized catalog, not the raw responses. Refreshes should explicitly update capture date and manifest after verifying the source schema; there is no silent catalog updater.

## Data and attribution

The app database is `Application Support/ToucheGrasse/library.sqlite`, with SQLite WAL sidecars. Do not copy only the database file while it is open. Use **Data og personvern → Eksporter sikkerhetskopi** for a consistent JSON export; restore merges validated records in a single transaction. Existing historical log IDs are preserved. Exported files contain personal food history and are not encrypted by the app. iOS sandbox and platform protection apply to local app storage. Optional iOS device backup is governed by the owner's OS settings; the app has no cloud backend.

Food values are from **Matvaretabellen, Mattilsynet**, captured 22 October 2026. Official Norwegian and English names are joined by source ID. The [official API documentation](https://www.matvaretabellen.no/api/) permits caching and requests source attribution; attribution is visible in search, entry and data settings. Each food retains its original URL, ID and individual nutrient source IDs. Values refer to edible food per 100 g. Product-specific food data still needs explicit review.

No analytics SDK, account, subscription, remote audio, camera permission, or microphone permission is present in this initial slice. Local search diagnostics are bounded to 100 events and can be deleted. See [ARCHITECTURE.md](../ARCHITECTURE.md), [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md), and [DECISIONS.md](../DECISIONS.md).

