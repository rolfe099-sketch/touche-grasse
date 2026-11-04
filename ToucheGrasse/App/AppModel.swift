import Foundation
import SwiftUI
import UIKit
import ToucheGrasseCore

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var store: LibraryStore?
    @Published var errorMessage: String?
    @Published var isLoading = true
    @Published var busy = false
    @Published var selectedDate = Date()
    @Published var logs: [LogEntry] = []
    @Published var recent: [LogEntry] = []
    @Published var recipes: [Recipe] = []
    @Published var quickEntryPresented = false
    @Published var draft = EntryDraft() { didSet { persistDraft() } }
    @Published var undoIDs: [UUID] = []
    @Published var notice: String?
    private var suppressPersistence = false
    private var draftWrite: Task<Void, Never>?
    private var loadStarted = false

    func start() async {
        guard !loadStarted else { return }
        loadStarted = true; isLoading = true
        do {
            let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            let folder = base.appendingPathComponent("ToucheGrasse", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let filename = ProcessInfo.processInfo.arguments.contains("--ui-testing") ? "ui-tests.sqlite" : "library.sqlite"
            let databaseURL = folder.appendingPathComponent(filename)
            if ProcessInfo.processInfo.arguments.contains("--ui-testing") && ProcessInfo.processInfo.arguments.contains("--reset-test-data") {
                for suffix in ["", "-wal", "-shm"] {
                    let url = URL(fileURLWithPath: databaseURL.path + suffix)
                    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
                }
            }
            let library = try LibraryStore(path: databaseURL.path)
            try await library.importCatalogIfNeeded()
            suppressPersistence = true
            draft = try await library.loadDraft()
            suppressPersistence = false
            store = library
            try await refresh()
        } catch {
            suppressPersistence = false
            errorMessage = error.localizedDescription
            loadStarted = false
        }
        isLoading = false
    }
    private func persistDraft() {
        guard !suppressPersistence, let store else { return }
        let snapshot = draft
        let previous = draftWrite
        draftWrite = Task {
            await previous?.value
            do { try await store.saveDraft(snapshot) }
            catch { errorMessage = error.localizedDescription }
        }
    }
    func refresh() async throws {
        guard let store else { return }
        let start = Calendar.current.startOfDay(for: selectedDate)
        guard let end = Calendar.current.date(byAdding: .day, value: 1, to: start) else { return }
        let entries = try await store.logs(from: start, to: end)
        guard Calendar.current.isDate(selectedDate, inSameDayAs: start) else { return }
        logs = entries
        recent = try await store.recentLogs()
        recipes = try await store.recipes()
    }
    func add(_ food: Food) {
        draft.lines.append(DraftLine(query: food.name, unit: food.referenceUnit == .g ? .g : .ml, food: food))
        quickEntryPresented = true
    }
    func parseText() {
        let lines = QuickEntryParser.parse(draft.text)
        guard !lines.isEmpty else { return }
        draft.lines.append(contentsOf: lines)
        draft.text = ""
    }
    func save(_ food: Food) async {
        do { try await store?.saveFood(food); undoIDs = []; notice = "Lagret i ditt bibliotek" }
        catch { errorMessage = error.localizedDescription }
    }
    func commit() async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        await draftWrite?.value
        do {
            let entries = try await store.commit(draft)
            suppressPersistence = true; draft = EntryDraft(); suppressPersistence = false
            undoIDs = entries.map(\.id)
            selectedDate = Date()
            quickEntryPresented = false
            notice = "Lagt til i dag"
            UISelectionFeedbackGenerator().selectionChanged()
            try await refresh()
        } catch { errorMessage = error.localizedDescription }
    }
    func repeatLog(_ entry: LogEntry) async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        do {
            let repeated = try await store.repeatEntry(entry)
            undoIDs = [repeated.id]; selectedDate = Date(); notice = "Lagt til i dag"
            UISelectionFeedbackGenerator().selectionChanged()
            try await refresh()
        } catch { errorMessage = error.localizedDescription }
    }
    func undo() async {
        guard !busy, let store else { return }
        busy = true; defer { busy = false }
        do { try await store.deleteLogs(ids: undoIDs); undoIDs = []; notice = "Angret"; try await refresh() }
        catch { errorMessage = error.localizedDescription }
    }
    func saveRecipe(_ recipe: Recipe) async -> Bool {
        do { try await store?.saveRecipe(recipe); try await refresh(); undoIDs = []; notice = "Oppskriften er lagret"; return true }
        catch { errorMessage = error.localizedDescription; return false }
    }
    func flushDraft() async { await draftWrite?.value }
    func reloadDraft() async throws {
        guard let store else { return }
        let restored = try await store.loadDraft()
        suppressPersistence = true; draft = restored; suppressPersistence = false
    }
}
