import SwiftUI
import ToucheGrasseCore

struct ManualFoodView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var kcal = ""
    @State private var protein = ""
    @State private var carbohydrate = ""
    @State private var fat = ""
    @State private var barcode = ""
    @State private var reference = ReferenceUnit.g
    @State private var saving = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section("Matvaren") {
                    TextField("Navn", text: $name)
                    TextField("Strekkode (valgfri)", text: $barcode).keyboardType(.numberPad)
                    Picker("Næringsverdier per", selection: $reference) { Text("100 g").tag(ReferenceUnit.g); Text("100 ml").tag(ReferenceUnit.ml) }
                }
                Section {
                    nutrient("Energi · kcal", value: $kcal)
                    nutrient("Protein · g", value: $protein)
                    nutrient("Karbohydrat · g", value: $carbohydrate)
                    nutrient("Fett · g", value: $fat)
                } header: { Text("Skriv av næringsdeklarasjonen") } footer: {
                    Text("La ukjente verdier stå tomme. Null betyr at deklarasjonen faktisk oppgir null. Data lagres som dine egne opplysninger.")
                }
                if let error { Text(error).foregroundStyle(TG.error) }
                Button("Bekreft og legg til") { Task { await save() } }.disabled(saving).accessibilityIdentifier("manual.save")
            }.navigationTitle("Egen matvare").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { dismiss() }.disabled(saving) } }
                .interactiveDismissDisabled(saving || !name.isEmpty || !kcal.isEmpty || !protein.isEmpty || !carbohydrate.isEmpty || !fat.isEmpty || !barcode.isEmpty)
        }
    }
    private func nutrient(_ label: String, value: Binding<String>) -> some View {
        HStack { Text(label); TextField("Ukjent", text: value).keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit() }
    }
    private func save() async {
        saving = true; defer { saving = false }
        do {
            func optional(_ value: String) throws -> Decimal? {
                if value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
                guard let result = Numbers.parse(value) else { throw DomainError.invalidFood }
                return result
            }
            let code = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
            guard code.isEmpty || (code.allSatisfy(\.isNumber) && [8, 12, 13, 14].contains(code.count)) else { throw DomainError.invalidFood }
            let food = try Food(name: name.trimmingCharacters(in: .whitespacesAndNewlines), barcode: code.isEmpty ? nil : code,
                referenceUnit: reference, nutrition: Nutrition(kcal: optional(kcal), protein: optional(protein), carbohydrate: optional(carbohydrate), fat: optional(fat)),
                provenance: Provenance(source: .manual, sourceID: "user", retrievedAt: ISO8601DateFormatter().string(from: Date())))
            try food.validate()
            guard let store = model.store else { return }
            try await store.saveFood(food)
            model.draft.lines.append(DraftLine(query: food.name, unit: reference == .g ? .g : .ml, food: food))
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
