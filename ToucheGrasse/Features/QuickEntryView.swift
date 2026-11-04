import SwiftUI
import ToucheGrasseCore

struct QuickEntryView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var activeLine: UUID?
    @State private var query = ""
    @State private var results: [SearchResult] = []
    @State private var manualPresented = false
    @State private var recipePresented = false
    var body: some View {
        NavigationStack {
            List {
                Section {
                    TextField("200g kylling, 100g pasta", text: $model.draft.text, axis: .vertical)
                        .lineLimit(1...4).accessibilityIdentifier("entry.text")
                    Button("Del opp i matvarer") { model.parseText() }
                        .disabled(model.draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("entry.parse")
                    Text("Velg riktig matvare for hver linje. Mengdene blir stående når du retter et treff.")
                        .font(.footnote).foregroundStyle(TG.secondary)
                } header: { Text("Skriv det du spiste") }
                Section("Til registrering") {
                    if model.draft.lines.isEmpty {
                        EmptyNote(title: "En liten liste er nok", detail: "Skriv flere matvarer over, eller finn én nedenfor.")
                    }
                    ForEach($model.draft.lines) { $line in
                        VStack(alignment: .leading, spacing: 8) {
                            Button {
                                activeLine = line.id
                                query = line.query
                            } label: {
                                HStack {
                                    Text(line.food?.name ?? line.query).multilineTextAlignment(.leading)
                                    Spacer()
                                    Image(systemName: line.food == nil ? "magnifyingglass" : "arrow.triangle.2.circlepath")
                                }.frame(minHeight: 44)
                            }.buttonStyle(.borderless)
                            if line.food == nil { Text("Velg matvare før du logger").font(.caption).foregroundStyle(TG.error) }
                            HStack {
                                TextField("Mengde", text: $line.quantityText).keyboardType(.decimalPad)
                                    .textFieldStyle(.roundedBorder).monospacedDigit().frame(minHeight: 44)
                                    .accessibilityLabel("Mengde for \(line.query)").accessibilityIdentifier("entry.quantity")
                                Picker("Enhet", selection: $line.unit) {
                                    ForEach(FoodUnit.allCases, id: \.self) { unit in Text(unit.rawValue).tag(unit) }
                                }.pickerStyle(.menu).accessibilityLabel("Enhet for \(line.query)")
                                Button(role: .destructive) { model.draft.lines.removeAll { $0.id == line.id } } label: {
                                    Image(systemName: "minus.circle").frame(width: 44, height: 44)
                                }.buttonStyle(.borderless).accessibilityLabel("Fjern \(line.query)")
                            }
                            if let ingredient = try? line.ingredient(), let nutrition = try? ingredient.nutrition() {
                                Text("\(Numbers.display(nutrition.kcal, digits: 0)) kcal · \(Numbers.display(nutrition.protein)) g protein")
                                    .font(.caption).monospacedDigit().foregroundStyle(TG.secondary)
                            } else if line.food != nil {
                                Text("Kontroller mengde og enhet. Omregning kan mangle.").font(.caption).foregroundStyle(TG.error)
                            }
                        }.padding(.vertical, 4)
                    }
                }
                Section {
                    if activeLine != nil {
                        Button("Avslutt bytte av matvare") { activeLine = nil; query = "" }
                    }
                    TextField("Søk etter matvare", text: $query).accessibilityIdentifier("entry.search")
                        .submitLabel(.search)
                        .onSubmit {
                            if results.isEmpty { Task { try? await model.store?.recordSearchEvent(query: query, kind: "no_results") } }
                        }
                    ForEach(results.prefix(8)) { result in
                        Button {
                            if let activeLine, let index = model.draft.lines.firstIndex(where: { $0.id == activeLine }) {
                                model.draft.lines[index].food = result.food
                                // Quantity and selected unit are deliberately retained.
                                Task { try? await model.store?.recordSearchEvent(query: query, kind: "selected_correction") }
                            } else {
                                model.draft.lines.append(DraftLine(query: result.food.name, unit: result.food.referenceUnit == .g ? .g : .ml, food: result.food))
                            }
                            activeLine = nil; query = ""
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(result.food.name).foregroundStyle(TG.ink)
                                SourceLabel(food: result.food)
                            }.frame(minHeight: 44, alignment: .leading)
                        }.buttonStyle(.borderless).accessibilityIdentifier("entry.result.\(result.id)")
                    }
                    if results.isEmpty && !query.isEmpty { Text("Ingen sikre treff. Prøv et annet navn eller legg inn selv.").font(.footnote).foregroundStyle(TG.secondary) }
                    Button("Opprett egen matvare") { manualPresented = true }.frame(minHeight: 44)
                } header: { Text(activeLine == nil ? "Finn mat · lokalt" : "Velg riktig treff") }
                if !model.recent.isEmpty && model.draft.lines.isEmpty {
                    Section("Bruk igjen") {
                        ForEach(model.recent.prefix(3)) { entry in
                            Button {
                                model.draft.lines.append(DraftLine(query: entry.ingredient.food.name,
                                    quantityText: NSDecimalNumber(decimal: entry.ingredient.quantity).stringValue,
                                    unit: entry.ingredient.unit, food: entry.ingredient.food))
                            } label: { Text("\(entry.ingredient.food.name) · \(Numbers.display(entry.ingredient.quantity)) \(entry.ingredient.unit.rawValue)") }
                        }
                    }
                }
                Section {
                    Picker("Måltid", selection: $model.draft.meal) {
                        ForEach(Meal.allCases, id: \.self) { meal in Text(meal.rawValue).tag(meal) }
                    }
                    Button("Lagre som oppskrift") { recipePresented = true }.disabled(!valid)
                    Text("Registrering legges til i dag. Uferdige linjer beholdes når du lukker.").font(.footnote).foregroundStyle(TG.secondary)
                }
            }.scrollContentBackground(.hidden).background(TG.background)
                .navigationTitle("Legg til mat").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Lukk") { dismiss() }.disabled(model.busy) } }
                .safeAreaInset(edge: .bottom) {
                    Button { Task { await model.commit() } } label: {
                        HStack {
                            if model.busy { ProgressView().tint(.white) }
                            Text(model.draft.lines.count == 1 ? "Logg 1 matvare i dag" : "Logg \(model.draft.lines.count) matvarer i dag").font(.headline)
                        }
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }.buttonStyle(.borderedProminent).disabled(!valid || model.busy)
                        .accessibilityIdentifier("entry.commit").padding().background(TG.background)
                }
                .disabled(model.busy).interactiveDismissDisabled(model.busy)
                .task(id: query) {
                    do {
                        let found = try await model.store?.search(query) ?? []
                        guard !Task.isCancelled else { return }
                        results = found
                    } catch { if !Task.isCancelled { model.errorMessage = error.localizedDescription } }
                }
                .sheet(isPresented: $manualPresented) { ManualFoodView() }
                .sheet(isPresented: $recipePresented) {
                    RecipeEditor(recipe: Recipe(name: "", ingredients: model.draft.lines.compactMap { try? $0.ingredient() }))
                }
        }
    }
    private var valid: Bool {
        !model.draft.lines.isEmpty && model.draft.lines.allSatisfy { (try? $0.ingredient()) != nil } && model.draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
