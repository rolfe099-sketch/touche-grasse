import Foundation
import CSQLite

public struct StorageError: Error, LocalizedError {
    public let message: String
    public init(message: String) { self.message = message }
    public var errorDescription: String? { "Kunne ikke lagre eller lese data: \(message)" }
}

/// Owned by LibraryStore's actor; no SQLite handle crosses its isolation boundary.
final class Database {
    private var handle: OpaquePointer?
    init(path: String) throws {
        guard sqlite3_open_v2(path, &handle, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "Database unavailable"
            sqlite3_close(handle); handle = nil
            throw StorageError(message: message)
        }
        sqlite3_busy_timeout(handle, 5000)
        try execute("PRAGMA journal_mode=WAL;")
        try execute("PRAGMA synchronous=FULL;")
        try execute("PRAGMA foreign_keys=ON;")
        let version = Int(try rows("PRAGMA user_version").first?.first ?? "0") ?? 0
        guard version <= 1 else { throw StorageError(message: "Databasen er fra en nyere appversjon. Ingen data er endret.") }
        if version == 0 {
            guard let url = Bundle.module.url(forResource: "001_initial", withExtension: "sql") else {
                throw StorageError(message: "Migration resource missing")
            }
            try transaction { try execute(String(contentsOf: url, encoding: .utf8)) }
        }
    }
    deinit { sqlite3_close(handle) }
    func execute(_ sql: String) throws {
        guard sqlite3_exec(handle, sql, nil, nil, nil) == SQLITE_OK else { throw error() }
    }
    func run(_ sql: String, _ values: [String] = []) throws {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw error() }
    }
    func rows(_ sql: String, _ values: [String] = []) throws -> [[String]] {
        let statement = try prepare(sql, values)
        defer { sqlite3_finalize(statement) }
        var result: [[String]] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return result }
            guard status == SQLITE_ROW else { throw error() }
            result.append((0..<sqlite3_column_count(statement)).map { column in
                sqlite3_column_text(statement, column).map { String(cString: $0) } ?? ""
            })
        }
    }
    func transaction<T>(_ action: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do { let value = try action(); try execute("COMMIT"); return value }
        catch { try? execute("ROLLBACK"); throw error }
    }
    private func prepare(_ sql: String, _ values: [String]) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw error() }
        for (index, value) in values.enumerated() {
            let result = value.withCString { sqlite3_bind_text(statement, Int32(index + 1), $0, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self)) }
            if result != SQLITE_OK { sqlite3_finalize(statement); throw error() }
        }
        return statement
    }
    private func error() -> StorageError { StorageError(message: String(cString: sqlite3_errmsg(handle))) }
}

public struct SearchResult: Identifiable, Sendable {
    public let food: Food
    public let saved: Bool
    public var id: String { food.id }
}

public actor LibraryStore {
    private let db: Database
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    public init(path: String) throws { db = try Database(path: path) }

    public static func bundledCatalog() throws -> [Food] {
        guard let url = Bundle.module.url(forResource: "catalog", withExtension: "json") else { throw StorageError(message: "Food catalog missing") }
        return try JSONDecoder().decode([Food].self, from: Data(contentsOf: url))
    }
    public func importCatalogIfNeeded() throws {
        guard try db.rows("SELECT id FROM foods WHERE id LIKE 'mvt:%' LIMIT 1").isEmpty else { return }
        let foods = try Self.bundledCatalog()
        try db.transaction { for food in foods { try writeFood(food, saved: false) } }
    }
    public func saveFood(_ food: Food) throws { try writeFood(food, saved: true) }
    private func writeFood(_ food: Food, saved: Bool) throws {
        try food.validate()
        try db.run("""
            INSERT INTO foods(id,name,search_text,barcode,saved,payload) VALUES (?,?,?,NULLIF(?,''),?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,search_text=excluded.search_text,
            barcode=excluded.barcode,saved=MAX(foods.saved,excluded.saved),payload=excluded.payload
            """, [food.id, food.name, SearchText.document(food), food.barcode ?? "", saved ? "1" : "0", try json(food)])
    }
    public func food(barcode: String) throws -> Food? {
        try db.rows("SELECT payload FROM foods WHERE barcode=?", [barcode]).first.map { try decode(Food.self, $0[0]) }
    }
    public func search(_ query: String, savedOnly: Bool = false) throws -> [SearchResult] {
        let query = String(query.prefix(200))
        let normalized = SearchText.normalize(query)
        let savedFilter = savedOnly ? "AND f.saved=1" : ""
        let columns = "SELECT f.payload,f.saved FROM foods f"
        let order = """
            ORDER BY CASE WHEN f.search_text=? AND f.saved=1 THEN 0 ELSE 1 END,
            f.saved DESC,
            COALESCE((SELECT MAX(recorded_at) FROM logs WHERE food_id=f.id),0) DESC,
            (SELECT COUNT(*) FROM logs WHERE food_id=f.id) DESC,
            length(f.name), f.name
            """
        var rows: [[String]]
        if normalized.isEmpty {
            rows = try db.rows("\(columns) WHERE 1=1 \(savedFilter) \(order) LIMIT 40", [normalized])
        } else {
            let fts = SearchText.ftsQuery(query)
            rows = try db.rows("\(columns) WHERE f.id IN (SELECT id FROM food_search WHERE food_search MATCH ?) \(savedFilter) \(order) LIMIT 80", [fts, normalized])
            if rows.isEmpty {
                rows = try db.rows("\(columns) WHERE 1=1 \(savedFilter) \(order)", [normalized]).filter { row in
                    guard let food = try? decode(Food.self, row[0]) else { return false }
                    return SearchText.matches(query, document: SearchText.document(food))
                }
            }
        }
        let results = try rows.map { SearchResult(food: try decode(Food.self, $0[0]), saved: $0[1] == "1") }
        // Exact names/aliases always precede prefix/fuzzy matches within the saved-library tier.
        return Array(results.sorted { lhs, rhs in
            func score(_ result: SearchResult) -> Int {
                let exact = ([result.food.name] + result.food.aliases + [result.food.barcode ?? ""]).contains { SearchText.normalize($0) == normalized }
                return (result.saved ? 100 : 0) + (exact && !normalized.isEmpty ? 50 : 0)
            }
            return score(lhs) > score(rhs)
        }.prefix(40))
    }
    public func saveDraft(_ draft: EntryDraft) throws {
        try db.run("INSERT INTO draft(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [try json(draft)])
    }
    public func loadDraft() throws -> EntryDraft {
        try db.rows("SELECT payload FROM draft WHERE id=1").first.map { try decode(EntryDraft.self, $0[0]) } ?? EntryDraft()
    }
    public func commit(_ draft: EntryDraft, at date: Date = Date()) throws -> [LogEntry] {
        guard !draft.lines.isEmpty else { throw DomainError.unresolvedEntry }
        let entries = try draft.lines.map { try LogEntry(id: $0.id, ingredient: $0.ingredient(), recordedAt: date, meal: draft.meal) }
        try db.transaction {
            for entry in entries {
                try writeFood(entry.ingredient.food, saved: true)
                try insertLog(entry)
            }
            try db.run("DELETE FROM draft WHERE id=1")
        }
        return entries
    }
    private func insertLog(_ entry: LogEntry) throws {
        // Same draft line ID makes retrying a completed batch idempotent.
        try db.run("INSERT OR IGNORE INTO logs(id,food_id,recorded_at,payload) VALUES(?,?,?,?)",
                   [entry.id.uuidString, entry.ingredient.food.id, String(entry.recordedAt.timeIntervalSince1970), try json(entry)])
    }
    public func repeatEntry(_ entry: LogEntry, at date: Date = Date()) throws -> LogEntry {
        let repeated = try LogEntry(ingredient: entry.ingredient, recordedAt: date, meal: entry.meal)
        try insertLog(repeated)
        return repeated
    }
    public func logs(from start: Date, to end: Date) throws -> [LogEntry] {
        try db.rows("SELECT payload FROM logs WHERE recorded_at>=? AND recorded_at<? ORDER BY recorded_at DESC,id",
                    [String(start.timeIntervalSince1970), String(end.timeIntervalSince1970)]).map { try decode(LogEntry.self, $0[0]) }
    }
    public func recentLogs() throws -> [LogEntry] {
        try db.rows("SELECT payload FROM logs ORDER BY recorded_at DESC LIMIT 12").map { try decode(LogEntry.self, $0[0]) }
    }
    public func deleteLogs(ids: [UUID]) throws {
        try db.transaction { for id in ids { try db.run("DELETE FROM logs WHERE id=?", [id.uuidString]) } }
    }
    public func saveRecipe(_ recipe: Recipe) throws {
        _ = try recipe.total()
        try db.run("INSERT INTO recipes(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [recipe.id.uuidString, try json(recipe)])
    }
    public func recipes() throws -> [Recipe] {
        try db.rows("SELECT payload FROM recipes ORDER BY rowid DESC").map { try decode(Recipe.self, $0[0]) }
    }
    public func recordSearchEvent(query: String, kind: String) throws {
        try db.transaction {
            try db.run("INSERT INTO search_events(occurred_at,kind,query) VALUES(?,?,?)", [String(Date().timeIntervalSince1970), kind, String(query.prefix(200))])
            try db.run("DELETE FROM search_events WHERE id NOT IN (SELECT id FROM search_events ORDER BY id DESC LIMIT 100)")
        }
    }
    public func clearSearchHistory() throws { try db.run("DELETE FROM search_events") }
    public func exportData() throws -> Data {
        try db.transaction {
            let archive = Archive(version: 1,
                foods: try db.rows("SELECT payload FROM foods WHERE saved=1").map { try decode(Food.self, $0[0]) },
                logs: try db.rows("SELECT payload FROM logs").map { try decode(LogEntry.self, $0[0]) },
                recipes: try recipes(), draft: try loadDraft())
            return try encoder.encode(archive)
        }
    }
    /// Merge restoration preserves existing log IDs; all validation happens before a transaction commits.
    public func restoreData(_ data: Data) throws {
        guard data.count <= 50_000_000 else { throw StorageError(message: "Filen er for stor.") }
        let archive = try decoder.decode(Archive.self, from: data)
        guard archive.version == 1 else { throw StorageError(message: "Ukjent eksportversjon.") }
        try db.transaction {
            for food in archive.foods { try writeFood(food, saved: true) }
            for entry in archive.logs {
                guard entry.nutrition == (try entry.ingredient.nutrition()) else { throw DomainError.invalidFood }
                try insertLog(entry)
            }
            for recipe in archive.recipes { try saveRecipe(recipe) }
            // Never replace an active draft when restoring a backup.
            let current = try loadDraft()
            if current.lines.isEmpty && current.text.isEmpty { try saveDraft(archive.draft) }
        }
    }
    private func json<T: Encodable>(_ value: T) throws -> String { String(decoding: try encoder.encode(value), as: UTF8.self) }
    private func decode<T: Decodable>(_ type: T.Type, _ value: String) throws -> T { try decoder.decode(type, from: Data(value.utf8)) }
}
private struct Archive: Codable {
    var version: Int
    var foods: [Food]
    var logs: [LogEntry]
    var recipes: [Recipe]
    var draft: EntryDraft
}
