import Foundation

public enum DomainError: Error, LocalizedError {
    case invalidQuantity, missingConversion, invalidFood, emptyRecipe, invalidPortion, unresolvedEntry
    public var errorDescription: String? {
        switch self {
        case .invalidQuantity: return "Skriv en gyldig mengde større enn null."
        case .missingConversion: return "Denne enheten mangler en bekreftet omregning for matvaren. Bruk gram eller referanseenheten."
        case .invalidFood: return "Kontroller navn og næringsverdier. Ukjente verdier kan stå tomme."
        case .emptyRecipe: return "Legg til minst én ingrediens."
        case .invalidPortion: return "Kontroller antall porsjoner eller ferdig vekt."
        case .unresolvedEntry: return "Velg en matvare og kontroller mengden på hver linje."
        }
    }
}

public enum Numbers {
    /// Strict decimal parsing: no partial input, exponents, grouping or ambiguous separators.
    public static func parse(_ text: String) -> Decimal? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.range(of: #"^\d+(?:[.,]\d{1,6})?$"#, options: .regularExpression) != nil else { return nil }
        return Decimal(string: value.replacingOccurrences(of: ",", with: "."), locale: Locale(identifier: "en_US_POSIX"))
    }
    public static func display(_ value: Decimal?, digits: Int = 1) -> String {
        guard let value else { return "–" }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "nb_NO")
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = digits
        return formatter.string(from: NSDecimalNumber(decimal: value)) ?? "–"
    }
}

public struct Nutrition: Codable, Equatable, Sendable {
    public var kcal: Decimal?
    public var protein: Decimal?
    public var carbohydrate: Decimal?
    public var fat: Decimal?
    public init(kcal: Decimal? = nil, protein: Decimal? = nil, carbohydrate: Decimal? = nil, fat: Decimal? = nil) {
        self.kcal = kcal; self.protein = protein; self.carbohydrate = carbohydrate; self.fat = fat
    }
    public var isComplete: Bool { [kcal, protein, carbohydrate, fat].allSatisfy { $0 != nil } }
    public func scaled(by factor: Decimal) -> Nutrition {
        Nutrition(kcal: kcal.map { $0 * factor }, protein: protein.map { $0 * factor },
                  carbohydrate: carbohydrate.map { $0 * factor }, fat: fat.map { $0 * factor })
    }
    /// Unknown values propagate per nutrient; a partial total must never masquerade as a complete total.
    public static func total(_ values: [Nutrition]) -> Nutrition {
        func sum(_ key: KeyPath<Nutrition, Decimal?>) -> Decimal? {
            var total: Decimal = 0
            for item in values { guard let value = item[keyPath: key] else { return nil }; total += value }
            return total
        }
        return Nutrition(kcal: sum(\.kcal), protein: sum(\.protein), carbohydrate: sum(\.carbohydrate), fat: sum(\.fat))
    }
}

public enum FoodSource: String, Codable, Sendable { case matvaretabellen, manual, confirmedOCR, openFoodFacts }
public struct Provenance: Codable, Equatable, Sendable {
    public var source: FoodSource
    public var sourceID: String
    public var sourceURL: String?
    public var retrievedAt: String
    public var nutrientSources: [String: String]
    public init(source: FoodSource, sourceID: String, sourceURL: String? = nil, retrievedAt: String,
                nutrientSources: [String: String] = [:]) {
        self.source = source; self.sourceID = sourceID; self.sourceURL = sourceURL
        self.retrievedAt = retrievedAt; self.nutrientSources = nutrientSources
    }
}
public enum FoodUnit: String, Codable, CaseIterable, Sendable { case g, kg, ml, l, tsp, tbsp, piece }
public enum ReferenceUnit: String, Codable, Sendable { case g, ml }
public struct Food: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var aliases: [String]
    public var barcode: String?
    public var referenceUnit: ReferenceUnit
    public var nutrition: Nutrition // per 100 g or 100 ml, never per an implicit serving
    public var gramsPerMilliliter: Decimal?
    public var gramsPerMeasure: [String: Decimal]
    public var provenance: Provenance
    public init(id: String = UUID().uuidString, name: String, aliases: [String] = [], barcode: String? = nil,
                referenceUnit: ReferenceUnit = .g, nutrition: Nutrition, gramsPerMilliliter: Decimal? = nil,
                gramsPerMeasure: [String: Decimal] = [:], provenance: Provenance) {
        self.id = id; self.name = name; self.aliases = aliases; self.barcode = barcode
        self.referenceUnit = referenceUnit; self.nutrition = nutrition
        self.gramsPerMilliliter = gramsPerMilliliter; self.gramsPerMeasure = gramsPerMeasure; self.provenance = provenance
    }
    public func validate() throws {
        guard !id.isEmpty, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw DomainError.invalidFood }
        for value in [nutrition.kcal, nutrition.protein, nutrition.carbohydrate, nutrition.fat].compactMap({ $0 }) {
            guard !value.isNaN, value >= 0, value <= 10000 else { throw DomainError.invalidFood }
        }
        if referenceUnit == .g {
            if let kcal = nutrition.kcal, kcal > 1000 { throw DomainError.invalidFood }
            for value in [nutrition.protein, nutrition.carbohydrate, nutrition.fat].compactMap({ $0 }) {
                guard value <= 100 else { throw DomainError.invalidFood }
            }
            // Allow small label/source rounding differences, not more than 100 g of macros in 100 g of food.
            let knownMacros = [nutrition.protein, nutrition.carbohydrate, nutrition.fat].compactMap { $0 }.reduce(Decimal(0), +)
            guard knownMacros <= 101 else { throw DomainError.invalidFood }
        }
        if let density = gramsPerMilliliter, density <= 0 || density.isNaN { throw DomainError.invalidFood }
        guard gramsPerMeasure.values.allSatisfy({ !$0.isNaN && $0 > 0 }) else { throw DomainError.invalidFood }
    }
    public func nutrition(for quantity: Decimal, unit: FoodUnit) throws -> Nutrition {
        try validate()
        guard !quantity.isNaN, quantity > 0, quantity <= 1_000_000 else { throw DomainError.invalidQuantity }
        var grams: Decimal?
        var milliliters: Decimal?
        switch unit {
        case .g: grams = quantity
        case .kg: grams = quantity * 1000
        case .ml: milliliters = quantity
        case .l: milliliters = quantity * 1000
        case .tsp, .tbsp, .piece:
            guard let factor = gramsPerMeasure[unit.rawValue] else { throw DomainError.missingConversion }
            grams = quantity * factor
        }
        let reference: Decimal
        switch referenceUnit {
        case .g:
            if let grams { reference = grams }
            else if let milliliters, let density = gramsPerMilliliter { reference = milliliters * density }
            else { throw DomainError.missingConversion }
        case .ml:
            if let milliliters { reference = milliliters }
            else if let grams, let density = gramsPerMilliliter { reference = grams / density }
            else { throw DomainError.missingConversion }
        }
        return nutrition.scaled(by: reference / 100)
    }
}

public struct Ingredient: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var food: Food // explicit snapshot, refreshed only by a future deliberate replace action
    public var quantity: Decimal
    public var unit: FoodUnit
    public init(id: UUID = UUID(), food: Food, quantity: Decimal, unit: FoodUnit = .g) {
        self.id = id; self.food = food; self.quantity = quantity; self.unit = unit
    }
    public func nutrition() throws -> Nutrition { try food.nutrition(for: quantity, unit: unit) }
}
public struct Recipe: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var name: String
    public var ingredients: [Ingredient]
    public var steps: [String]
    public var servings: Decimal
    public var cookedWeightGrams: Decimal?
    public init(id: UUID = UUID(), name: String, ingredients: [Ingredient], steps: [String] = [],
                servings: Decimal = 1, cookedWeightGrams: Decimal? = nil) {
        self.id = id; self.name = name; self.ingredients = ingredients; self.steps = steps
        self.servings = servings; self.cookedWeightGrams = cookedWeightGrams
    }
    public func total() throws -> Nutrition {
        guard !ingredients.isEmpty, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw DomainError.emptyRecipe }
        guard !servings.isNaN, servings > 0, servings <= 10000 else { throw DomainError.invalidPortion }
        if let weight = cookedWeightGrams, weight.isNaN || weight <= 0 { throw DomainError.invalidPortion }
        return Nutrition.total(try ingredients.map { try $0.nutrition() })
    }
    public func perServing() throws -> Nutrition { try total().scaled(by: 1 / servings) }
    public func portion(grams: Decimal) throws -> Nutrition {
        guard !grams.isNaN, grams > 0, let cookedWeightGrams, cookedWeightGrams > 0 else { throw DomainError.invalidPortion }
        return try total().scaled(by: grams / cookedWeightGrams)
    }
    public func duplicate() -> Recipe {
        Recipe(name: name + " (kopi)", ingredients: ingredients.map { Ingredient(food: $0.food, quantity: $0.quantity, unit: $0.unit) },
               steps: steps, servings: servings, cookedWeightGrams: cookedWeightGrams)
    }
}
public enum Meal: String, Codable, CaseIterable, Sendable {
    case breakfast = "Frokost", lunch = "Lunsj", dinner = "Middag", other = "Annet"
}
public struct LogEntry: Codable, Identifiable, Equatable, Sendable {
    public let id: UUID
    public let ingredient: Ingredient
    public let nutrition: Nutrition
    public let recordedAt: Date
    public let meal: Meal
    public init(id: UUID = UUID(), ingredient: Ingredient, recordedAt: Date = Date(), meal: Meal) throws {
        self.id = id; self.ingredient = ingredient; self.recordedAt = recordedAt; self.meal = meal
        self.nutrition = try ingredient.nutrition()
    }
}
public struct DraftLine: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID = UUID()
    public var query: String
    public var quantityText: String
    public var unit: FoodUnit
    public var food: Food?
    public init(query: String, quantityText: String = "100", unit: FoodUnit = .g, food: Food? = nil) {
        self.query = query; self.quantityText = quantityText; self.unit = unit; self.food = food
    }
    public func ingredient() throws -> Ingredient {
        guard let food, let quantity = Numbers.parse(quantityText) else { throw DomainError.unresolvedEntry }
        _ = try food.nutrition(for: quantity, unit: unit)
        return Ingredient(food: food, quantity: quantity, unit: unit)
    }
}
public struct EntryDraft: Codable, Equatable, Sendable {
    public var id = UUID()
    public var text = ""
    public var lines: [DraftLine] = []
    public var meal: Meal = .dinner
    public init() {}
}
