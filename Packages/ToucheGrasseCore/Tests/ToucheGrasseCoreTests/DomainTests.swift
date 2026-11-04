import XCTest
@testable import ToucheGrasseCore

final class DomainTests: XCTestCase {
    func food(nutrition: Nutrition = Nutrition(kcal: 120, protein: 24, carbohydrate: 0, fat: 2)) -> Food {
        Food(name: "Test chicken — synthetic values", nutrition: nutrition,
             provenance: Provenance(source: .manual, sourceID: "test", retrievedAt: "2026-10-22"))
    }
    func testNorwegianDecimalsAndInvalidInput() {
        XCTAssertEqual(Numbers.parse(" 15,5 "), Decimal(string: "15.5"))
        for value in ["", "NaN", "-1", "1,2,3", "1e3", "10 g", "1.2.3"] { XCTAssertNil(Numbers.parse(value), value) }
    }
    func testDeterministicNutritionScaling() throws {
        let nutrition = try food().nutrition(for: Decimal(string: "250.5")!, unit: .g)
        XCTAssertEqual(nutrition.kcal, Decimal(string: "300.6"))
        XCTAssertEqual(nutrition.protein, Decimal(string: "60.12"))
    }
    func testKilogramsMatchGrams() throws {
        XCTAssertEqual(try food().nutrition(for: 1200, unit: .g), try food().nutrition(for: Decimal(string: "1.2")!, unit: .kg))
    }
    func testUnknownDoesNotBecomeZero() {
        let total = Nutrition.total([Nutrition(kcal: 100, protein: nil, carbohydrate: 5, fat: 2), Nutrition(kcal: 20, protein: 5, carbohydrate: 0, fat: 0)])
        XCTAssertEqual(total.kcal, 120); XCTAssertNil(total.protein); XCTAssertEqual(total.carbohydrate, 5)
    }
    func testEmptyDayHasZeroTotal() {
        XCTAssertEqual(Nutrition.total([]), Nutrition(kcal: 0, protein: 0, carbohydrate: 0, fat: 0))
    }
    func testVolumeRequiresIngredientSpecificDensity() throws {
        var oil = food(nutrition: Nutrition(kcal: 900, protein: 0, carbohydrate: 0, fat: 100))
        XCTAssertThrowsError(try oil.nutrition(for: 10, unit: .ml))
        XCTAssertThrowsError(try oil.nutrition(for: 1, unit: .tbsp))
        oil.gramsPerMilliliter = Decimal(string: "0.91")
        oil.gramsPerMeasure["tbsp"] = Decimal(string: "13.65")
        XCTAssertEqual(try oil.nutrition(for: 10, unit: .ml).fat, Decimal(string: "9.1"))
        XCTAssertEqual(try oil.nutrition(for: 1, unit: .tbsp).fat, Decimal(string: "13.65"))
    }
    func testPer100mlDoesNotPretendToBeGrams() throws {
        var drink = food(); drink.referenceUnit = .ml
        XCTAssertEqual(try drink.nutrition(for: 1, unit: .l).kcal, 1200)
        XCTAssertThrowsError(try drink.nutrition(for: 100, unit: .g))
    }
    func testInvalidQuantitiesFail() {
        for quantity in [Decimal(0), Decimal(-1), Decimal(1_000_001), Decimal.nan] { XCTAssertThrowsError(try food().nutrition(for: quantity, unit: .g)) }
        XCTAssertThrowsError(try food(nutrition: Nutrition(kcal: 1200)).validate())
        XCTAssertThrowsError(try food(nutrition: Nutrition(protein: 60, carbohydrate: 60, fat: 0)).validate())
    }
    func testRecipeSixServingsAndCookedWeight() throws {
        var recipe = Recipe(name: "Test batch", ingredients: [Ingredient(food: food(), quantity: 1200)], servings: 6)
        XCTAssertEqual(try recipe.total().kcal, 1440)
        XCTAssertEqual(try recipe.perServing().kcal, 240)
        XCTAssertThrowsError(try recipe.portion(grams: 150))
        recipe.cookedWeightGrams = 900
        XCTAssertEqual(try recipe.portion(grams: 150).kcal, 240)
        XCTAssertEqual(try recipe.total().kcal, 1440, "Water loss must not remove energy")
    }
    func testRecipeQuantityCorrectionAndDuplication() throws {
        var recipe = Recipe(name: "Batch", ingredients: [Ingredient(food: food(), quantity: 200)], steps: ["Cook"], servings: 2)
        let original = recipe.duplicate()
        recipe.ingredients[0].quantity = 250
        XCTAssertNotEqual(original.id, recipe.id)
        XCTAssertNotEqual(original.ingredients[0].id, recipe.ingredients[0].id)
        XCTAssertEqual(original.ingredients[0].quantity, 200)
        XCTAssertEqual(try recipe.perServing().kcal, 150)
    }
    func testZeroServingsRejected() {
        let recipe = Recipe(name: "Batch", ingredients: [Ingredient(food: food(), quantity: 100)], servings: 0)
        XCTAssertThrowsError(try recipe.perServing())
    }
    func testParserPreservesDecimalComma() {
        let lines = QuickEntryParser.parse("200g kylling, 100g pasta, 15,5g pesto, 10g olivenolje")
        XCTAssertEqual(lines.count, 4)
        XCTAssertEqual(lines[2].quantityText, "15,5")
        XCTAssertEqual(lines[2].query, "pesto")
        XCTAssertTrue(lines.allSatisfy { $0.food == nil })
    }
    func testParserDoesNotInventQuantity() {
        let lines = QuickEntryParser.parse("et stort eple")
        XCTAssertEqual(lines[0].quantityText, "")
        XCTAssertThrowsError(try lines[0].ingredient())
    }
    func testInlineCorrectionRetainsAmountAndIdentity() {
        var line = DraftLine(query: "kylling", quantityText: "250")
        let id = line.id
        line.food = food()
        XCTAssertEqual(line.quantityText, "250"); XCTAssertEqual(line.id, id)
    }
    func testSearchNormalizationTypoCompoundAndStrictRelevance() {
        XCTAssertEqual(SearchText.normalize("Crème fraîche / Ørret"), "creme fraiche orret")
        XCTAssertTrue(SearchText.matches("kyling", document: "Kylling filet rå"))
        XCTAssertTrue(SearchText.matches("kyllingfilet", document: "Kylling filet rå"))
        XCTAssertFalse(SearchText.matches("kylling pasta", document: "Pasta med tomat"))
        XCTAssertEqual(SearchText.ftsQuery("' OR 1=1 --"), "\"or\"* AND \"1\"* AND \"1\"*")
    }
    func testBundledCatalogHasRealSourcesAndEnglishNames() throws {
        let foods = try LibraryStore.bundledCatalog()
        XCTAssertEqual(foods.count, 2121)
        XCTAssertEqual(Set(foods.map(\.id)).count, foods.count)
        let oil = try XCTUnwrap(foods.first { $0.id == "mvt:08.019" })
        XCTAssertEqual(oil.name, "Olivenolje")
        XCTAssertFalse(oil.aliases.isEmpty)
        XCTAssertEqual(oil.provenance.source, .matvaretabellen)
        XCTAssertEqual(oil.provenance.sourceID, "08.019")
        for food in foods { XCTAssertNoThrow(try food.validate()) }
    }
}
