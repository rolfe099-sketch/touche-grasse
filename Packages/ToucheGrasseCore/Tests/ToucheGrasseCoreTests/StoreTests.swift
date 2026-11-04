import XCTest
import Foundation
@testable import ToucheGrasseCore

final class StoreTests: XCTestCase {
    private func file() -> String { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".sqlite").path }
    private func testFood() -> Food {
        Food(id: "test:food", name: "Testpesto", aliases: ["basil sauce"], barcode: "1234567890123",
             nutrition: Nutrition(kcal: 400, protein: 4, carbohydrate: 8, fat: 40),
             provenance: Provenance(source: .manual, sourceID: "test", retrievedAt: "2026-10-22"))
    }
    func testCoreLoopReopenRepeatAndSnapshot() async throws {
        let path = file()
        let store = try LibraryStore(path: path)
        try await store.importCatalogIfNeeded()
        let results = try await store.search("olivenolje")
        let oil = try XCTUnwrap(results.first?.food)
        try await store.saveFood(oil)
        var draft = EntryDraft()
        draft.lines = [DraftLine(query: oil.name, quantityText: "10", food: oil)]
        try await store.saveDraft(draft)
        let entries = try await store.commit(draft)
        let reopened = try LibraryStore(path: path)
        let saved = try await reopened.search("olivenolje", savedOnly: true)
        XCTAssertEqual(saved.first?.id, oil.id)
        var changed = oil; changed.nutrition.kcal = 1
        try await reopened.saveFood(changed)
        let repeated = try await reopened.repeatEntry(entries[0])
        XCTAssertEqual(repeated.nutrition, entries[0].nutrition)
        XCTAssertNotEqual(repeated.id, entries[0].id)
        let recent = try await reopened.recentLogs()
        XCTAssertEqual(recent.count, 2)
        XCTAssertEqual(recent[0].ingredient.food.nutrition, oil.nutrition)
    }
    func testCommitRetryIsIdempotent() async throws {
        let store = try LibraryStore(path: file())
        var draft = EntryDraft(); draft.lines = [DraftLine(query: "pesto", food: testFood())]
        _ = try await store.commit(draft); _ = try await store.commit(draft)
        let logs = try await store.recentLogs()
        XCTAssertEqual(logs.count, 1)
    }
    func testInvalidBatchDoesNotPartiallyLogOrEraseDraft() async throws {
        let store = try LibraryStore(path: file())
        var draft = EntryDraft(); draft.lines = [DraftLine(query: "pesto", food: testFood()), DraftLine(query: "unresolved")]
        try await store.saveDraft(draft)
        do { _ = try await store.commit(draft); XCTFail("Expected unresolved entry") } catch {}
        let logs = try await store.recentLogs(), persisted = try await store.loadDraft()
        XCTAssertTrue(logs.isEmpty); XCTAssertEqual(persisted, draft)
    }
    func testBarcodeSavedAndFoundOffline() async throws {
        let path = file(), food = testFood()
        let store = try LibraryStore(path: path)
        try await store.saveFood(food)
        let reopened = try LibraryStore(path: path)
        let cached = try await reopened.food(barcode: food.barcode!)
        XCTAssertEqual(cached, food)
    }
    func testDuplicateBarcodeRollsBackEntireCommit() async throws {
        let store = try LibraryStore(path: file())
        let original = testFood(); try await store.saveFood(original)
        var collision = original; collision.id = "test:collision"
        var draft = EntryDraft(); draft.lines = [DraftLine(query: "valid", food: original), DraftLine(query: "collision", food: collision)]
        do { _ = try await store.commit(draft); XCTFail("Expected barcode conflict") } catch {}
        let logs = try await store.recentLogs()
        XCTAssertTrue(logs.isEmpty)
    }
    func testRecipeAndDraftPersistAfterReopen() async throws {
        let path = file(), store = try LibraryStore(path: path)
        let recipe = Recipe(name: "Test bake", ingredients: [Ingredient(food: testFood(), quantity: 140)], steps: ["Stir", "Bake"], servings: 6)
        try await store.saveRecipe(recipe)
        var draft = EntryDraft(); draft.text = "15,5g pesto"; try await store.saveDraft(draft)
        let reopened = try LibraryStore(path: path)
        let recipes = try await reopened.recipes(), persisted = try await reopened.loadDraft()
        XCTAssertEqual(recipes, [recipe]); XCTAssertEqual(persisted, draft)
    }
    func testExportRestoreAndUndo() async throws {
        let store = try LibraryStore(path: file())
        var draft = EntryDraft(); draft.lines = [DraftLine(query: "pesto", food: testFood())]
        let entries = try await store.commit(draft)
        let archive = try await store.exportData()
        let restored = try LibraryStore(path: file())
        try await restored.restoreData(archive); try await restored.restoreData(archive)
        let logs = try await restored.recentLogs()
        XCTAssertEqual(logs, entries)
        try await restored.deleteLogs(ids: entries.map(\.id))
        let remaining = try await restored.recentLogs()
        XCTAssertTrue(remaining.isEmpty)
    }
    func testSearchUsesAliasesAndRejectsUnrelatedTerms() async throws {
        let store = try LibraryStore(path: file()); try await store.saveFood(testFood())
        let alias = try await store.search("basil sauce"), unrelated = try await store.search("pasta sauce")
        XCTAssertEqual(alias.first?.food.name, "Testpesto"); XCTAssertTrue(unrelated.isEmpty)
    }
    func testFutureSchemaRefusesToOpen() throws {
        let path = file()
        let db = try Database(path: path)
        try db.execute("PRAGMA user_version=99")
        XCTAssertThrowsError(try LibraryStore(path: path))
        XCTAssertEqual(try db.rows("PRAGMA user_version")[0][0], "99")
    }
    func testSearchPerformanceDiagnostic() async throws {
        let store = try LibraryStore(path: file()); try await store.importCatalogIfNeeded()
        let start = Date()
        for _ in 0..<20 { _ = try await store.search("kylling"); _ = try await store.search("olive oil") }
        let average = Date().timeIntervalSince(start) * 1000 / 40
        print("Search average over 40 warm native queries: \(average) ms; diagnostic, not an iPhone benchmark")
    }
}
