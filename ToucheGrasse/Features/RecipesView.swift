import SwiftUI
import ToucheGrasseCore

struct RecipesView: View {
    @EnvironmentObject private var model: AppModel
    @State private var editing: Recipe?
    var body: some View {
        NavigationStack {
            List {
                if model.recipes.isEmpty {
                    Section {
                        EmptyNote(title: "Verdt å lage igjen", detail: "Legg ingredienser i hurtigregistreringen og velg «Lagre som oppskrift». Mengder og næringsgrunnlag følger med.")
                        Button("Legg til ingredienser") { model.quickEntryPresented = true }
                    }
                }
                ForEach(model.recipes) { recipe in
                    Button { editing = recipe } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(recipe.name).font(.headline).foregroundStyle(TG.ink)
                            Text("\(recipe.ingredients.count) ingredienser · \(Numbers.display(recipe.servings)) porsjoner").font(.subheadline).foregroundStyle(TG.secondary)
                            if let nutrition = try? recipe.perServing() {
                                Text("\(Numbers.display(nutrition.kcal, digits: 0)) kcal per porsjon").font(.caption).foregroundStyle(TG.secondary)
                            }
                        }.padding(.vertical, 6)
                    }
                }
            }.scrollContentBackground(.hidden).background(TG.background).navigationTitle("Oppskrifter")
                .toolbar { Button { model.quickEntryPresented = true } label: { Image(systemName: "plus").frame(width: 44, height: 44) }.accessibilityLabel("Ny oppskrift fra ingredienser") }
                .sheet(item: $editing) { RecipeEditor(recipe: $0) }
        }
    }
}

struct RecipeEditor: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State var recipe: Recipe
    @State private var servings = ""
    @State private var cookedWeight = ""
    @State private var steps = ""
    @State private var quantities: [UUID: String] = [:]
    @State private var saving = false
    @State private var validation: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Oppskriften") {
                    TextField("Navn", text: $recipe.name)
                    HStack { Text("Porsjoner"); TextField("Antall", text: $servings).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                    HStack { Text("Ferdig vekt · g"); TextField("Valgfri", text: $cookedWeight).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
                }
                Section("Ingredienser") {
                    ForEach(recipe.ingredients) { ingredient in
                        VStack(alignment: .leading) {
                            Text(ingredient.food.name)
                            HStack {
                                TextField("Mengde", text: Binding(get: { quantities[ingredient.id] ?? "" }, set: { quantities[ingredient.id] = $0 }))
                                    .keyboardType(.decimalPad).monospacedDigit()
                                Text(ingredient.unit.rawValue)
                            }
                        }
                    }
                }
                Section("Fremgangsmåte · ett steg per linje") { TextEditor(text: $steps).frame(minHeight: 140) }
                if let preview = try? editedRecipe(), let nutrition = try? preview.perServing() {
                    Section("Per porsjon") { NutritionStrip(nutrition: nutrition) }
                }
                if let validation { Text(validation).foregroundStyle(TG.error) }
                Section {
                    Button("Lagre oppskrift") { Task { await save(copy: false) } }
                    Button("Lagre som kopi") { Task { await save(copy: true) } }
                }.disabled(saving)
            }.navigationTitle("Oppskrift").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() }.disabled(saving) } }
                .interactiveDismissDisabled(saving)
                .onAppear {
                    servings = NSDecimalNumber(decimal: recipe.servings).stringValue
                    cookedWeight = recipe.cookedWeightGrams.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
                    steps = recipe.steps.joined(separator: "\n")
                    quantities = Dictionary(uniqueKeysWithValues: recipe.ingredients.map { ($0.id, NSDecimalNumber(decimal: $0.quantity).stringValue) })
                }
        }
    }
    private func editedRecipe() throws -> Recipe {
        var result = recipe
        guard let servings = Numbers.parse(servings) else { throw DomainError.invalidPortion }
        result.servings = servings
        if cookedWeight.isEmpty { result.cookedWeightGrams = nil }
        else { guard let weight = Numbers.parse(cookedWeight) else { throw DomainError.invalidPortion }; result.cookedWeightGrams = weight }
        result.steps = steps.split(separator: "\n").map(String.init)
        for index in result.ingredients.indices {
            guard let quantity = Numbers.parse(quantities[result.ingredients[index].id] ?? "") else { throw DomainError.invalidQuantity }
            result.ingredients[index].quantity = quantity
        }
        _ = try result.total()
        return result
    }
    private func save(copy: Bool) async {
        saving = true; defer { saving = false }
        do {
            let value = try editedRecipe()
            if await model.saveRecipe(copy ? value.duplicate() : value) { dismiss() }
        } catch { validation = error.localizedDescription }
    }
}
