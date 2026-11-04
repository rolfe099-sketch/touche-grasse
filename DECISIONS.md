# Product and engineering decisions

## 2026-10-22 — initial source milestone

1. **Native iOS only.** Empty Windows workspace; Python, Node and Git available, Swift/Xcode/XcodeGen absent. WSL inventory denied access. Do not substitute a web mockup. XcodeGen declares the real app target and UI test target, while a local SwiftPM package separates domain/persistence. Project generation and build are macOS gates.

2. **iOS 17 minimum.** A deliberately modern baseline supports native navigation, sheets, `ViewThatFits` and the iOS 17 change-observation overload used in this source. This excludes devices unable to run iOS 17. No iOS 26-only speech API is used; future speech upgrades need availability checks or a separately approved deployment-target change. Validate with Xcode 16 or later, Swift tools 5.9+.

3. **Swift 5 language mode with complete concurrency diagnostics.** Use async/await and actor isolation now. Do not assume Swift 6 strict-mode conformance without a compiler run. Resolve any diagnostics on the first macOS build; a syntax parser cannot validate Sendable/isolation rules.

4. **SQLite C wrapper rather than an initial GRDB dependency.** Small actor-confined surface, bound statements, FTS5, WAL and transactions suffice for the first loop. Actual migration SQL can be exercised on Windows. Reconsider GRDB if query/migration complexity grows. This is not a general ORM.

5. **Real offline source snapshot.** Bundle 2,121 official Matvaretabellen foods, including English aliases and source IDs. Keep the raw responses for reproducibility; no guessed sample nutrition. Snapshot refresh is explicit future work. Source foods become saved-library foods through bookmarking or logging.

6. **Never auto-resolve ambiguous quick text.** The deterministic quantity parser handles structured Norwegian/English units and decimal commas. The user chooses the specific source record. No broad-language/voice support is implied by this parser.

7. **Decimal arithmetic and conservative uncertainty.** Unknown nutrients propagate, unsupported conversions fail, and raw/cooked distinctions stay visible. Recipe batch weight changes concentration only. Synthetic test values are labeled and isolated from the app catalog.

8. **Historical snapshots are immutable through food/recipe edits.** Intentional repeats copy the original snapshot. Batch retries use the same line IDs; deliberate repeat gets a fresh ID. This avoids accidental duplicate commits without blocking an intentional second serving.

9. **Retained draft and explicit manual confirmation.** Quantity edits and match corrections preserve other rows. Closing Quick Entry saves progress. Commit is disabled while rows are unresolved or unparsed text remains. Manual unknown values remain blank until the user confirms.

10. **Minimal useful recipe foundation only.** Persist real recipes assembled from the entry draft, edit ingredient amounts/steps/servings/final weight, calculate totals and duplicate. Full ingredient management, substitutions/photos/tags/times, recipe portion logging and cooking mode remain Milestone 2+ work. Do not call the complete recipe system shipped.

11. **Light-first brand fidelity.** Preserve all six specified base hex values. Use an accessible darker Ocean-family action token; do not alter the base Ocean color to make white body text work. Native lists/SF Symbols, temporary serif wordmark, no mascot or decorative dashboard. Dark mode is intentionally disabled pending independent design.

12. **Private local ownership.** No account/backend/analytics SDK. Bounded local search diagnostics have a delete action. User-controlled JSON export/merge restoration is implemented in source, with native end-to-end recovery still unverified. No health targets are guessed.

13. **Honest verification boundary.** Python tests validate actual imported data and exact SQL; tree-sitter validates syntax only. Neither executes Swift arithmetic, native persistence methods, SwiftUI, nor iOS. The native XCTest sources must run before closing Milestone 0 or 1. No simulator screenshots are generated on Windows.

14. **Brand remains provisional for distribution.** Touche Grasse is preserved. Trademark/storefront clearance, app icon, signing, release privacy review and App Store readiness are separate future requirements, not claimed outcomes.
