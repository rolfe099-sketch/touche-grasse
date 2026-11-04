import Foundation

public enum SearchText {
    public static func normalize(_ value: String) -> String {
        value.lowercased().replacingOccurrences(of: "æ", with: "ae").replacingOccurrences(of: "ø", with: "o")
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "nb_NO"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }
    public static func tokens(_ value: String) -> [String] { normalize(value).split(separator: " ").map(String.init) }
    public static func document(_ food: Food) -> String {
        normalize(([food.name] + food.aliases + [food.barcode ?? ""]).joined(separator: " "))
    }
    public static func ftsQuery(_ value: String) -> String {
        tokens(String(value.prefix(200))).prefix(12).map { "\"\($0)\"*" }.joined(separator: " AND ")
    }
    /// Conservative fallback: every term must match. Small suffix variations and one edit for long words only.
    public static func matches(_ query: String, document: String) -> Bool {
        let terms = tokens(query)
        let words = tokens(document)
        let compact = words.joined()
        return !terms.isEmpty && terms.allSatisfy { term in
            words.contains { word in
                word.hasPrefix(term) || (term.count >= 5 && word.count >= 5 && oneEditApart(term, word)) ||
                (term.count >= 6 && ["er", "en", "ene"].contains { term == word + $0 || word == term + $0 })
            } || (term.count >= 6 && compact.contains(term))
        }
    }
    static func oneEditApart(_ a: String, _ b: String) -> Bool {
        let a = Array(a), b = Array(b)
        guard abs(a.count - b.count) <= 1 else { return false }
        var i = 0, j = 0, edits = 0
        while i < a.count && j < b.count {
            if a[i] == b[j] { i += 1; j += 1; continue }
            edits += 1
            if edits > 1 { return false }
            if a.count >= b.count { i += 1 }
            if b.count >= a.count { j += 1 }
        }
        return edits + (a.count - i) + (b.count - j) <= 1
    }
}

public enum QuickEntryParser {
    /// Commas between digits are decimals. Other commas/semicolons/newlines delimit entries.
    /// Never resolves food automatically: raw/cooked and brand ambiguity require a choice.
    public static func parse(_ text: String) -> [DraftLine] {
        let separator = try! NSRegularExpression(pattern: #"(?<!\d),|,(?!\d)|[;\n]"#)
        let split = separator.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: "\n")
        let expression = try! NSRegularExpression(pattern: #"^\s*(\d+(?:[.,]\d+)?)\s*(kg|gram|g|ml|liter|l)\s+(.+?)\s*$"#, options: .caseInsensitive)
        return split.split(separator: "\n").compactMap { part in
            let value = String(part).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { return nil }
            guard let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
                  let amount = Range(match.range(at: 1), in: value), let unit = Range(match.range(at: 2), in: value),
                  let name = Range(match.range(at: 3), in: value) else { return DraftLine(query: value, quantityText: "") }
            let symbol = String(value[unit]).lowercased()
            return DraftLine(query: String(value[name]), quantityText: String(value[amount]),
                             unit: FoodUnit(rawValue: symbol == "gram" ? "g" : symbol == "liter" ? "l" : symbol) ?? .g)
        }
    }
}
